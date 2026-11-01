//! The USB cable (spec `Core - Liaison par cable`, ADR-0031). Apple's usbmux
//! service (iTunes or Apple Devices, `127.0.0.1:27015`) says when an iPhone is
//! plugged or unplugged, and opens TCP connections to the Hyphn app, which
//! listens on the iPhone's `127.0.0.1:47801`. usbmux only connects from the PC
//! to the iPhone: `link` then runs the same TLS and messages as on the Wi-Fi.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering::Relaxed};
use std::sync::Arc;
use std::time::Duration;

use futures_util::StreamExt;
use idevice::usbmuxd::{Connection, UsbmuxdConnection, UsbmuxdListenEvent};
use tokio::net::TcpStream;
use tokio::runtime::Handle;

use crate::link::{journal, CableDial, Hub, Io};

/// Where the Hyphn app listens on the iPhone.
pub const PHONE_PORT: u16 = 47801;
const USBMUX: (&str, u16) = ("127.0.0.1", 27015);
/// Plugged but not linked yet (app closed, « Trust » not accepted): next try (E3).
const RETRY: Duration = Duration::from_secs(2);
/// Apple's service missing or restarted: look again; a local connection only.
const SERVICE_RETRY: Duration = Duration::from_secs(30);

async fn mux() -> std::io::Result<UsbmuxdConnection> {
    let tcp = TcpStream::connect(USBMUX).await?;
    tcp.set_nodelay(true)?;
    Ok(UsbmuxdConnection::new(Box::new(tcp), 1))
}

/// One TCP connection to the Hyphn app on the iPhone, through the cable.
async fn dial(device: u32) -> std::io::Result<Box<dyn Io>> {
    let dev = mux().await?.connect_to_device(device, PHONE_PORT, "hyphn").await.map_err(std::io::Error::other)?;
    let socket = dev.get_socket().ok_or_else(|| std::io::Error::other("usbmux gave no socket"))?;
    Ok(Box::new(socket))
}

/// Watches usbmux for the whole life of the app. Its event stream cannot move
/// between threads, so it runs on a thread of its own; the connections run on
/// the app's runtime (`rt`).
pub fn start(hub: Arc<Hub>, rt: Handle) {
    let d: CableDial = Arc::new(|device| Box::pin(dial(device)));
    hub.set_cable_dial(d);
    let spawned = std::thread::Builder::new().name("hyphn-cable".into()).spawn(move || {
        let Ok(local) = tokio::runtime::Builder::new_current_thread().enable_all().build() else { return };
        local.block_on(async move {
            loop {
                let why = watch(&hub, &rt).await;
                hub.set_cable_service(false);
                journal(&format!("cable: usbmux unavailable ({why}), next look in {} s", SERVICE_RETRY.as_secs()));
                tokio::time::sleep(SERVICE_RETRY).await;
            }
        });
    });
    if let Err(e) = spawned {
        eprintln!("hyphn: cable: {e}");
    }
}

/// Until usbmux closes: one task per plugged iPhone (E1).
async fn watch(hub: &Arc<Hub>, rt: &Handle) -> String {
    let mut conn = match mux().await {
        Ok(c) => c,
        Err(e) => return e.to_string(),
    };
    let mut events = match conn.listen().await {
        Ok(s) => s,
        Err(e) => return e.to_string(),
    };
    hub.set_cable_service(true);
    let mut plugged: HashMap<u32, Arc<AtomicBool>> = HashMap::new();
    let why = loop {
        match events.next().await {
            Some(Ok(UsbmuxdListenEvent::Connected(d))) if d.connection_type == Connection::Usb => {
                journal(&format!("cable: iPhone plugged (usbmux {})", d.device_id));
                let on = Arc::new(AtomicBool::new(true));
                if let Some(old) = plugged.insert(d.device_id, on.clone()) {
                    old.store(false, Relaxed);
                }
                rt.spawn(keep_linked(hub.clone(), d.device_id, on));
            }
            Some(Ok(UsbmuxdListenEvent::Disconnected(id))) => {
                if let Some(on) = plugged.remove(&id) {
                    on.store(false, Relaxed);
                    hub.cable_gone(id);
                    journal(&format!("cable: iPhone unplugged (usbmux {id})"));
                }
            }
            Some(Ok(_)) => {}
            Some(Err(e)) => break e.to_string(),
            None => break "closed".to_string(),
        }
    };
    for (id, on) in plugged {
        on.store(false, Relaxed);
        hub.cable_gone(id);
    }
    why
}

/// While plugged: a cable session, opened again each time it ends (E3). Not
/// cancelled from outside: a session stops through `cable_gone`, which lets
/// it clean up like any other end.
async fn keep_linked(hub: Arc<Hub>, device: u32, plugged: Arc<AtomicBool>) {
    let mut last = String::new();
    while plugged.load(Relaxed) {
        if !hub.has_cable_session(device) && !hub.cable_declined(device) {
            let res = match dial(device).await {
                Ok(io) => hub.clone().cable_in(io, device).await,
                Err(e) => Err(e),
            };
            // One line per new reason, not one every 2 s.
            let now = res.err().map(|e| e.to_string()).unwrap_or_default();
            if !now.is_empty() && now != last {
                journal(&format!("cable: iPhone not reached ({now})"));
            }
            last = now;
        }
        tokio::time::sleep(RETRY).await;
    }
}
