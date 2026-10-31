//! The Cam picture for the PC window (spec `Cam - Flux v1`): a WebSocket on
//! 127.0.0.1 behind a random path, so no other program can read it. One binary
//! message per frame, no round trip: much lighter than the Tauri IPC at 60
//! frames a second.

use std::net::Ipv4Addr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use rand::RngCore;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::http::StatusCode;
use tokio_tungstenite::tungstenite::Message;

use crate::link::{keyed_sink, video_packet, Hub};

/// Frames waiting for the window. Beyond that the window is behind: the frame
/// is skipped and the iPhone sends a keyframe, rather than a growing delay.
const QUEUE: usize = 6;

static NEXT: AtomicU64 = AtomicU64::new(0);

/// Starts the server; returns the URL the window connects to.
pub async fn start(hub: Arc<Hub>) -> std::io::Result<String> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
    let port = listener.local_addr()?.port();
    let mut token = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut token);
    let path: String = std::iter::once('/').chain(crate::identity::to_hex(&token).chars()).collect();
    let url = format!("ws://127.0.0.1:{port}{path}");
    tokio::spawn(async move {
        loop {
            let Ok((tcp, _)) = listener.accept().await else { continue };
            let (hub, path) = (hub.clone(), path.clone());
            tokio::spawn(async move { serve(hub, tcp, path).await });
        }
    });
    Ok(url)
}

async fn serve(hub: Arc<Hub>, tcp: TcpStream, path: String) {
    let _ = tcp.set_nodelay(true);
    let check = |req: &Request, resp: Response| -> Result<Response, ErrorResponse> {
        if req.uri().path() == path {
            Ok(resp)
        } else {
            let mut no = ErrorResponse::new(None);
            *no.status_mut() = StatusCode::FORBIDDEN;
            Err(no)
        }
    };
    let Ok(ws) = tokio_tungstenite::accept_hdr_async(tcp, check).await else { return };
    let (mut out, mut inbox) = ws.split();
    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(QUEUE);
    let name = format!("window-{}", NEXT.fetch_add(1, Ordering::Relaxed));
    hub.set_video_sink(&name, Some(keyed_sink(move |f| tx.try_send(video_packet(f)).is_ok())));
    // The decoder starts from a keyframe, at once.
    hub.request_key();
    loop {
        tokio::select! {
            p = rx.recv() => match p {
                Some(p) => if out.send(Message::Binary(p)).await.is_err() { break },
                None => break,
            },
            m = inbox.next() => match m {
                Some(Ok(Message::Text(t))) if t == "key" => hub.request_key(),
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                _ => {}
            },
        }
    }
    hub.set_video_sink(&name, None);
}
