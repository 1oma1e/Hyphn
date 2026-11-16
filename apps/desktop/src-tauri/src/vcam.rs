//! The Windows webcam and the OBS source (spec `Cam - Webcam Windows et OBS`).
//!
//! - `hyphn_vcam.dll` (apps/desktop-vcam) is the camera that Discord, OBS,
//!   Teams… see. Windows loads it in its Frame Server service (Local Service),
//!   so it lives in Program Files and is registered once as admin.
//! - The app creates the camera for this Windows session through the DLL
//!   (`HyphnVCamCreate`): it exists while Hyphn runs, nothing stays behind.
//! - The iPhone frames reach the DLL and the OBS plugin on a named pipe that
//!   only this user, the Frame Server and SYSTEM may open, only while an app
//!   actually shows the camera. A reader that decodes HEVC (OBS) gets the
//!   compressed stream; the webcam, which cannot in the camera service, gets
//!   pictures decoded by the app with the DLL's own decoder (ADR-0035).

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::{mpsc, watch};

use crate::link::{keyed_sink, Hub};
use crate::proto;

pub const PIPE: &str = r"\\.\pipe\hyphn-vcam";
/// COM class of the camera source, registered in HKLM by `regsvr32`.
pub const CLSID: &str = "{10FA7DA4-A7FE-49E4-B4E9-1A77EDCFEB6E}";
pub const DLL: &str = "hyphn_vcam.dll";
pub const OBS_DLL: &str = "hyphn-obs.dll";

/// Pipe header, little-endian, 32 bytes (same layout in `hyphn_pipe.h`):
/// magic u32, kind u16, flags u16, len u32, width u32, height u32,
/// codec u8, key u8, reserved u16, pts_us i64.
pub const MAGIC: u32 = 0x3156_5948; // "HYV1"
pub const HEADER: usize = 32;
pub mod kind {
    /// App → reader: one Annex-B frame.
    pub const VIDEO: u16 = 1;
    /// App → reader: live, iPhone connected, languages, style, then the message.
    pub const STATE: u16 = 2;
    /// App → reader: one decoded NV12 picture, width × height, rows packed
    /// (ADR-0035: the webcam cannot decode HEVC in the camera service).
    pub const RAW: u16 = 3;
    /// Reader → app: an app shows the camera at width × height, send frames.
    /// Flags: CAN_HEVC (else RAW pictures, or H.264 for an older reader), CAN_RAW.
    pub const HELLO: u16 = 16;
    /// Reader → app: the decoder needs a keyframe.
    pub const KEY: u16 = 17;
    /// Reader → app: the camera is now shown at width × height.
    pub const SIZE: u16 = 18;
}

/// HELLO flags.
pub const CAN_HEVC: u16 = 1;
pub const CAN_RAW: u16 = 2;

/// The reader gets decoded pictures from the app (ADR-0035): it cannot decode
/// HEVC itself (the webcam in the camera service) but takes them. OBS, which
/// sees the HEVC decoder, keeps the compressed stream.
pub fn wants_raw(flags: u16) -> bool {
    flags & CAN_HEVC == 0 && flags & CAN_RAW != 0
}

/// Picture size asked by a reader (HELLO, SIZE), even; None if it makes no
/// sense. RAW pictures are 1080p at most (spec E10, 3 MB each): a reader that
/// shows 4K gets 1080p, scaled up on its graphics card.
pub fn asked_size(h: &[u8; HEADER]) -> Option<(u32, u32)> {
    let w = u32::from_le_bytes(h[12..16].try_into().unwrap());
    let ht = u32::from_le_bytes(h[16..20].try_into().unwrap());
    if w < 2 || ht < 2 || w > 8192 || ht > 8192 {
        return None;
    }
    // Same shape, inside 1920 × 1080 (or 1080 × 1920 upright).
    let (long, short) = if w >= ht { (1920.0, 1080.0) } else { (1080.0, 1920.0) };
    let scale = (long / w as f64).min(short / ht as f64).min(1.0);
    let even = |v: f64| ((v as u32) & !1).max(2);
    Some((even(w as f64 * scale), even(ht as f64 * scale)))
}

/// A RAW message with room for the picture after the header (filled in place).
pub fn raw_message(w: u32, h: u32) -> Vec<u8> {
    let len = (w * h * 3 / 2) as usize;
    let mut out = vec![0u8; HEADER + len];
    out[..HEADER].copy_from_slice(&header(kind::RAW, len, w, h, 0, false, 0));
    out
}
/// Pictures drawn by the window with the camera effects on (ADR-0034). While
/// they keep coming, the webcam shows them instead of the app's own decoding:
/// Discord sees exactly what the window shows.
pub mod fx {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::{Arc, Condvar, Mutex, OnceLock};
    use std::time::Instant;

    use tokio::sync::mpsc;

    type Out = (u64, mpsc::Sender<Vec<u8>>, Arc<AtomicU64>);
    static OUTS: Mutex<Vec<Out>> = Mutex::new(Vec::new());
    static NEXT: AtomicU64 = AtomicU64::new(1);
    /// When the last window picture came, in ms since START (0: never).
    static LAST: AtomicU64 = AtomicU64::new(0);
    static START: OnceLock<Instant> = OnceLock::new();
    /// Longer than this without a window picture: back to the app's decoding.
    const FRESH_MS: u64 = 400;

    fn now_ms() -> u64 {
        START.get_or_init(Instant::now).elapsed().as_millis() as u64 + 1
    }

    /// A webcam reader taking decoded pictures, at the size it asked for.
    pub(super) fn register(out: mpsc::Sender<Vec<u8>>, size: Arc<AtomicU64>) -> u64 {
        let id = NEXT.fetch_add(1, Ordering::Relaxed);
        OUTS.lock().unwrap().push((id, out, size));
        id
    }

    pub(super) fn unregister(id: u64) {
        OUTS.lock().unwrap().retain(|(i, _, _)| *i != id);
    }

    /// The size the window should draw at: the first webcam reader's.
    pub fn size() -> Option<(u32, u32)> {
        OUTS.lock().unwrap().first().map(|(_, _, s)| super::unpack(s.load(Ordering::Relaxed)))
    }

    /// Window pictures are coming in.
    pub fn active() -> bool {
        let last = LAST.load(Ordering::Relaxed);
        last != 0 && now_ms().saturating_sub(last) < FRESH_MS
    }

    /// The newest "HFX1" message not yet converted (an older one is dropped).
    static NEWEST: Mutex<Option<Vec<u8>>> = Mutex::new(None);
    static WAKE: Condvar = Condvar::new();
    static WORKER: OnceLock<()> = OnceLock::new();

    /// A picture from the window, as received: converted on a thread of its
    /// own, so the socket keeps reading and only the newest picture is kept.
    pub fn offer(msg: Vec<u8>) {
        WORKER.get_or_init(|| {
            std::thread::Builder::new()
                .name("vcam-fx".into())
                .spawn(|| loop {
                    let msg = {
                        let mut slot = NEWEST.lock().unwrap();
                        loop {
                            if let Some(m) = slot.take() {
                                break m;
                            }
                            slot = WAKE.wait(slot).unwrap();
                        }
                    };
                    // "HFX1", width, height (u32 LE), 0 RGBA / 1 BGRA, then the pixels.
                    if msg.len() > 13 && &msg[..4] == b"HFX1" {
                        let w = u32::from_le_bytes(msg[4..8].try_into().unwrap());
                        let h = u32::from_le_bytes(msg[8..12].try_into().unwrap());
                        push(w, h, msg[12] == 1, &msg[13..]);
                    }
                })
                .expect("vcam-fx thread");
        });
        *NEWEST.lock().unwrap() = Some(msg);
        WAKE.notify_one();
    }

    /// One picture from the window: `bgra` (else RGBA), 4 bytes a pixel, rows packed.
    pub fn push(w: u32, h: u32, bgra: bool, px: &[u8]) -> bool {
        if w == 0 || h == 0 || w % 2 == 1 || h % 2 == 1 || px.len() != (w * h * 4) as usize {
            return false;
        }
        let outs: Vec<_> = OUTS
            .lock()
            .unwrap()
            .iter()
            .filter(|(_, _, s)| super::unpack(s.load(Ordering::Relaxed)) == (w, h))
            .map(|(_, o, _)| o.clone())
            .collect();
        LAST.store(now_ms(), Ordering::Relaxed);
        if outs.is_empty() {
            return true;
        }
        let mut m = super::raw_message(w, h);
        to_nv12(w as usize, h as usize, bgra, px, &mut m[super::HEADER..]);
        for o in outs {
            // Full pipe (the reader is late): this picture is skipped.
            let _ = o.try_send(m.clone());
        }
        true
    }

    /// RGB to NV12, BT.709 video range, like the iPhone's own pictures.
    pub fn to_nv12(w: usize, h: usize, bgra: bool, px: &[u8], out: &mut [u8]) {
        let (ri, bi) = if bgra { (2, 0) } else { (0, 2) };
        let (y_plane, uv) = out.split_at_mut(w * h);
        for (i, p) in px.chunks_exact(4).enumerate() {
            let (r, g, b) = (p[ri] as i32, p[1] as i32, p[bi] as i32);
            y_plane[i] = ((47 * r + 157 * g + 16 * b + 128) >> 8).clamp(0, 255) as u8 + 16;
        }
        for y in (0..h).step_by(2) {
            for x in (0..w).step_by(2) {
                let (mut r, mut g, mut b) = (0, 0, 0);
                for (dx, dy) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
                    let p = &px[((y + dy) * w + x + dx) * 4..];
                    r += p[ri] as i32;
                    g += p[1] as i32;
                    b += p[bi] as i32;
                }
                let (r, g, b) = (r / 4, g / 4, b / 4);
                let o = (y / 2) * w + x;
                uv[o] = (((-26 * r - 86 * g + 112 * b + 128) >> 8) + 128).clamp(16, 240) as u8;
                uv[o + 1] = (((112 * r - 102 * g - 10 * b + 128) >> 8) + 128).clamp(16, 240) as u8;
            }
        }
    }
}

/// Longest payload a reader may send (its messages are tiny).
const MAX_IN: usize = 4096;
/// Frames waiting for one reader before it skips (and asks for a keyframe).
const QUEUE: usize = 3;

static NEXT: AtomicU64 = AtomicU64::new(0);

/// One line of the waiting screen, chosen and translated in the window (ADR-0033).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Line {
    pub locale: String,
    /// Joined letters (Arabic, Hindi…): shown at once, not letter by letter.
    pub whole: bool,
    pub text: String,
}

/// What the camera shows when there is no picture (ADR-0018).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct VcamState {
    pub live: bool,
    pub phone: bool,
    pub multi: bool,
    pub style: u8,
    pub message: String,
    /// The lines that roll; empty: the built-in languages of the default message.
    pub lines: Vec<Line>,
}

pub fn header(kind: u16, len: usize, width: u32, height: u32, codec: u8, key: bool, pts_us: i64) -> [u8; HEADER] {
    let mut h = [0u8; HEADER];
    h[0..4].copy_from_slice(&MAGIC.to_le_bytes());
    h[4..6].copy_from_slice(&kind.to_le_bytes());
    h[8..12].copy_from_slice(&(len as u32).to_le_bytes());
    h[12..16].copy_from_slice(&width.to_le_bytes());
    h[16..20].copy_from_slice(&height.to_le_bytes());
    h[20] = codec;
    h[21] = key as u8;
    h[24..32].copy_from_slice(&pts_us.to_le_bytes());
    h
}

pub fn video_bytes(f: &proto::VideoFrame) -> Vec<u8> {
    let mut out = Vec::with_capacity(HEADER + f.data.len());
    out.extend_from_slice(&header(kind::VIDEO, f.data.len(), f.width, f.height, f.codec as u8, f.keyframe, f.pts_us));
    out.extend_from_slice(&f.data);
    out
}

pub fn state_bytes(s: &VcamState) -> Vec<u8> {
    let msg: String = s.message.chars().take(60).collect();
    let mut body = vec![s.live as u8, s.phone as u8, s.multi as u8, s.style];
    body.extend_from_slice(msg.as_bytes());
    // Then each line after a 0: locale, 0x1F, whole (1/0), 0x1F, text (an
    // older DLL refuses the longer state and keeps the last one it had).
    let clean = |t: &str, n: usize| -> String { t.chars().filter(|c| *c != '\0' && *c != '').take(n).collect() };
    for l in s.lines.iter().take(64) {
        body.push(0);
        let e = format!("{}{}{}", clean(&l.locale, 16), if l.whole { 1 } else { 0 }, clean(&l.text, 80));
        body.extend_from_slice(e.as_bytes());
    }
    let mut out = header(kind::STATE, body.len(), 0, 0, 0, false, 0).to_vec();
    out.extend_from_slice(&body);
    out
}

/// Accepts readers (the DLL in the Frame Server, the OBS plugin) forever.
#[cfg(windows)]
pub async fn serve(hub: Arc<Hub>, state: watch::Receiver<VcamState>, readers: Arc<AtomicUsize>) {
    let mut first = true;
    loop {
        // `first_pipe_instance`: if another program already holds the name,
        // creating fails instead of joining it (no one can pose as Hyphn).
        let server = match sys::create_pipe(first) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("hyphn: webcam pipe: {e}");
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
        };
        first = false;
        if server.connect().await.is_err() {
            continue;
        }
        tokio::spawn(reader(hub.clone(), server, state.clone(), readers.clone()));
    }
}

#[cfg(windows)]
async fn reader(
    hub: Arc<Hub>,
    pipe: tokio::net::windows::named_pipe::NamedPipeServer,
    mut state: watch::Receiver<VcamState>,
    readers: Arc<AtomicUsize>,
) {
    let (mut rd, mut wr) = tokio::io::split(pipe);
    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(QUEUE);
    // Writer: the state first and whenever it changes, frames in between.
    let writer = tokio::spawn(async move {
        let first = state_bytes(&state.borrow_and_update());
        if wr.write_all(&first).await.is_err() {
            return;
        }
        loop {
            let out = tokio::select! {
                biased;
                c = state.changed() => match c {
                    Ok(()) => state_bytes(&state.borrow_and_update()),
                    Err(_) => break,
                },
                p = rx.recv() => match p {
                    Some(p) => p,
                    None => break,
                },
            };
            if wr.write_all(&out).await.is_err() {
                break;
            }
        }
    });
    let name = format!("vcam-{}", NEXT.fetch_add(1, Ordering::Relaxed));
    let mut active = false;
    let mut raw: Option<RawFeed> = None;
    let mut h = [0u8; HEADER];
    let mut body = vec![0u8; MAX_IN];
    while rd.read_exact(&mut h).await.is_ok() {
        let magic = u32::from_le_bytes(h[0..4].try_into().unwrap());
        let k = u16::from_le_bytes(h[4..6].try_into().unwrap());
        let flags = u16::from_le_bytes(h[6..8].try_into().unwrap());
        let len = u32::from_le_bytes(h[8..12].try_into().unwrap()) as usize;
        if magic != MAGIC || len > MAX_IN || rd.read_exact(&mut body[..len]).await.is_err() {
            break;
        }
        match k {
            kind::HELLO if !active => {
                active = true;
                readers.fetch_add(1, Ordering::Relaxed);
                raw = if wants_raw(flags) {
                    // Opening the decoder takes a moment (graphics card): off the async threads.
                    let (hb, nm, t, size) = (hub.clone(), name.clone(), tx.clone(), asked_size(&h).unwrap_or((1280, 720)));
                    tokio::task::spawn_blocking(move || RawFeed::start(&hb, &nm, t, size)).await.ok().flatten()
                } else {
                    None
                };
                if raw.is_none() {
                    // The compressed stream, decoded by the reader (H.264 if it cannot do HEVC).
                    hub.set_reader_needs_h264(&name, flags & CAN_HEVC == 0);
                    let t = tx.clone();
                    hub.set_video_sink(&name, Some(keyed_sink(move |f| t.try_send(video_bytes(f)).is_ok())));
                }
                hub.request_key();
            }
            kind::KEY => hub.request_key(),
            kind::SIZE => {
                if let (Some(r), Some(size)) = (&raw, asked_size(&h)) {
                    r.resize(size);
                }
            }
            _ => {}
        }
    }
    hub.set_video_sink(&name, None);
    hub.set_reader_needs_h264(&name, false);
    drop(raw);
    if active {
        readers.fetch_sub(1, Ordering::Relaxed);
    }
    writer.abort();
}

/// The decoder of the webcam DLL, run by the app (ADR-0035). Thread safe on
/// the C side: one thread decodes, another takes the pictures (like the pipe
/// thread and the camera in the camera service).
#[cfg(windows)]
pub struct Decoder {
    handle: usize,
    api: sys::DecoderApi,
}

#[cfg(windows)]
impl Decoder {
    /// None: the loaded DLL is older (no decoder) or the graphics card refused.
    pub fn open() -> Option<Arc<Self>> {
        let api = sys::decoder_api()?;
        let handle = unsafe { (api.open)() } as usize;
        (handle != 0).then(|| Arc::new(Decoder { handle, api }))
    }

    pub fn hevc(&self) -> bool {
        unsafe { (self.api.hevc)(self.handle as _) != 0 }
    }

    /// True: the decoder needs a keyframe.
    pub fn push(&self, f: &proto::VideoFrame) -> bool {
        let len = u32::try_from(f.data.len()).unwrap_or(0);
        unsafe {
            (self.api.push)(self.handle as _, f.codec as u8, f.width, f.height, f.keyframe as i32, f.pts_us, f.data.as_ptr(), len) != 0
        }
    }

    /// True: a new picture came out within `ms`.
    pub fn wait(&self, ms: u32) -> bool {
        unsafe { (self.api.wait)(self.handle as _, ms) != 0 }
    }

    /// The latest picture, NV12 at `w` × `h`, into `out` (w × h × 3 / 2 bytes).
    pub fn fill(&self, out: &mut [u8], w: u32, h: u32) -> bool {
        if out.len() < (w * h * 3 / 2) as usize {
            return false;
        }
        unsafe { (self.api.fill)(self.handle as _, out.as_mut_ptr(), w, h) != 0 }
    }
}

#[cfg(windows)]
unsafe impl Send for Decoder {}
#[cfg(windows)]
unsafe impl Sync for Decoder {}

#[cfg(windows)]
impl Drop for Decoder {
    fn drop(&mut self) {
        unsafe { (self.api.close)(self.handle as _) }
    }
}

/// Decoded pictures for one reader: a thread feeds the decoder with the
/// iPhone frames, another sends each new picture at the size the reader shows.
#[cfg(windows)]
struct RawFeed {
    stop: Arc<std::sync::atomic::AtomicBool>,
    size: Arc<AtomicU64>,
    /// Registered for the window's pictures with effects (`fx`).
    fx: u64,
}

#[cfg(windows)]
impl RawFeed {
    fn start(hub: &Arc<Hub>, name: &str, out: mpsc::Sender<Vec<u8>>, size: (u32, u32)) -> Option<Self> {
        let dec = Decoder::open()?;
        if !dec.hevc() {
            // The app cannot decode HEVC either: compressed H.264 as before.
            return None;
        }
        let (ftx, frx) = std::sync::mpsc::sync_channel::<proto::VideoFrame>(QUEUE);
        let (d, h) = (dec.clone(), hub.clone());
        // Ends when the sink (and so `ftx`) is removed.
        std::thread::spawn(move || {
            sys::raise_thread();
            for f in frx {
                if d.push(&f) {
                    h.request_key();
                }
            }
        });
        hub.set_video_sink(name, Some(keyed_sink(move |f| ftx.try_send(f.clone()).is_ok())));
        let size = Arc::new(AtomicU64::new(pack(size)));
        let feed = RawFeed { stop: Arc::default(), fx: fx::register(out.clone(), size.clone()), size };
        let (stop, cur) = (feed.stop.clone(), feed.size.clone());
        std::thread::spawn(move || {
            sys::raise_thread();
            // Woken by each new picture; the 1 s timeout only notices the end.
            while !stop.load(Ordering::Relaxed) {
                // The window sends pictures with effects: they go instead.
                if !dec.wait(1000) || fx::active() {
                    continue;
                }
                let (w, h) = unpack(cur.load(Ordering::Relaxed));
                let mut m = raw_message(w, h);
                // Full pipe (the reader is late): this picture is skipped,
                // the next one is whole anyway.
                if dec.fill(&mut m[HEADER..], w, h) && out.try_send(m).is_err() && out.is_closed() {
                    break;
                }
            }
        });
        Some(feed)
    }

    fn resize(&self, size: (u32, u32)) {
        self.size.store(pack(size), Ordering::Relaxed);
    }
}

#[cfg(windows)]
impl Drop for RawFeed {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        fx::unregister(self.fx);
    }
}

fn pack((w, h): (u32, u32)) -> u64 {
    (w as u64) << 32 | h as u64
}

fn unpack(v: u64) -> (u32, u32) {
    ((v >> 32) as u32, v as u32)
}

/// SHA-256 of the DLLs this app was built with (build.rs), empty if none.
pub const VCAM_SHA256: &str = env!("HYPHN_VCAM_SHA256");
pub const OBS_SHA256: &str = env!("HYPHN_OBS_SHA256");


pub fn sha256_hex(path: &Path) -> Option<String> {
    use sha2::{Digest, Sha256};
    let bytes = std::fs::read(path).ok()?;
    Some(Sha256::digest(&bytes).iter().map(|x| format!("{x:02X}")).collect())
}

/// The DLLs next to the app are exactly the ones it was built with.
pub fn native_is_genuine(dir: &Path) -> bool {
    !VCAM_SHA256.is_empty() && sha256_hex(&dir.join(DLL)).as_deref() == Some(VCAM_SHA256)
}


/// The camera services that load the DLL (ADR-0026).
pub const CAMERA_SERVICES: [&str; 2] = ["FrameServer", "FrameServerMonitor"];

/// `%ProgramData%\Hyphn`: the webcam log and the `loaded-<pid>.txt` files.
pub fn logs_dir() -> PathBuf {
    std::env::var_os("ProgramData").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(r"C:\ProgramData")).join("Hyphn")
}

/// A running camera service holds another DLL than `sha` (ADR-0026): each
/// process that loads the DLL writes its SHA-256 to `loaded-<pid>.txt`.
pub fn stale_in(logs: &Path, pids: &[u32], sha: &str) -> bool {
    pids.iter().any(|pid| {
        std::fs::read_to_string(logs.join(format!("loaded-{pid}.txt"))).is_ok_and(|held| held.trim() != sha)
    })
}

/// The camera service still holds an old webcam DLL (after an update).
#[cfg(windows)]
pub fn camera_service_is_stale() -> bool {
    let pids: Vec<u32> = CAMERA_SERVICES.iter().filter_map(|s| sys::service_pid(s)).collect();
    !VCAM_SHA256.is_empty() && stale_in(&logs_dir(), &pids, VCAM_SHA256)
}

/// Where the built DLLs are: next to the app once installed, `src-tauri/native`
/// while developing.
pub fn native_dir(resource_dir: Option<PathBuf>) -> Option<PathBuf> {
    let mut places: Vec<PathBuf> = resource_dir.into_iter().map(|d| d.join("native")).collect();
    if cfg!(debug_assertions) {
        places.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("native"));
    }
    places.into_iter().find(|d| d.join(DLL).is_file())
}

/// Where the camera DLL is registered, if it is (and the file is there).
#[cfg(windows)]
pub fn registered_dll() -> Option<PathBuf> {
    sys::registered_path(&format!(r"SOFTWARE\Classes\CLSID\{CLSID}\InprocServer32")).filter(|p| p.is_file())
}

pub fn obs_plugin_installed() -> bool {
    let base = std::env::var_os("ProgramData").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(r"C:\ProgramData"));
    // OBS loads %ProgramData%\obs-studio\plugins\<name>\bin\64bit\<name>.dll.
    base.join(r"obs-studio\plugins\hyphn-obs\bin\64bit").join(OBS_DLL).is_file()
}

pub fn obs_present() -> bool {
    let pf = std::env::var_os("ProgramFiles").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(r"C:\Program Files"));
    pf.join(r"obs-studio\bin\64bit\obs64.exe").is_file()
}

#[cfg(windows)]
pub use sys::{create_camera, keep_full_speed, remove_camera, run_elevated};

/// The error of a « No » to the Windows admin prompt.
#[cfg(windows)]
pub fn cancelled() -> &'static str {
    crate::i18n::tr("installation cancelled", "installation annulée")
}

#[cfg(windows)]
mod sys {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;
    use std::path::{Path, PathBuf};
    use std::ptr::{null, null_mut};

    use tokio::net::windows::named_pipe::{NamedPipeServer, PipeMode, ServerOptions};
    use windows_sys::Win32::Foundation::{CloseHandle, LocalFree, HANDLE};
    use windows_sys::Win32::Security::Authorization::{
        ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
    };
    use windows_sys::Win32::Security::{GetTokenInformation, TokenUser, PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES, TOKEN_QUERY, TOKEN_USER};
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_DEFAULT_DIRS, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR};
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
    use windows_sys::Win32::System::Threading::{
        GetCurrentProcess, GetCurrentThread, GetExitCodeProcess, OpenProcessToken, ProcessPowerThrottling, SetProcessInformation, SetThreadPriority,
        WaitForSingleObject, INFINITE, PROCESS_POWER_THROTTLING_CURRENT_VERSION, PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
        PROCESS_POWER_THROTTLING_STATE, THREAD_PRIORITY_ABOVE_NORMAL,
    };

    /// Hyphn in the background (a game in front) keeps its full speed: Windows
    /// would otherwise slow it down (EcoQoS) and the webcam would miss pictures.
    pub fn keep_full_speed() {
        let st = PROCESS_POWER_THROTTLING_STATE {
            Version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
            ControlMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
            StateMask: 0,
        };
        // SAFETY: a valid struct of the size given, for this very process.
        unsafe {
            SetProcessInformation(GetCurrentProcess(), ProcessPowerThrottling, (&st as *const PROCESS_POWER_THROTTLING_STATE).cast(), std::mem::size_of_val(&st) as u32);
        }
    }

    /// The calling thread goes before the normal ones (a game's included).
    pub fn raise_thread() {
        // SAFETY: the pseudo handle of the calling thread.
        unsafe {
            SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_ABOVE_NORMAL);
        }
    }
    use windows_sys::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE;

    use super::PIPE;

    fn wide(s: impl AsRef<std::ffi::OsStr>) -> Vec<u16> {
        s.as_ref().encode_wide().chain(Some(0)).collect()
    }

    /// SID of the user running Hyphn, as « S-1-5-21-… ».
    fn user_sid() -> std::io::Result<String> {
        unsafe {
            let mut token: HANDLE = null_mut();
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
                return Err(std::io::Error::last_os_error());
            }
            let mut len = 0u32;
            GetTokenInformation(token, TokenUser, null_mut(), 0, &mut len);
            // u64 storage: TOKEN_USER holds pointers and must be aligned.
            let mut buf = vec![0u64; (len as usize).div_ceil(8)];
            let ok = GetTokenInformation(token, TokenUser, buf.as_mut_ptr() as *mut c_void, len, &mut len);
            CloseHandle(token);
            if ok == 0 {
                return Err(std::io::Error::last_os_error());
            }
            let user = &*(buf.as_ptr() as *const TOKEN_USER);
            let mut s: *mut u16 = null_mut();
            if ConvertSidToStringSidW(user.User.Sid, &mut s) == 0 {
                return Err(std::io::Error::last_os_error());
            }
            let n = (0..).take_while(|&i| *s.add(i) != 0).count();
            let text = String::from_utf16_lossy(std::slice::from_raw_parts(s, n));
            LocalFree(s as *mut c_void);
            Ok(text)
        }
    }

    /// One pipe instance that only SYSTEM (Frame Server Monitor), Local
    /// Service (Frame Server) and this user (OBS) may open; remote clients
    /// are always refused. 0x12019b = read and write without
    /// FILE_CREATE_PIPE_INSTANCE: no service can add an instance of its own
    /// and catch the camera's connection.
    pub fn create_pipe(first: bool) -> std::io::Result<NamedPipeServer> {
        let sddl = wide(format!("D:P(A;;0x12019b;;;SY)(A;;0x12019b;;;LS)(A;;GA;;;{})", user_sid()?));
        unsafe {
            let mut sd: PSECURITY_DESCRIPTOR = null_mut();
            if ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.as_ptr(), SDDL_REVISION_1, &mut sd, null_mut()) == 0 {
                return Err(std::io::Error::last_os_error());
            }
            let mut sa = SECURITY_ATTRIBUTES {
                nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
                lpSecurityDescriptor: sd,
                bInheritHandle: 0,
            };
            let r = ServerOptions::new()
                .first_pipe_instance(first)
                .reject_remote_clients(true)
                .pipe_mode(PipeMode::Byte)
                .in_buffer_size(16 * 1024)
                .out_buffer_size(1024 * 1024)
                .create_with_security_attributes_raw(PIPE, &mut sa as *mut SECURITY_ATTRIBUTES as *mut c_void);
            LocalFree(sd);
            r
        }
    }

    pub fn registered_path(subkey: &str) -> Option<PathBuf> {
        let key = wide(subkey);
        let mut buf = vec![0u16; 1024];
        let mut size = (buf.len() * 2) as u32;
        let r = unsafe {
            RegGetValueW(HKEY_LOCAL_MACHINE, key.as_ptr(), null(), RRF_RT_REG_SZ, null_mut(), buf.as_mut_ptr() as *mut c_void, &mut size)
        };
        if r != 0 {
            return None;
        }
        let n = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        Some(PathBuf::from(String::from_utf16_lossy(&buf[..n])))
    }

    /// PID of a running service, None if stopped. Needs no admin.
    pub fn service_pid(name: &str) -> Option<u32> {
        use windows_sys::Win32::System::Services::{
            CloseServiceHandle, OpenSCManagerW, OpenServiceW, QueryServiceStatusEx, SC_MANAGER_CONNECT, SC_STATUS_PROCESS_INFO,
            SERVICE_QUERY_STATUS, SERVICE_STATUS_PROCESS,
        };
        let name = wide(name);
        unsafe {
            let scm = OpenSCManagerW(null(), null(), SC_MANAGER_CONNECT);
            if scm.is_null() {
                return None;
            }
            let svc = OpenServiceW(scm, name.as_ptr(), SERVICE_QUERY_STATUS);
            let mut pid = None;
            if !svc.is_null() {
                let mut st: SERVICE_STATUS_PROCESS = std::mem::zeroed();
                let mut len = 0u32;
                let size = std::mem::size_of::<SERVICE_STATUS_PROCESS>() as u32;
                if QueryServiceStatusEx(svc, SC_STATUS_PROCESS_INFO, &mut st as *mut _ as *mut u8, size, &mut len) != 0 && st.dwProcessId != 0 {
                    pid = Some(st.dwProcessId);
                }
                CloseServiceHandle(svc);
            }
            CloseServiceHandle(scm);
            pid
        }
    }

    /// The loaded camera DLL (kept: the camera lives as long as Hyphn).
    static LIB: std::sync::Mutex<usize> = std::sync::Mutex::new(0);

    /// Creates the camera for this session through the DLL. The library stays
    /// loaded: the camera lives as long as Hyphn (MFVirtualCameraLifetime_Session).
    pub fn create_camera(dll: &Path) -> Result<(), String> {
        let path = wide(dll);
        let mut held = LIB.lock().unwrap_or_else(|e| e.into_inner());
        unsafe {
            let lib = LoadLibraryExW(path.as_ptr(), null_mut(), LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
            if lib.is_null() {
                return Err(format!("chargement de {} : {}", dll.display(), std::io::Error::last_os_error()));
            }
            *held = lib as usize;
            let Some(f) = GetProcAddress(lib, c"HyphnVCamCreate".as_ptr() as *const u8) else {
                return Err(crate::i18n::tr("HyphnVCamCreate missing from the DLL", "HyphnVCamCreate absent de la DLL").into());
            };
            let create: unsafe extern "system" fn(*const u16) -> i32 = std::mem::transmute(f);
            let name = wide("Hyphn");
            let hr = create(name.as_ptr());
            if hr < 0 {
                return Err(format!("{}{}0x{:08X}", crate::i18n::tr("webcam creation", "création de la webcam"), crate::i18n::colon(), hr as u32));
            }
        }
        Ok(())
    }

    /// The decoder functions of the loaded DLL (ADR-0035).
    #[derive(Clone, Copy)]
    pub struct DecoderApi {
        pub open: unsafe extern "system" fn() -> *mut c_void,
        pub hevc: unsafe extern "system" fn(*mut c_void) -> i32,
        pub push: unsafe extern "system" fn(*mut c_void, u8, u32, u32, i32, i64, *const u8, u32) -> i32,
        pub wait: unsafe extern "system" fn(*mut c_void, u32) -> i32,
        pub fill: unsafe extern "system" fn(*mut c_void, *mut u8, u32, u32) -> i32,
        pub close: unsafe extern "system" fn(*mut c_void),
    }

    /// None until the webcam is created, or with an older DLL.
    pub fn decoder_api() -> Option<DecoderApi> {
        let held = *LIB.lock().unwrap_or_else(|e| e.into_inner());
        if held == 0 {
            return None;
        }
        unsafe {
            let get = |n: &std::ffi::CStr| GetProcAddress(held as _, n.as_ptr() as *const u8);
            Some(DecoderApi {
                open: std::mem::transmute(get(c"HyphnDecoderOpen")?),
                hevc: std::mem::transmute(get(c"HyphnDecoderHevc")?),
                push: std::mem::transmute(get(c"HyphnDecoderPush")?),
                wait: std::mem::transmute(get(c"HyphnDecoderWait")?),
                fill: std::mem::transmute(get(c"HyphnDecoderFill")?),
                close: std::mem::transmute(get(c"HyphnDecoderClose")?),
            })
        }
    }

    /// « Retirer »: the camera disappears before the DLL is unregistered.
    pub fn remove_camera() {
        let held = LIB.lock().unwrap_or_else(|e| e.into_inner());
        if *held == 0 {
            return;
        }
        unsafe {
            if let Some(f) = GetProcAddress(*held as _, c"HyphnVCamRemove".as_ptr() as *const u8) {
                let remove: unsafe extern "system" fn() -> i32 = std::mem::transmute(f);
                remove();
            }
        }
    }

    /// Relaunches this very exe as admin (one UAC prompt) with `params`, and
    /// waits for it (install.rs does the work). Ok(exit code).
    pub fn run_elevated(params: &str) -> Result<u32, String> {
        let verb = wide("runas");
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let file = wide(&exe);
        let params = wide(params);
        unsafe {
            let mut info: SHELLEXECUTEINFOW = std::mem::zeroed();
            info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
            info.fMask = SEE_MASK_NOCLOSEPROCESS;
            info.lpVerb = verb.as_ptr();
            info.lpFile = file.as_ptr();
            info.lpParameters = params.as_ptr();
            info.nShow = SW_HIDE;
            if ShellExecuteExW(&mut info) == 0 {
                return Err(super::cancelled().into());
            }
            WaitForSingleObject(info.hProcess, INFINITE);
            let mut code = 1u32;
            GetExitCodeProcess(info.hProcess, &mut code);
            CloseHandle(info.hProcess);
            Ok(code)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn header_layout_matches_the_c_side() {
        let h = header(kind::VIDEO, 5, 1920, 1080, 1, true, -2);
        assert_eq!(&h[0..4], b"HYV1");
        assert_eq!(u16::from_le_bytes([h[4], h[5]]), 1);
        assert_eq!(u32::from_le_bytes(h[8..12].try_into().unwrap()), 5);
        assert_eq!(u32::from_le_bytes(h[12..16].try_into().unwrap()), 1920);
        assert_eq!((h[20], h[21]), (1, 1));
        assert_eq!(i64::from_le_bytes(h[24..32].try_into().unwrap()), -2);
    }

    #[test]
    fn a_service_holding_another_dll_is_stale() {
        let t = tempfile::tempdir().unwrap();
        std::fs::write(t.path().join("loaded-10.txt"), "AAAA").unwrap();
        std::fs::write(t.path().join("loaded-20.txt"), "BBBB").unwrap();
        // Right DLL, or no file (never loaded): nothing to do.
        assert!(!stale_in(t.path(), &[10], "AAAA"));
        assert!(!stale_in(t.path(), &[30], "AAAA"));
        assert!(!stale_in(t.path(), &[], "AAAA"));
        // An old file of a stopped service (pid 20 not running) does not count.
        assert!(!stale_in(t.path(), &[10, 30], "AAAA"));
        assert!(stale_in(t.path(), &[10, 20], "AAAA"));
    }

    #[test]
    fn state_message_is_cut_to_60_characters() {
        let s = VcamState { live: true, phone: true, multi: false, style: 2, message: "é".repeat(80), lines: vec![] };
        let b = state_bytes(&s);
        assert_eq!(&b[HEADER..HEADER + 4], &[1, 1, 0, 2]);
        assert_eq!(String::from_utf8(b[HEADER + 4..].to_vec()).unwrap().chars().count(), 60);
        assert_eq!(u32::from_le_bytes(b[8..12].try_into().unwrap()) as usize, b.len() - HEADER);
    }

    #[test]
    fn window_pictures_become_nv12() {
        // White, then pure red: video range, red chroma high.
        let mut out = vec![0u8; 2 * 2 * 3 / 2];
        fx::to_nv12(2, 2, false, &[255u8; 16], &mut out);
        assert_eq!(&out[..4], &[235, 235, 235, 235]);
        assert_eq!(&out[4..], &[128, 128]);
        let red: Vec<u8> = (0..4).flat_map(|_| [255u8, 0, 0, 255]).collect();
        fx::to_nv12(2, 2, false, &red, &mut out);
        assert_eq!(out[0], 63);
        assert!(out[5] > 220 && out[4] < 110);
        // The same red sent as BGRA gives the same picture.
        let mut out2 = vec![0u8; 6];
        let bgr: Vec<u8> = (0..4).flat_map(|_| [0u8, 0, 255, 255]).collect();
        fx::to_nv12(2, 2, true, &bgr, &mut out2);
        assert_eq!(out, out2);
        // Odd or wrong sizes are refused.
        assert!(!fx::push(3, 2, false, &[0; 24]));
        assert!(!fx::push(2, 2, false, &[0; 15]));
    }

    #[test]
    fn the_lines_follow_the_message() {
        let lines: Vec<Line> = (0..64).map(|i| Line { locale: format!("l{i}"), whole: i == 1, text: "é".repeat(90) }).collect();
        let s = VcamState { live: false, phone: true, multi: true, style: 0, message: "Pause".into(), lines };
        let b = state_bytes(&s);
        let parts: Vec<&[u8]> = b[HEADER + 4..].split(|c| *c == 0).collect();
        assert_eq!(parts.len(), 1 + 64);
        assert_eq!(parts[0], b"Pause");
        assert!(parts[2].starts_with("l11".as_bytes()));
        // The DLL takes at most 32 KB of state.
        assert!(b.len() - HEADER <= 4 + 32768);
    }

    #[test]
    fn only_a_reader_without_hevc_gets_decoded_pictures() {
        // The webcam in the camera service: no HEVC, takes RAW.
        assert!(wants_raw(CAN_RAW));
        // OBS sees the HEVC decoder: compressed stream.
        assert!(!wants_raw(CAN_HEVC | CAN_RAW));
        // An older DLL (no RAW): compressed, H.264 as before.
        assert!(!wants_raw(0));
        assert!(!wants_raw(CAN_HEVC));
    }

    #[test]
    fn raw_message_and_asked_size() {
        let m = raw_message(1280, 720);
        assert_eq!(m.len(), HEADER + 1280 * 720 * 3 / 2);
        assert_eq!(u16::from_le_bytes([m[4], m[5]]), kind::RAW);
        assert_eq!(u32::from_le_bytes(m[8..12].try_into().unwrap()) as usize, 1280 * 720 * 3 / 2);
        let h: [u8; HEADER] = m[..HEADER].try_into().unwrap();
        assert_eq!(asked_size(&h), Some((1280, 720)));
        // Bigger than 1080p: same shape, 1080p at most; upright too.
        assert_eq!(asked_size(&header(kind::SIZE, 0, 3840, 2160, 0, false, 0)), Some((1920, 1080)));
        assert_eq!(asked_size(&header(kind::SIZE, 0, 2160, 3840, 0, false, 0)), Some((1080, 1920)));
        assert_eq!(asked_size(&header(kind::SIZE, 0, 640, 360, 0, false, 0)), Some((640, 360)));
        // Zero or absurd sizes are refused.
        for (w, ht) in [(0, 720), (1280, 1), (100_000, 720)] {
            assert_eq!(asked_size(&header(kind::SIZE, 0, w, ht, 0, false, 0)), None);
        }
        assert_eq!(unpack(pack((1920, 1080))), (1920, 1080));
    }
}
