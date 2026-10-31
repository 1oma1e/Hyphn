//! Hyphn for Windows. Real: identity, QR pairing rules, store, cam and drop
//! rules. Simulated (ADR-0019): the iPhone, in `demo`.

mod cam;
mod demo;
mod drop;
mod identity;
mod net;
mod pairing;
mod store;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use cam::{Effective, Quality, Thermal};
use demo::{CamStats, DemoPhone, HistoryEntry, Pulse, Transfer};
use identity::Identity;
use pairing::{PairError, PairingSession};
use store::{PairedDevice, Settings, Store};

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
    pairing: PairingSession,
    settings: Settings,
    phone: DemoPhone,
    port: u16,
    cam_live: bool,
    cam_request: Quality,
    cam_adapt: bool,
}

struct Hyphn {
    identity: Identity,
    store: Store,
    pc_name: String,
    inner: Mutex<Inner>,
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
}

#[derive(Serialize, Clone)]
struct Snapshot {
    pc_name: String,
    pc_fingerprint: String,
    version: &'static str,
    device: Option<DeviceView>,
    connected: bool,
    pulse: Option<Pulse>,
    latency_ms: Option<u32>,
    new_photos: u32,
    transfer: Option<Transfer>,
    history: Vec<HistoryEntry>,
    cam: CamView,
    pair_seconds_left: u64,
}

fn snapshot(h: &Hyphn) -> Snapshot {
    let inner = h.lock();
    let device = h.store.devices().into_iter().next();
    let connected = device.is_some() && inner.phone.open;
    let thermal = if connected { inner.phone.thermal } else { Thermal::Nominal };
    let effective = cam::effective(inner.cam_request, thermal, inner.cam_adapt);
    let live = inner.cam_live && connected;
    Snapshot {
        pc_name: h.pc_name.clone(),
        pc_fingerprint: identity::short_hex(&h.identity.fingerprint),
        version: env!("CARGO_PKG_VERSION"),
        pulse: device.as_ref().map(|_| inner.phone.pulse()),
        latency_ms: connected.then(|| inner.phone.latency_ms()),
        device: device.map(|d| DeviceView {
            fingerprint: identity::from_hex(&d.fingerprint).map(|f| identity::short_hex(&f)).unwrap_or_default(),
            name: d.name,
            model: d.model,
            paired_at: d.paired_at,
            last_seen: if connected { Some(now_unix()) } else { d.last_seen },
        }),
        connected,
        new_photos: if connected { inner.phone.new_photos } else { 0 },
        transfer: inner.phone.transfer.clone(),
        history: inner.phone.history.clone(),
        cam: CamView { live, stats: inner.phone.cam_stats(&effective, live), effective },
        pair_seconds_left: inner.pairing.seconds_left(Instant::now()),
    }
}

#[tauri::command]
fn get_snapshot(h: State<'_, Hyphn>) -> Snapshot {
    snapshot(&h)
}

#[derive(Serialize)]
struct OfferView {
    /// None when E11 refuses to show a QR.
    svg: Option<String>,
    uri: Option<String>,
    problem: Option<String>,
    seconds_left: u64,
}

#[tauri::command]
fn pair_offer(h: State<'_, Hyphn>) -> OfferView {
    let Some(ip) = net::local_ip() else {
        return OfferView {
            svg: None,
            uri: None,
            problem: Some("Ce PC n’est relié à aucun réseau local. Branche-le au Wi-Fi ou au câble de ta box, puis réessaie.".into()),
            seconds_left: 0,
        };
    };
    let mut inner = h.lock();
    let port = inner.port;
    let offer = inner.pairing.issue(ip, port, h.identity.fingerprint, Instant::now());
    let uri = offer.to_uri();
    let svg = qrcode::QrCode::new(uri.as_bytes()).ok().map(|code| {
        code.render::<qrcode::render::svg::Color>()
            .quiet_zone(false)
            .dark_color(qrcode::render::svg::Color("#0A0D08"))
            .light_color(qrcode::render::svg::Color("#F4F7EE"))
            .build()
    });
    OfferView { svg, uri: Some(uri), problem: None, seconds_left: pairing::TOKEN_TTL.as_secs() }
}

#[derive(Serialize)]
struct PendingView {
    code: String,
    device_name: String,
}

/// Stands in for the iPhone scanning the QR and connecting (ADR-0019).
#[tauri::command]
fn demo_scan(uri: String, h: State<'_, Hyphn>) -> Result<PendingView, String> {
    let mut inner = h.lock();
    let req = inner.phone.scan(&uri, &h.identity.cert_der).map_err(|e| e.to_string())?;
    let phone_fp = inner.phone.fingerprint();
    let pending = inner
        .pairing
        .handle_request(&req, phone_fp, &h.identity.fingerprint, Instant::now())
        .map_err(|e: PairError| e.to_string())?;
    Ok(PendingView { code: pending.code, device_name: pending.device_name })
}

#[tauri::command]
fn pair_answer(accept: bool, h: State<'_, Hyphn>) -> Result<bool, String> {
    let mut inner = h.lock();
    let Some(p) = inner.pairing.answer(accept) else { return Ok(false) };
    h.store.set_device(PairedDevice {
        name: p.device_name,
        model: p.model,
        fingerprint: identity::to_hex(&p.fingerprint),
        paired_at: now_unix(),
        last_seen: Some(now_unix()),
    })?;
    inner.phone.set_open(true);
    Ok(true)
}

#[tauri::command]
fn forget_device(h: State<'_, Hyphn>) -> Result<(), String> {
    let mut inner = h.lock();
    for d in h.store.devices() {
        h.store.forget(&d.fingerprint)?;
    }
    inner.cam_live = false;
    inner.phone.cancel();
    Ok(())
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
    h.store.save_settings(&settings)?;
    inner.settings = settings;
    Ok(())
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

#[tauri::command]
fn drop_summary(h: State<'_, Hyphn>) -> Vec<drop::MonthSummary> {
    let dir = PathBuf::from(h.lock().settings.photos_dir.clone());
    drop::summary(&dir, 3)
}

#[tauri::command]
fn drop_action(action: String, h: State<'_, Hyphn>) {
    let mut inner = h.lock();
    match action.as_str() {
        "receive" => inner.phone.start_receive(),
        "pause" => inner.phone.toggle_pause(),
        "cancel" => inner.phone.cancel(),
        "dismiss" => inner.phone.dismiss(),
        _ => {}
    }
}

#[tauri::command]
fn drop_send(paths: Vec<String>, h: State<'_, Hyphn>) {
    let sizes: Vec<u64> = paths
        .iter()
        .filter_map(|p| std::fs::metadata(p).ok())
        .filter(|m| m.is_file())
        .map(|m| m.len())
        .collect();
    h.lock().phone.send_files(&sizes);
}

#[tauri::command]
async fn drop_pick_files(app: AppHandle) -> Vec<String> {
    app.dialog()
        .file()
        .set_title("Envoyer vers l’iPhone")
        .blocking_pick_files()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|f| f.into_path().ok())
        .map(|p| p.display().to_string())
        .collect()
}

#[derive(Deserialize)]
struct CamRequest {
    height: u32,
    fps: u32,
    bitrate_mbps: u32,
    adapt: bool,
}

#[tauri::command]
fn cam_set(live: bool, quality: CamRequest, h: State<'_, Hyphn>) {
    let mut inner = h.lock();
    inner.cam_live = live;
    inner.cam_request = Quality { height: quality.height, fps: quality.fps, bitrate_mbps: quality.bitrate_mbps };
    inner.cam_adapt = quality.adapt;
}

#[derive(Deserialize)]
struct DemoControls {
    open: bool,
    thermal: Thermal,
    battery: u8,
    charging: bool,
}

#[tauri::command]
fn demo_set(controls: DemoControls, h: State<'_, Hyphn>) -> Result<(), String> {
    let mut inner = h.lock();
    if inner.phone.open && !controls.open {
        for d in h.store.devices() {
            h.store.touch(&d.fingerprint, now_unix())?;
        }
    }
    inner.phone.set_open(controls.open);
    inner.phone.thermal = controls.thermal;
    inner.phone.set_battery(controls.battery, controls.charging);
    Ok(())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            if settings.port != Some(port) {
                settings.port = Some(port);
            }
            store.save_settings(&settings)?;
            app.manage(Hyphn {
                identity,
                store,
                pc_name,
                inner: Mutex::new(Inner {
                    pairing: PairingSession::default(),
                    settings,
                    phone: DemoPhone::new()?,
                    port,
                    cam_live: false,
                    cam_request: Quality { height: 2160, fps: 60, bitrate_mbps: 0 },
                    cam_adapt: true,
                }),
            });
            setup_tray(app.handle())?;

            // Demo clock: the simulated iPhone moves once per second and the
            // window gets a fresh snapshot.
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(1));
                let h = handle.state::<Hyphn>();
                h.lock().phone.tick(now_unix());
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
            demo_scan,
            pair_answer,
            forget_device,
            get_settings,
            save_settings,
            pick_photos_dir,
            open_photos_dir,
            drop_summary,
            drop_action,
            drop_send,
            drop_pick_files,
            cam_set,
            demo_set
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hyphn");
}
