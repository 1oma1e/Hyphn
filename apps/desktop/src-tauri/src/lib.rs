//! Hyphn for Windows. The real iPhone talks to `link` over TLS; the window
//! reads snapshots and sends commands. Drop is empty for now (ADR-0020).

mod cam;
#[allow(dead_code)] // Drop comes back in the next session (ADR-0020).
mod drop;
mod identity;
mod link;
mod net;
mod pairing;
mod proto;
mod status;
mod store;
mod tls;

use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::ipc::{Channel, InvokeResponseBody};
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
    _mdns: Option<mdns_sd::ServiceDaemon>,
}

struct Hyphn {
    hub: Arc<Hub>,
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
    /// What the iPhone reports about its camera; None when not connected.
    phone: Option<PhoneCam>,
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
    pair_seconds_left: u64,
}

fn snapshot(h: &Hyphn) -> Snapshot {
    let hub = &h.hub;
    let v = hub.view();
    let device = hub.store.devices().into_iter().next();
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
        pair_seconds_left: v.pair_seconds_left,
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
    problem: Option<String>,
    seconds_left: u64,
}

#[tauri::command]
fn pair_offer(h: State<'_, Hyphn>) -> OfferView {
    let Some(ip) = net::local_ip() else {
        return OfferView {
            svg: None,
            problem: Some("Ce PC n’est relié à aucun réseau local. Branche-le au Wi-Fi ou au câble de ta box, puis réessaie.".into()),
            seconds_left: 0,
        };
    };
    let port = h.lock().port;
    let uri = h.hub.issue_offer(ip, port).to_uri();
    // Low correction is enough on a screen (nothing scratches it) and keeps
    // the code at 29x29: big squares, read at once by the iPhone.
    let svg = qrcode::QrCode::with_error_correction_level(uri.as_bytes(), qrcode::EcLevel::L).ok().map(|code| {
        code.render::<qrcode::render::svg::Color>()
            .quiet_zone(false)
            .dark_color(qrcode::render::svg::Color("#0A0D08"))
            .light_color(qrcode::render::svg::Color("#F4F7EE"))
            .build()
    });
    OfferView { svg, problem: None, seconds_left: pairing::TOKEN_TTL.as_secs() }
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

#[derive(Deserialize)]
struct CamRequest {
    height: u32,
    fps: u32,
    bitrate_mbps: u32,
    adapt: bool,
    /// "hevc" or "h264": what the window can decode.
    codec: String,
    front: bool,
    lens: u32,
}

#[tauri::command]
fn cam_set(live: bool, quality: CamRequest, h: State<'_, Hyphn>) {
    h.hub.set_cam(CamWanted {
        live,
        request: Quality { height: quality.height, fps: quality.fps, bitrate_mbps: quality.bitrate_mbps },
        adapt: quality.adapt,
        codec: if quality.codec == "h264" { Codec::H264 } else { Codec::Hevc },
        front: quality.front,
        lens: quality.lens,
    });
}

/// The Cam page gives a channel; each video packet goes through it as raw bytes.
#[tauri::command]
fn cam_attach(channel: Channel<InvokeResponseBody>, h: State<'_, Hyphn>) {
    h.hub.set_video_sink(Some(Arc::new(move |p| channel.send(InvokeResponseBody::Raw(p)).is_ok())));
}

#[tauri::command]
fn cam_detach(h: State<'_, Hyphn>) {
    h.hub.set_video_sink(None);
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
        UiEvent::Changed => {}
    }
    // Every event can change the snapshot; the window gets it at once.
    if let Some(h) = app.try_state::<Hyphn>() {
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
    }
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
            let mdns = net::local_ip().and_then(|ip| net::advertise(ip, port, &short_id));
            app.manage(Hyphn { hub: hub.clone(), inner: Mutex::new(Inner { settings, port, _mdns: mdns }) });
            setup_tray(app.handle())?;

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
            cam_set,
            cam_attach,
            cam_detach
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hyphn");
}
