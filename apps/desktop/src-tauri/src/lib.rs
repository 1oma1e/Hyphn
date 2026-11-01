//! Hyphn for Windows. The real iPhone talks to `link` over TLS; the window
//! reads snapshots and sends commands. Drop is empty for now (ADR-0020).

mod cam;
mod drop;
mod identity;
mod install;
mod link;
mod net;
mod pairing;
mod proto;
mod status;
mod store;
mod tls;
mod vcam;
mod video;

use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use cam::{Effective, Quality};
use identity::Identity;
use link::{CamStats, CamWanted, Hub, PhoneCam, UiEvent};
use proto::Codec;
use status::StatusView;
use store::{Settings, Store};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("identity: {0}")]
    Identity(String),
}

impl From<Error> for String {
    fn from(e: Error) -> Self {
        e.to_string()
    }
}

struct Inner {
    settings: Settings,
    port: u16,
    /// Keeps the Bonjour announce alive.
    mdns: Option<mdns_sd::ServiceDaemon>,
    /// Where the window reads the Cam picture (`video.rs`).
    video_url: String,
    /// The Windows webcam exists for this session.
    camera: bool,
    /// Why it does not, in plain words.
    camera_error: Option<String>,
    /// Built DLLs and install script, if present.
    native: Option<PathBuf>,
}

struct Hyphn {
    hub: Arc<Hub>,
    inner: Mutex<Inner>,
    vcam_state: tokio::sync::watch::Sender<vcam::VcamState>,
    /// Apps showing the Windows webcam or the OBS source right now.
    vcam_readers: Arc<AtomicUsize>,
}

impl Hyphn {
    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }
}

fn now_unix() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

#[derive(Serialize, Clone)]
struct DeviceView {
    name: String,
    model: String,
    paired_at: u64,
    last_seen: Option<u64>,
    fingerprint: String,
}

#[derive(Serialize, Clone)]
struct CamView {
    live: bool,
    effective: Effective,
    stats: CamStats,
    /// What the iPhone reports about its camera; None when not connected.
    phone: Option<PhoneCam>,
}

#[derive(Serialize, Clone)]
struct VcamView {
    /// The DLL is registered (installed once as admin).
    installed: bool,
    /// The camera exists for this session.
    camera: bool,
    obs: bool,
    obs_present: bool,
    /// Apps showing the camera now.
    in_use: u32,
    can_install: bool,
    error: Option<String>,
}

#[derive(Serialize, Clone)]
struct Snapshot {
    pc_name: String,
    pc_fingerprint: String,
    version: &'static str,
    device: Option<DeviceView>,
    connected: bool,
    status: Option<StatusView>,
    latency_ms: Option<u32>,
    cam: CamView,
    vcam: VcamView,
    pair_seconds_left: u64,
    /// The Drop send in progress or the last one (spec `Drop - Photos vers le PC`).
    drop: link::DropProgress,
    /// Last year/month folders of the photos folder (E9).
    drop_months: Vec<drop::MonthSummary>,
}

fn snapshot(h: &Hyphn) -> Snapshot {
    let hub = &h.hub;
    let v = hub.view();
    let device = hub.store.devices().into_iter().next();
    let vcam = {
        let inner = h.lock();
        VcamView {
            installed: inner.camera || registered_dll().is_some(),
            camera: inner.camera,
            obs: vcam::obs_plugin_installed(),
            obs_present: vcam::obs_present(),
            in_use: h.vcam_readers.load(Ordering::Relaxed) as u32,
            can_install: inner.native.is_some(),
            error: inner.camera_error.clone(),
        }
    };
    let connected = match (&device, v.connected) {
        (Some(d), Some(fp)) => identity::from_hex(&d.fingerprint) == Some(fp),
        _ => false,
    };
    Snapshot {
        pc_name: hub.pc_name.clone(),
        pc_fingerprint: identity::short_hex(&hub.identity.fingerprint),
        version: env!("CARGO_PKG_VERSION"),
        status: device.as_ref().and(v.status),
        latency_ms: if connected { v.rtt_ms } else { None },
        device: device.map(|d| DeviceView {
            fingerprint: identity::from_hex(&d.fingerprint).map(|f| identity::short_hex(&f)).unwrap_or_default(),
            name: d.name,
            model: d.model,
            paired_at: d.paired_at,
            last_seen: if connected { Some(now_unix()) } else { d.last_seen },
        }),
        connected,
        cam: CamView {
            live: v.live && connected,
            effective: v.effective,
            stats: v.stats,
            phone: if connected { v.phone_cam } else { None },
        },
        vcam,
        pair_seconds_left: v.pair_seconds_left,
        drop: v.drop,
        drop_months: drop::summary(&PathBuf::from(h.lock().settings.photos_dir.clone()), 4),
    }
}

#[cfg(windows)]
fn registered_dll() -> Option<PathBuf> {
    vcam::registered_dll()
}

#[cfg(not(windows))]
fn registered_dll() -> Option<PathBuf> {
    None
}

/// What the Windows webcam shows while there is no picture (ADR-0018).
fn vcam_state(h: &Hyphn) -> vcam::VcamState {
    let v = h.hub.view();
    let inner = h.lock();
    let c = &inner.settings.cam;
    vcam::VcamState {
        live: v.live,
        phone: v.connected.is_some(),
        multi: c.get("multi").and_then(|v| v.as_bool()).unwrap_or(true),
        style: c.get("wst").and_then(|v| v.as_u64()).unwrap_or(0).min(2) as u8,
        message: c.get("msg").and_then(|v| v.as_str()).unwrap_or("Je reviens bientôt").to_string(),
    }
}

/// Creates the webcam for this session if the DLL is registered (once).
#[cfg(windows)]
fn start_camera(app: &AppHandle) {
    if app.state::<Hyphn>().lock().camera {
        return;
    }
    let Some(dll) = registered_dll() else { return };
    let result = vcam::create_camera(&dll);
    let h = app.state::<Hyphn>();
    let mut inner = h.lock();
    inner.camera = result.is_ok();
    inner.camera_error = result.err();
}

#[cfg(not(windows))]
fn start_camera(_app: &AppHandle) {}

#[tauri::command]
fn get_snapshot(h: State<'_, Hyphn>) -> Snapshot {
    snapshot(&h)
}

#[derive(Serialize)]
struct OfferView {
    /// The QR modules, one string per row, '1' = dark. The window draws them
    /// on a canvas in whole screen pixels: an SVG scaled to a fractional size
    /// left thin gaps between the squares, and the iPhone missed the corner
    /// patterns. None when E11 refuses to show a QR.
    qr: Option<Vec<String>>,
    problem: Option<String>,
    seconds_left: u64,
}

/// Rows of the QR, '1' = dark.
fn qr_rows(code: &qrcode::QrCode) -> Vec<String> {
    let w = code.width();
    code.to_colors()
        .chunks(w)
        .map(|row| row.iter().map(|c| if *c == qrcode::Color::Dark { '1' } else { '0' }).collect())
        .collect()
}

#[tauri::command]
fn pair_offer(h: State<'_, Hyphn>) -> OfferView {
    let Some(ip) = net::local_ip() else {
        return OfferView {
            qr: None,
            problem: Some("Ce PC n’est relié à aucun réseau local. Branche-le au Wi-Fi ou au câble de ta box, puis réessaie.".into()),
            seconds_left: 0,
        };
    };
    let port = h.lock().port;
    let uri = h.hub.issue_offer(ip, port).to_uri();
    // Low correction is enough on a screen (nothing scratches it) and keeps
    // the code at 25x25 (ADR-0028): big squares, read at once by the iPhone.
    let qr = qrcode::QrCode::with_error_correction_level(uri.as_bytes(), qrcode::EcLevel::L).ok().map(|c| qr_rows(&c));
    OfferView { qr, problem: None, seconds_left: pairing::TOKEN_TTL.as_secs() }
}

#[tauri::command]
fn forget_device(h: State<'_, Hyphn>) -> Result<(), String> {
    h.hub.forget().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_settings(h: State<'_, Hyphn>) -> Settings {
    h.lock().settings.clone()
}

#[tauri::command]
fn save_settings(settings: Settings, app: AppHandle, h: State<'_, Hyphn>) -> Result<(), String> {
    let mut inner = h.lock();
    if settings.launch_at_startup != inner.settings.launch_at_startup {
        let auto = app.autolaunch();
        let r = if settings.launch_at_startup { auto.enable() } else { auto.disable() };
        r.map_err(|e| format!("Lancement avec Windows : {e}"))?;
    }
    h.hub.store.save_settings(&settings)?;
    h.hub.set_drop_target(PathBuf::from(&settings.photos_dir), settings.sort.clone());
    inner.settings = settings;
    Ok(())
}

/// « Annuler » on the Drop page.
#[tauri::command]
fn drop_cancel(h: State<'_, Hyphn>) {
    h.hub.cancel_drop();
}

/// « Ouvrir le dossier » after a send: where the last file went.
#[tauri::command]
fn open_drop_folder(app: AppHandle, h: State<'_, Hyphn>) -> Result<(), String> {
    let folder = h.hub.view().drop.folder;
    let dir = if folder.is_empty() { h.lock().settings.photos_dir.clone() } else { folder };
    app.opener().open_path(dir, None::<&str>).map_err(|e| e.to_string())
}

/// Async so the blocking folder dialog does not run on the main thread.
#[tauri::command]
async fn pick_photos_dir(app: AppHandle) -> Option<String> {
    let picked = app.dialog().file().set_title("Dossier des photos").blocking_pick_folder()?;
    picked.into_path().ok().map(|p| p.display().to_string())
}

#[tauri::command]
fn open_photos_dir(app: AppHandle, h: State<'_, Hyphn>) -> Result<(), String> {
    let dir = PathBuf::from(h.lock().settings.photos_dir.clone());
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener().open_path(dir.display().to_string(), None::<&str>).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
struct CamRequest {
    height: u32,
    fps: u32,
    bitrate_mbps: u32,
    adapt: bool,
    /// "hevc" or "h264": what the window can decode.
    codec: String,
    #[serde(default)]
    ev: f64,
    /// None = auto.
    #[serde(default)]
    focus: Option<u32>,
    #[serde(default)]
    wb: Option<u32>,
    #[serde(default)]
    torch: bool,
    /// 0 off (default: less delay, no crop), 1 standard, 2 cinematic.
    #[serde(default)]
    stab: u32,
}

fn tune_of(ev: f64, focus: Option<u32>, wb: Option<u32>, torch: bool, stab: u32) -> link::Tune {
    link::Tune { ev_tenths: (ev * 10.0).round() as i32, focus, wb, torch, stab }
}

#[tauri::command]
fn cam_set(quality: CamRequest, h: State<'_, Hyphn>) {
    // « live » belongs to Rust: the window never overwrites it with an old value.
    h.hub.update_cam(|c| {
        c.request = Quality { height: quality.height, fps: quality.fps, bitrate_mbps: quality.bitrate_mbps };
        c.adapt = quality.adapt;
        c.codec = if quality.codec == "h264" { Codec::H264 } else { Codec::Hevc };
        c.tune = tune_of(quality.ev, quality.focus, quality.wb, quality.torch, quality.stab);
    });
}

/// Lens or front camera touched on the PC. Apart from `cam_set` so that
/// opening the Cam page never sends back an old lens over the iPhone's.
#[tauri::command]
fn cam_lens(front: bool, lens: u32, mirror: bool, turn: u32, h: State<'_, Hyphn>) {
    h.hub.update_cam(|c| {
        c.front = front;
        c.lens = lens.min(3);
        c.mirror = mirror;
        c.turn = turn % 4;
    });
}

/// « Reconnecter » on the PC: ends the link (the iPhone, app open, comes back
/// at once) and announces Hyphn again on the network (Wi-Fi changed…).
#[tauri::command]
fn reconnect(h: State<'_, Hyphn>) {
    h.hub.drop_session();
    let short_id = identity::to_hex(&h.hub.identity.fingerprint)[..8].to_string();
    let mut inner = h.lock();
    if let Some(old) = inner.mdns.take() {
        let _ = old.shutdown();
    }
    inner.mdns = net::local_ip().and_then(|ip| net::advertise(ip.into(), inner.port, &short_id));
}

/// « Afficher la caméra » / « Pause » on the PC.
#[tauri::command]
fn cam_live(on: bool, h: State<'_, Hyphn>) {
    h.hub.set_live(on);
}

/// The Cam page is on screen (or not): while paused, the iPhone sends a small
/// preview for the window only (ADR-0027).
#[tauri::command]
fn cam_preview(on: bool, h: State<'_, Hyphn>) {
    h.hub.update_cam(|c| c.preview = on);
}

/// The window reads the picture here (WebSocket, `video.rs`).
#[tauri::command]
fn cam_video_url(h: State<'_, Hyphn>) -> String {
    h.lock().video_url.clone()
}

/// « Installer » the Windows webcam and the OBS source: one UAC prompt, then
/// the camera is created at once.
#[cfg(windows)]
#[tauri::command]
async fn vcam_install(uninstall: bool, app: AppHandle) -> Result<(), String> {
    // Asked by hand: the « declined » mark from a refused prompt goes away.
    set_vcam_declined(&app, false);
    let a = app.clone();
    tauri::async_runtime::spawn_blocking(move || install_native(&a, uninstall)).await.map_err(|e| e.to_string())?
}

#[cfg(windows)]
fn set_vcam_declined(app: &AppHandle, declined: bool) {
    let h = app.state::<Hyphn>();
    let mut inner = h.lock();
    if inner.settings.vcam_declined != declined {
        inner.settings.vcam_declined = declined;
        let _ = h.hub.store.save_settings(&inner.settings);
    }
}

/// Installs (or removes) the webcam and the OBS source: one UAC prompt, then
/// the camera is created at once. Blocking.
#[cfg(windows)]
fn install_native(app: &AppHandle, uninstall: bool) -> Result<(), String> {
    let native = app.state::<Hyphn>().lock().native.clone().ok_or("Fichiers de la webcam introuvables.")?;
    if !uninstall && !vcam::native_is_genuine(&native) {
        return Err("Les fichiers de la webcam ont été modifiés : réinstalle Hyphn.".into());
    }
    if uninstall {
        vcam::remove_camera();
    }
    // The admin copy of Hyphn writes why it failed here.
    let report = std::env::temp_dir().join("hyphn-install.log");
    let _ = std::fs::remove_file(&report);
    let action = if uninstall { install::Action::Uninstall } else { install::Action::Install };
    let code = vcam::run_elevated(&install::elevated_args(&native, &report, action))?;
    if code != 0 {
        let why = std::fs::read_to_string(&report).unwrap_or_default();
        let why = why.trim();
        return Err(if why.is_empty() { format!("L’installation a échoué (code {code}).") } else { format!("L’installation a échoué : {why}") });
    }
    if uninstall {
        app.state::<Hyphn>().lock().camera = false;
    } else {
        start_camera(app);
    }
    on_event(app, UiEvent::Changed);
    Ok(())
}

/// At launch: the webcam must just be there. If it is not installed yet (app
/// run without its installer), install it now, without waiting for a click;
/// Windows still asks for the admin « Oui » once. A « Non » is remembered so
/// Hyphn does not ask again at every start (Réglages keeps the button).
#[cfg(windows)]
fn auto_install(app: &AppHandle) {
    let (declined, native) = {
        let h = app.state::<Hyphn>();
        let inner = h.lock();
        (inner.settings.vcam_declined, inner.native.is_some())
    };
    // Missing, or older than the one this app carries (an update): install.
    let up_to_date = registered_dll().is_some_and(|d| vcam::sha256_hex(&d).as_deref() == Some(vcam::VCAM_SHA256));
    if up_to_date && vcam::camera_service_is_stale() {
        // The right DLL is installed but the camera service still runs an old
        // one (ADR-0026): stop it, one « Oui ». A « Non » asks again next time.
        reload_camera_service();
        return;
    }
    if declined || !native || up_to_date {
        return;
    }
    match install_native(app, false) {
        Ok(()) => {
            let _ = app.emit("vcam_installed", ());
        }
        Err(e) => {
            if e.contains("annulée") {
                set_vcam_declined(app, true);
            }
            let h = app.state::<Hyphn>();
            h.lock().camera_error = Some(e);
            on_event(app, UiEvent::Changed);
        }
    }
}

#[cfg(windows)]
fn reload_camera_service() {
    let report = std::env::temp_dir().join("hyphn-install.log");
    // No DLL is copied: the source folder is not used.
    let args = install::elevated_args(std::path::Path::new("-"), &report, install::Action::Reload);
    if let Err(e) = vcam::run_elevated(&args) {
        eprintln!("hyphn: camera service reload: {e}");
    }
}

#[cfg(not(windows))]
#[tauri::command]
async fn vcam_install(_uninstall: bool) -> Result<(), String> {
    Err("Windows seulement.".into())
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Ouvrir Hyphn", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Hyphn")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[derive(Serialize, Clone)]
struct PairEvent {
    /// "code", "linked" or "ended".
    step: &'static str,
    code: Option<String>,
    device_name: Option<String>,
    message: Option<String>,
}

fn on_event(app: &AppHandle, e: UiEvent) {
    let pair = |step, code, device_name, message| {
        let _ = app.emit("pair", PairEvent { step, code, device_name, message });
    };
    match e {
        UiEvent::PairCode { code, device_name } => pair("code", Some(code), Some(device_name), None),
        UiEvent::Paired { device_name } => pair("linked", None, Some(device_name), None),
        UiEvent::PairEnded { message } => pair("ended", None, None, message),
        UiEvent::CamQuality { height, fps } => {
            let _ = app.emit("cam_quality", serde_json::json!({ "height": height, "fps": fps }));
        }
        UiEvent::PhoneLive => {
            // « Afficher » on the iPhone: the PC shows the Cam page. A window
            // hidden in the tray stays hidden (Discord may be using the webcam).
            let _ = app.emit("cam_phone_live", ());
            if let Some(w) = app.get_webview_window("main") {
                if w.is_visible().unwrap_or(false) && w.is_minimized().unwrap_or(false) {
                    let _ = w.unminimize();
                }
            }
        }
        UiEvent::DropStarted => {
            let _ = app.emit("drop_started", ());
        }
        UiEvent::Changed => {}
    }
    // Every event can change the snapshot; the window and the webcam get it
    // at once (« Afficher » shows on Discord without waiting for the tick).
    if let Some(h) = app.try_state::<Hyphn>() {
        let state = vcam_state(&h);
        h.vcam_state.send_if_modified(|s| if *s != state { *s = state; true } else { false });
        let _ = app.emit("snapshot", snapshot(&h));
    }
}

/// Cam settings saved by the window (`settings.cam`), read back at start.
fn saved_cam(settings: &Settings) -> CamWanted {
    const RES: [u32; 5] = [2160, 1440, 1080, 720, 480];
    const FPS: [u32; 5] = [24, 25, 30, 60, 120];
    const RATE: [u32; 5] = [0, 8, 20, 40, 80];
    let c = &settings.cam;
    let pick = |k: &str, list: &[u32], default: usize| {
        let i = c.get(k).and_then(|v| v.as_u64()).map(|v| v as usize).unwrap_or(default);
        list.get(i).copied().unwrap_or(list[default])
    };
    CamWanted {
        live: false, // ADR-0018: Cam always starts paused
        request: Quality { height: pick("res", &RES, 0), fps: pick("fps", &FPS, 3), bitrate_mbps: pick("rate", &RATE, 0) },
        adapt: c.get("autoq").and_then(|v| v.as_bool()).unwrap_or(true),
        codec: if c.get("codec").and_then(|v| v.as_u64()) == Some(1) { Codec::H264 } else { Codec::Hevc },
        front: c.get("front").and_then(|v| v.as_bool()).unwrap_or(false),
        lens: c.get("lens").and_then(|v| v.as_u64()).unwrap_or(1) as u32,
        mirror: c.get("mirror").and_then(|v| v.as_bool()).unwrap_or(false),
        turn: c.get("turn").and_then(|v| v.as_u64()).unwrap_or(0) as u32 % 4,
        tune: {
            let flag = |k: &str, d: bool| c.get(k).and_then(|v| v.as_bool()).unwrap_or(d);
            let num = |k: &str, d: u64| c.get(k).and_then(|v| v.as_u64()).unwrap_or(d) as u32;
            tune_of(
                c.get("ev").and_then(|v| v.as_f64()).unwrap_or(0.0),
                (!flag("afA", true)).then(|| num("focus", 50)),
                (!flag("wbA", true)).then(|| num("wb", 5600)),
                flag("torch", false),
                num("stab", 0),
            )
        },
        // Until the Cam page is on screen.
        preview: false,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Relaunched as admin to install the webcam: do it and leave, no window.
    if let Some(code) = install::elevated_main(&std::env::args().collect::<Vec<_>>()) {
        std::process::exit(code);
    }
    tauri::Builder::default()
        // One Hyphn at a time: a second launch shows the first one's window
        // (two would fight over the port, the pipe and the webcam).
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let pc_name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "Ce PC".into());
            let identity = Identity::load_or_create(&dir, &format!("Hyphn {pc_name}"))?;
            let store = Store::new(&dir)?;
            let mut settings = store.settings();
            if settings.photos_dir.is_empty() {
                let pictures = app.path().picture_dir().unwrap_or_else(|_| dir.clone());
                settings.photos_dir = pictures.join("Hyphn").display().to_string();
            }
            let port = net::pick_port(settings.port);
            settings.port = Some(port);
            store.save_settings(&settings)?;
            let short_id: String = identity::to_hex(&identity.fingerprint)[..8].to_string();
            let handle = app.handle().clone();
            let hub = Hub::new(
                identity,
                store,
                pc_name,
                saved_cam(&settings),
                Box::new(move |e| on_event(&handle, e)),
            )?;
            hub.set_drop_target(PathBuf::from(&settings.photos_dir), settings.sort.clone());
            let mdns = net::local_ip().and_then(|ip| net::advertise(ip.into(), port, &short_id));
            let video_url = tauri::async_runtime::block_on(video::start(hub.clone()))?;
            let native = vcam::native_dir(app.path().resource_dir().ok()).filter(|d| vcam::native_is_genuine(d));
            let (vcam_tx, vcam_rx) = tokio::sync::watch::channel(vcam::VcamState::default());
            let readers = Arc::new(AtomicUsize::new(0));
            app.manage(Hyphn {
                hub: hub.clone(),
                inner: Mutex::new(Inner { settings, port, mdns, video_url, camera: false, camera_error: None, native }),
                vcam_state: vcam_tx,
                vcam_readers: readers.clone(),
            });
            setup_tray(app.handle())?;

            #[cfg(windows)]
            {
                tauri::async_runtime::spawn(vcam::serve(hub.clone(), vcam_rx, readers));
                // Off the main thread: Media Foundation may take a moment.
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    start_camera(&handle);
                    on_event(&handle, UiEvent::Changed);
                    auto_install(&handle);
                });
            }
            #[cfg(not(windows))]
            drop((vcam_rx, readers));

            tauri::async_runtime::spawn(async move {
                match tokio::net::TcpListener::bind((Ipv4Addr::UNSPECIFIED, port)).await {
                    Ok(listener) => hub.serve(listener).await,
                    Err(e) => eprintln!("hyphn: cannot listen on port {port}: {e}"),
                }
            });

            // Once per second: stream counters, and a fresh snapshot for the
            // « vu il y a » and countdown texts.
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(1));
                let h = handle.state::<Hyphn>();
                h.hub.tick();
                let state = vcam_state(&h);
                h.vcam_state.send_if_modified(|s| if *s != state { *s = state; true } else { false });
                let _ = handle.emit("snapshot", snapshot(&h));
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let h = window.state::<Hyphn>();
                if h.lock().settings.close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            pair_offer,
            forget_device,
            get_settings,
            save_settings,
            pick_photos_dir,
            open_photos_dir,
            drop_cancel,
            open_drop_folder,
            reconnect,
            cam_set,
            cam_lens,
            cam_live,
            cam_preview,
            cam_video_url,
            vcam_install
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hyphn");
}
