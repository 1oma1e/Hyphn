//! The PC end of the network (specs `Core - Appairage QR`, `Core - Reconnexion`,
//! `Infos iPhone - Batterie et chaleur`, `Cam - Flux v1`): one TLS port, three
//! kinds of connection told apart by their first message.
//! - `PairRequest`: checks the QR token, shows the code, waits for « Oui » on the iPhone.
//! - `Hello`: a paired iPhone comes back; it becomes the control session.
//! - `VideoHello`: the camera stream, passed to the window as it comes.

use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tokio::io::{AsyncRead, AsyncWrite, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};
use tokio::time::timeout;
use tokio_rustls::TlsAcceptor;

use crate::cam::{self, Effective, Quality, Thermal};
use crate::identity::{self, Fingerprint, Identity};
use crate::pairing::{self, PairError, PairOffer, PairingSession, PROTOCOL_VERSION};
use crate::proto::{self, envelope::Msg, read_msg, refused::Reason, write_msg, Codec, Envelope};
use crate::status::StatusView;
use crate::store::{PairedDevice, Store};
use crate::Error;

const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);
const PING_EVERY: Duration = Duration::from_secs(5);
/// The iPhone answers each Ping: 4 missed answers = the session is dead,
/// even if Windows has not noticed the lost Wi-Fi yet.
const SILENCE_LIMIT: Duration = Duration::from_secs(20);
/// At most one keyframe request this often (a burst of drops asks once).
const KEY_REQUEST_EVERY: Duration = Duration::from_millis(300);

/// What the window must hear about. Never sent while the state lock is held.
#[derive(Debug, Clone, PartialEq)]
pub enum UiEvent {
    /// Token accepted: show the code and wait for the iPhone.
    PairCode { code: String, device_name: String },
    /// Evan said yes on the iPhone: play « liés ».
    Paired { device_name: String },
    /// The pairing stopped: refused (with a message) or « Non » / gone (None).
    PairEnded { message: Option<String> },
    /// Something in the snapshot changed.
    Changed,
    /// Evan picked a quality on the iPhone.
    CamQuality { height: u32, fps: u32 },
    /// Evan touched « Afficher » on the iPhone: the PC shows the Cam page.
    PhoneLive,
    /// A Drop send starts: the PC shows the Drop page.
    DropStarted,
}

/// A Drop connection may stay quiet while the iPhone downloads an original
/// from iCloud (spec `Drop - Photos vers le PC`, E2).
const DROP_SILENCE: Duration = Duration::from_secs(300);

/// Where a Drop send stands (spec `Drop - Photos vers le PC`, E7), read by the
/// window once a second.
#[derive(Debug, Clone, Default, Serialize)]
pub struct DropProgress {
    /// "" (nothing yet), "sending", "done" or "failed".
    pub state: String,
    pub items: u32,
    pub items_done: u32,
    pub files: u32,
    pub files_done: u32,
    pub bytes: u64,
    pub bytes_done: u64,
    /// Name of the file coming in.
    pub current: String,
    /// Bytes a second, averaged over the last 5 s.
    pub rate: u64,
    /// Items the iPhone could not send (iCloud, hash twice wrong).
    pub failed: u32,
    /// Why it stopped, when it did.
    pub message: String,
    /// Folder of the last file put in place (« Ouvrir le dossier »).
    pub folder: String,
    #[serde(skip)]
    last_bytes: u64,
    #[serde(skip)]
    per_second: std::collections::VecDeque<u64>,
}

/// What the PC wants from the camera; the thermal rule turns it into `CamControl`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CamWanted {
    pub live: bool,
    pub request: Quality,
    pub adapt: bool,
    pub codec: Codec,
    pub front: bool,
    pub lens: u32,
    /// Picture flipped left-right (Cam dock button); the waiting screen never is.
    pub mirror: bool,
    /// Quarter turns clockwise (Cam dock button), 0..3.
    pub turn: u32,
    pub tune: Tune,
    /// The Cam page is on screen on the PC: while paused, the iPhone sends a
    /// small preview for the window only (ADR-0027).
    pub preview: bool,
}

/// Picture settings applied by the iPhone camera itself (Réglages › Caméra).
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Tune {
    /// -20..20 tenths of EV.
    pub ev_tenths: i32,
    /// None = auto focus; Some(0..100) = locked, near to far.
    pub focus: Option<u32>,
    /// None = auto white balance; Some(kelvin).
    pub wb: Option<u32>,
    pub torch: bool,
    /// 0 off, 1 standard, 2 cinematic.
    pub stab: u32,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct CamStats {
    pub fps: f32,
    pub bitrate_mbps: f32,
    pub dropped: u32,
    #[serde(skip)]
    frames: u32,
    #[serde(skip)]
    bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PhoneCam {
    pub open: bool,
    pub live: bool,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub front: bool,
    pub lens: u32,
    pub lens_count: u32,
}

/// Video readers whose name starts with this are Hyphn windows: the only ones
/// that get the paused preview (ADR-0027).
pub const WINDOW_SINK: &str = "window";

/// Called with each video frame (the window, the Windows webcam, OBS);
/// false = that reader was too slow and skipped it.
pub type VideoSink = Arc<dyn Fn(&proto::VideoFrame) -> bool + Send + Sync>;

/// A reader that starts from a keyframe, and after a skipped frame waits for
/// the next one: frames that depend on a lost one are dropped quietly instead
/// of reaching its decoder broken.
pub fn keyed_sink(send: impl Fn(&proto::VideoFrame) -> bool + Send + Sync + 'static) -> VideoSink {
    let need_key = std::sync::atomic::AtomicBool::new(true);
    Arc::new(move |f| {
        use std::sync::atomic::Ordering::Relaxed;
        if need_key.load(Relaxed) && !f.keyframe {
            return true;
        }
        let ok = send(f);
        need_key.store(!ok, Relaxed);
        ok
    })
}

struct Session {
    id: u64,
    fingerprint: Fingerprint,
    tx: UnboundedSender<Envelope>,
    rtt_ms: Option<u32>,
    cam: Option<proto::CamState>,
    last_key_request: Option<Instant>,
    /// Ends this session at once (« Reconnecter », or a newer connection).
    kick: Arc<tokio::sync::Notify>,
}

/// After a lost link, « Afficher » comes back by itself if the iPhone returns
/// within this time (ADR-0023); later, Cam starts paused again (ADR-0018).
const RESUME_LIVE: Duration = Duration::from_secs(300);

pub struct State {
    pub pairing: PairingSession,
    session: Option<Session>,
    next_id: u64,
    /// Kept after the iPhone leaves, shown greyed (E5).
    pub last_status: Option<StatusView>,
    pub cam: CamWanted,
    sent_control: Option<proto::CamControl>,
    stats: CamStats,
    video_sinks: Vec<(String, VideoSink)>,
    /// Readers that cannot decode HEVC: the iPhone sends H.264 while one is there.
    h264_readers: Vec<String>,
    /// The link was lost while live: back live if the iPhone returns before.
    resume_live_until: Option<Instant>,
    pub drop: DropProgress,
    /// Photos folder and « Rangement » (Réglages on the PC).
    drop_target: (PathBuf, String),
}

/// Read by the snapshot.
pub struct LinkView {
    pub connected: Option<Fingerprint>,
    pub rtt_ms: Option<u32>,
    pub status: Option<StatusView>,
    pub phone_cam: Option<PhoneCam>,
    pub live: bool,
    pub effective: Effective,
    pub stats: CamStats,
    pub pair_seconds_left: u64,
    pub drop: DropProgress,
}

pub struct Hub {
    pub identity: Identity,
    pub store: Store,
    pub pc_name: String,
    state: Mutex<State>,
    notify: Box<dyn Fn(UiEvent) + Send + Sync>,
    tls: TlsAcceptor,
    /// « Annuler » on the PC: stops the Drop connection at once.
    drop_stop: tokio::sync::Notify,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn now_unix() -> u64 {
    now_ms() / 1000
}

fn env(m: Msg) -> Envelope {
    m.into()
}

fn reason_of(e: &PairError) -> Reason {
    match e {
        PairError::Expired => Reason::Expired,
        PairError::AlreadyUsed => Reason::AlreadyUsed,
        PairError::WrongVersion => Reason::WrongVersion,
        _ => Reason::UnknownToken,
    }
}

impl Hub {
    pub fn new(
        identity: Identity,
        store: Store,
        pc_name: String,
        cam: CamWanted,
        notify: Box<dyn Fn(UiEvent) + Send + Sync>,
    ) -> Result<Arc<Self>, Error> {
        let tls = TlsAcceptor::from(crate::tls::server_config(&identity)?);
        Ok(Arc::new(Self {
            identity,
            store,
            pc_name,
            state: Mutex::new(State {
                pairing: PairingSession::default(),
                session: None,
                next_id: 0,
                last_status: None,
                cam,
                sent_control: None,
                stats: CamStats::default(),
                video_sinks: Vec::new(),
                h264_readers: Vec::new(),
                resume_live_until: None,
                drop: DropProgress::default(),
                drop_target: (PathBuf::new(), String::new()),
            }),
            notify,
            tls,
            drop_stop: tokio::sync::Notify::new(),
        }))
    }

    pub fn lock(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn issue_offer(&self, host: Ipv4Addr, port: u16) -> PairOffer {
        self.lock().pairing.issue(host, port, self.identity.fingerprint, Instant::now())
    }

    pub fn view(&self) -> LinkView {
        let st = self.lock();
        let s = st.session.as_ref();
        let thermal = st.thermal();
        LinkView {
            connected: s.map(|s| s.fingerprint),
            rtt_ms: s.and_then(|s| s.rtt_ms),
            status: st.last_status.clone(),
            phone_cam: s.and_then(|s| s.cam.as_ref()).map(|c| PhoneCam {
                open: c.open,
                live: c.live,
                width: c.width,
                height: c.height,
                fps: c.fps,
                front: c.front,
                lens: c.lens,
                lens_count: c.lens_count,
            }),
            live: st.cam.live && s.is_some(),
            effective: cam::effective(st.cam.request, thermal, st.cam.adapt),
            stats: st.stats.clone(),
            pair_seconds_left: st.pairing.seconds_left(Instant::now()),
            drop: st.drop.clone(),
        }
    }

    /// Photos folder and « Rangement », from the PC settings.
    pub fn set_drop_target(&self, dir: PathBuf, sort: String) {
        self.lock().drop_target = (dir, sort);
    }

    /// « Annuler » on the PC.
    pub fn cancel_drop(&self) {
        if self.lock().drop.state == "sending" {
            self.drop_stop.notify_waiters();
        }
    }

    #[cfg(test)]
    pub fn set_cam(&self, wanted: CamWanted) {
        self.lock().cam = wanted;
        self.push_control();
    }

    /// Quality, codec, lens… from the PC window; « live » is left as it is.
    pub fn update_cam(&self, f: impl FnOnce(&mut CamWanted)) {
        f(&mut self.lock().cam);
        self.push_control();
    }

    /// « Afficher » / « Pause » on the PC.
    pub fn set_live(&self, live: bool) {
        self.lock().cam.live = live;
        self.push_control();
        (self.notify)(UiEvent::Changed);
    }

    /// « Reconnecter » on the PC: ends the session; the iPhone (app open)
    /// connects again at once, both sides start fresh.
    pub fn drop_session(&self) {
        if let Some(s) = &self.lock().session {
            s.kick.notify_one();
        }
    }

    /// One reader of the video per name; None removes it.
    pub fn set_video_sink(&self, name: &str, sink: Option<VideoSink>) {
        let mut st = self.lock();
        st.video_sinks.retain(|(n, _)| n != name);
        if let Some(s) = sink {
            st.video_sinks.push((name.to_string(), s));
        }
    }

    /// The Windows webcam or OBS on this PC cannot decode HEVC.
    pub fn set_reader_needs_h264(&self, name: &str, needs: bool) {
        {
            let mut st = self.lock();
            st.h264_readers.retain(|n| n != name);
            if needs {
                st.h264_readers.push(name.to_string());
            }
        }
        self.push_control();
    }

    /// A decoder (window, webcam) starts or lost frames: the next frame from
    /// the iPhone is a keyframe, instead of waiting up to 2 s for one.
    pub fn request_key(&self) {
        let tx = {
            let mut st = self.lock();
            let Some(s) = st.session.as_mut() else { return };
            let now = Instant::now();
            if s.last_key_request.is_some_and(|t| now.duration_since(t) < KEY_REQUEST_EVERY) {
                return;
            }
            s.last_key_request = Some(now);
            s.tx.clone()
        };
        let _ = tx.send(env(Msg::KeyRequest(proto::KeyRequest {})));
    }

    /// Once per second: turns the frame counters into fps and Mb/s.
    pub fn tick(&self) {
        let mut st = self.lock();
        let s = &mut st.stats;
        s.fps = s.frames as f32;
        s.bitrate_mbps = s.bytes as f32 * 8.0 / 1e6;
        s.frames = 0;
        s.bytes = 0;
        let d = &mut st.drop;
        if d.state == "sending" {
            d.per_second.push_back(d.bytes_done.saturating_sub(d.last_bytes));
            if d.per_second.len() > 5 {
                d.per_second.pop_front();
            }
            d.rate = d.per_second.iter().sum::<u64>() / d.per_second.len() as u64;
        }
        d.last_bytes = d.bytes_done;
    }

    /// « Oublier » on the PC: tells the iPhone, then forgets it (E10).
    pub fn forget(&self) -> Result<(), Error> {
        {
            let mut st = self.lock();
            if let Some(s) = st.session.take() {
                let _ = s.tx.send(env(Msg::Forget(proto::Forget {})));
            }
            st.cam.live = false;
            st.last_status = None;
        }
        for d in self.store.devices() {
            self.store.forget(&d.fingerprint)?;
        }
        (self.notify)(UiEvent::Changed);
        Ok(())
    }

    /// Sends `CamControl` if the effective settings changed.
    fn push_control(&self) {
        let (tx, ctl) = {
            let mut st = self.lock();
            let Some(s) = st.session.as_ref() else { return };
            let tx = s.tx.clone();
            let ctl = st.control();
            if st.sent_control.as_ref() == Some(&ctl) {
                return;
            }
            st.sent_control = Some(ctl.clone());
            (tx, ctl)
        };
        let _ = tx.send(env(Msg::CamControl(ctl)));
    }

    fn is_paired(&self, fp: &Fingerprint) -> bool {
        self.store.devices().iter().any(|d| identity::from_hex(&d.fingerprint).as_ref() == Some(fp))
    }

    pub async fn serve(self: Arc<Self>, listener: TcpListener) {
        loop {
            let Ok((tcp, _)) = listener.accept().await else { continue };
            let hub = self.clone();
            tokio::spawn(async move {
                let _ = hub.handle(tcp).await;
            });
        }
    }

    async fn handle(self: Arc<Self>, tcp: TcpStream) -> std::io::Result<()> {
        tcp.set_nodelay(true)?;
        let mut tls = timeout(HANDSHAKE_TIMEOUT, self.tls.accept(tcp)).await??;
        let Some(fp) = crate::tls::peer_fingerprint(tls.get_ref().1) else { return Ok(()) };
        let Some(first) = timeout(HANDSHAKE_TIMEOUT, read_msg(&mut tls)).await?? else { return Ok(()) };
        match first.msg {
            Some(Msg::PairRequest(r)) => self.pair(tls, fp, r).await,
            Some(Msg::Hello(h)) => self.hello(tls, fp, h).await,
            Some(Msg::VideoHello(_)) => self.media(tls, fp).await,
            Some(Msg::DropHello(_)) => self.drop_in(tls, fp).await,
            _ => Ok(()),
        }
    }

    async fn refuse<S: AsyncWrite + Unpin>(io: &mut S, reason: Reason, message: String) -> std::io::Result<()> {
        write_msg(io, &env(Msg::Refused(proto::Refused { reason: reason as i32, message }))).await?;
        io.shutdown().await
    }

    async fn pair<S: AsyncRead + AsyncWrite + Unpin + Send + 'static>(
        self: Arc<Self>,
        mut io: S,
        fp: Fingerprint,
        r: proto::PairRequest,
    ) -> std::io::Result<()> {
        let Ok(token) = <pairing::Token>::try_from(r.token.as_slice()) else {
            return Self::refuse(&mut io, Reason::UnknownToken, PairError::UnknownToken.to_string()).await;
        };
        let req = pairing::PairRequest {
            protocol_version: r.protocol_version,
            token,
            device_name: r.device_name,
            model: r.model,
            app_version: r.app_version,
        };
        let res = self.lock().pairing.handle_request(&req, fp, &self.identity.fingerprint, Instant::now());
        let pending = match res {
            Ok(p) => p,
            Err(e) => {
                (self.notify)(UiEvent::PairEnded { message: Some(e.to_string()) });
                return Self::refuse(&mut io, reason_of(&e), e.to_string()).await;
            }
        };
        write_msg(&mut io, &env(Msg::PairPending(proto::PairPending { pc_name: self.pc_name.clone() }))).await?;
        (self.notify)(UiEvent::PairCode { code: pending.code.clone(), device_name: pending.device_name.clone() });

        // E6: only the iPhone answers. Nothing for 2 minutes counts as « Non ».
        let answer = timeout(pairing::TOKEN_TTL, read_msg(&mut io)).await;
        let accept = matches!(
            answer,
            Ok(Ok(Some(Envelope { msg: Some(Msg::PairConfirm(proto::PairConfirm { accept: true })) })))
        );
        let Some(p) = self.lock().pairing.answer(accept) else {
            (self.notify)(UiEvent::PairEnded { message: None });
            if accept {
                // A new QR was made meanwhile: this pairing is no longer valid.
                return Self::refuse(&mut io, Reason::Expired, PairError::Expired.to_string()).await;
            }
            return Ok(());
        };
        self.store
            .set_device(PairedDevice {
                name: p.device_name.clone(),
                model: p.model,
                fingerprint: identity::to_hex(&p.fingerprint),
                paired_at: now_unix(),
                last_seen: Some(now_unix()),
            })
            .map_err(|e| std::io::Error::other(e.to_string()))?;
        // A previous iPhone is replaced (one device in phase 1).
        if let Some(old) = self.lock().session.take() {
            let _ = old.tx.send(env(Msg::Forget(proto::Forget {})));
        }
        self.lock().last_status = None;
        write_msg(&mut io, &env(Msg::PairDone(proto::PairDone {}))).await?;
        (self.notify)(UiEvent::Paired { device_name: p.device_name });
        self.run_session(io, fp).await
    }

    async fn hello<S: AsyncRead + AsyncWrite + Unpin + Send + 'static>(
        self: Arc<Self>,
        mut io: S,
        fp: Fingerprint,
        h: proto::Hello,
    ) -> std::io::Result<()> {
        if h.protocol_version != PROTOCOL_VERSION {
            return Self::refuse(&mut io, Reason::WrongVersion, PairError::WrongVersion.to_string()).await;
        }
        if !self.is_paired(&fp) {
            // Spec `Core - Reconnexion`, E4: never accept an unknown iPhone silently.
            let msg = "Ce PC ne connaît pas cet iPhone. Relie-le à nouveau avec un QR.".to_string();
            return Self::refuse(&mut io, Reason::UnknownDevice, msg).await;
        }
        write_msg(&mut io, &env(Msg::Welcome(proto::Welcome { pc_name: self.pc_name.clone() }))).await?;
        self.run_session(io, fp).await
    }

    /// The control connection, open while the iPhone app is in the foreground.
    async fn run_session<S: AsyncRead + AsyncWrite + Unpin + Send + 'static>(
        self: Arc<Self>,
        io: S,
        fp: Fingerprint,
    ) -> std::io::Result<()> {
        let (mut rd, mut wr) = tokio::io::split(io);
        let (tx, mut rx) = unbounded_channel::<Envelope>();
        let kick = Arc::new(tokio::sync::Notify::new());
        let id = {
            let mut st = self.lock();
            st.next_id += 1;
            let id = st.next_id;
            // A newer connection from the same iPhone replaces the old one,
            // which is closed at once.
            if let Some(old) = &st.session {
                old.kick.notify_one();
            }
            st.session = Some(Session {
                id,
                fingerprint: fp,
                tx: tx.clone(),
                rtt_ms: None,
                cam: None,
                last_key_request: None,
                kick: kick.clone(),
            });
            st.sent_control = None;
            if st.resume_live_until.take().is_some_and(|t| Instant::now() < t) {
                st.cam.live = true;
            }
            id
        };
        let hex = identity::to_hex(&fp);
        let _ = self.store.touch(&hex, now_unix());
        tokio::spawn(async move {
            while let Some(m) = rx.recv().await {
                if write_msg(&mut wr, &m).await.is_err() {
                    break;
                }
            }
            let _ = wr.shutdown().await;
        });
        let pinger = tokio::spawn(async move {
            let mut every = tokio::time::interval(PING_EVERY);
            loop {
                every.tick().await;
                if tx.send(env(Msg::Ping(proto::Ping { id: now_ms() }))).is_err() {
                    break;
                }
            }
        });
        self.push_control();
        (self.notify)(UiEvent::Changed);

        // Silence longer than SILENCE_LIMIT (no Pong, no status) ends the session.
        loop {
            let m = tokio::select! {
                r = timeout(SILENCE_LIMIT, read_msg(&mut rd)) => match r {
                    Ok(Ok(Some(m))) => m,
                    _ => break,
                },
                _ = kick.notified() => break,
            };
            match m.msg {
                Some(Msg::DeviceStatus(s)) => {
                    self.lock().last_status = Some(StatusView::from(&s));
                    self.push_control(); // the heat may change the quality
                    (self.notify)(UiEvent::Changed);
                }
                Some(Msg::Pong(p)) => {
                    let rtt = now_ms().saturating_sub(p.id).min(60_000) as u32;
                    if let Some(s) = self.lock().session.as_mut().filter(|s| s.id == id) {
                        s.rtt_ms = Some(rtt);
                    }
                }
                Some(Msg::CamState(c)) => {
                    let started = {
                        let mut st = self.lock();
                        let mut started = false;
                        // Only Evan's own touches on the iPhone change what the PC
                        // wants; a report sent before our last CamControl arrived
                        // would otherwise undo it (the « Afficher » ping-pong).
                        // Each value only if Evan changed that one: a lens touch
                        // carries the old « live » and must not undo the PC's.
                        let before = st.session.as_ref().filter(|s| s.id == id).and_then(|s| s.cam.clone());
                        if c.by_user {
                            let changed = |f: fn(&proto::CamState) -> (bool, u32)| before.as_ref().map_or(true, |b| f(b) != f(&c));
                            if changed(|s| (s.live, 0)) {
                                started = c.live && !st.cam.live;
                                st.cam.live = c.live;
                            }
                            if changed(|s| (s.front, s.lens)) {
                                st.cam.front = c.front;
                                st.cam.lens = c.lens;
                            }
                        }
                        if let Some(s) = st.session.as_mut().filter(|s| s.id == id) {
                            s.cam = Some(c);
                        }
                        started
                    };
                    self.push_control();
                    if started {
                        (self.notify)(UiEvent::PhoneLive);
                    }
                    (self.notify)(UiEvent::Changed);
                }
                Some(Msg::CamQuality(q)) => {
                    {
                        let mut st = self.lock();
                        st.cam.request.height = q.height;
                        st.cam.request.fps = q.fps;
                    }
                    self.push_control();
                    (self.notify)(UiEvent::CamQuality { height: q.height, fps: q.fps });
                }
                Some(Msg::Forget(_)) => {
                    // « Oublier » on the iPhone (E10).
                    let _ = self.store.forget(&hex);
                    self.lock().last_status = None;
                    break;
                }
                _ => {}
            }
        }
        pinger.abort();
        {
            let mut st = self.lock();
            if st.session.as_ref().is_some_and(|s| s.id == id) {
                st.session = None;
                if st.cam.live {
                    st.resume_live_until = Some(Instant::now() + RESUME_LIVE);
                }
                st.cam.live = false;
            }
        }
        let _ = self.store.touch(&hex, now_unix());
        (self.notify)(UiEvent::Changed);
        Ok(())
    }

    async fn media<S: AsyncRead + AsyncWrite + Unpin>(self: Arc<Self>, mut io: S, fp: Fingerprint) -> std::io::Result<()> {
        if !self.is_paired(&fp) {
            return Ok(());
        }
        // A media connection that goes quiet (Wi-Fi lost) is closed too.
        while let Ok(Ok(Some(m))) = timeout(SILENCE_LIMIT, read_msg(&mut io)).await {
            let Some(Msg::VideoFrame(f)) = m.msg else { continue };
            let sinks: Vec<VideoSink> = {
                let mut st = self.lock();
                st.stats.frames += 1;
                st.stats.bytes += f.data.len() as u64;
                // Paused: only the preview for the window (ADR-0027); the
                // webcam and OBS keep the waiting screen, they get nothing.
                let live = st.cam.live;
                st.video_sinks.iter().filter(|(n, _)| live || n.starts_with(WINDOW_SINK)).map(|(_, s)| s.clone()).collect()
            };
            let mut skipped = false;
            for sink in sinks {
                skipped |= !sink(&f);
            }
            if skipped {
                self.lock().stats.dropped += 1;
                // The skipped reader cannot decode until the next keyframe.
                self.request_key();
            }
        }
        Ok(())
    }

    /// One Drop send (spec `Drop - Photos vers le PC`): the plan, then each
    /// file checked by its SHA-256 and put in its year/month folder.
    async fn drop_in<S: AsyncRead + AsyncWrite + Unpin>(self: Arc<Self>, mut io: S, fp: Fingerprint) -> std::io::Result<()> {
        if !self.is_paired(&fp) {
            return Ok(());
        }
        let target = {
            let mut st = self.lock();
            (st.drop.state != "sending").then(|| {
                st.drop = DropProgress { state: "sending".into(), ..Default::default() };
                st.drop_target.clone()
            })
        };
        let Some((base, sort)) = target else {
            let ack = proto::DropAck { ok: false, reason: "Le PC reçoit déjà un envoi.".into() };
            return write_msg(&mut io, &env(Msg::DropAck(ack))).await;
        };
        (self.notify)(UiEvent::DropStarted);
        let ack = |ok: bool, reason: String| env(Msg::DropAck(proto::DropAck { ok, reason }));
        let mut cur: Option<crate::drop::Incoming> = None;
        let end: Result<u32, String> = loop {
            let m = tokio::select! {
                r = timeout(DROP_SILENCE, read_msg(&mut io)) => match r {
                    Ok(Ok(Some(m))) => m,
                    _ => break Err("Liaison perdue : relance l’envoi depuis l’iPhone.".into()),
                },
                _ = self.drop_stop.notified() => {
                    let _ = write_msg(&mut io, &env(Msg::DropCancel(proto::DropCancel {}))).await;
                    break Err("Envoi annulé.".into());
                }
            };
            match m.msg {
                Some(Msg::DropPlan(p)) => {
                    {
                        let mut st = self.lock();
                        (st.drop.items, st.drop.files, st.drop.bytes) = (p.items, p.files, p.bytes);
                    }
                    if let Err(e) = crate::drop::check_space(&base, p.bytes) {
                        write_msg(&mut io, &ack(false, e.clone())).await?;
                        break Err(e);
                    }
                    write_msg(&mut io, &ack(true, String::new())).await?;
                }
                Some(Msg::DropFile(f)) => {
                    if let Some(old) = cur.take() {
                        old.abort();
                    }
                    match crate::drop::Incoming::start(&base, &sort, &f) {
                        Ok(i) => {
                            cur = Some(i);
                            self.lock().drop.current = f.name;
                        }
                        Err(e) => {
                            write_msg(&mut io, &ack(false, e.clone())).await?;
                            break Err(e);
                        }
                    }
                }
                Some(Msg::DropChunk(c)) => {
                    let Some(i) = cur.as_mut() else { continue };
                    if let Err(e) = i.chunk(&c.data) {
                        write_msg(&mut io, &ack(false, e.clone())).await?;
                        break Err(e);
                    }
                    self.lock().drop.bytes_done += c.data.len() as u64;
                }
                Some(Msg::DropEnd(e)) => {
                    let Some(i) = cur.take() else {
                        write_msg(&mut io, &ack(false, "Fichier inconnu.".into())).await?;
                        continue;
                    };
                    let got = i.received();
                    match i.finish(&e.sha256) {
                        Ok(path) => {
                            {
                                let mut st = self.lock();
                                st.drop.files_done += 1;
                                st.drop.items_done += e.last_of_item as u32;
                                st.drop.folder = path.parent().map(|d| d.display().to_string()).unwrap_or_default();
                            }
                            write_msg(&mut io, &ack(true, String::new())).await?;
                        }
                        // Not fatal: the iPhone sends it once more (E5).
                        Err(why) => {
                            self.lock().drop.bytes_done -= got;
                            write_msg(&mut io, &ack(false, why)).await?;
                        }
                    }
                }
                Some(Msg::DropCancel(_)) => break Err("Envoi annulé sur l’iPhone.".into()),
                Some(Msg::DropDone(d)) => break Ok(d.failed),
                _ => {}
            }
        };
        if let Some(i) = cur {
            i.abort();
        }
        {
            let mut st = self.lock();
            st.drop.current.clear();
            st.drop.rate = 0;
            match end {
                Ok(failed) => {
                    st.drop.state = "done".into();
                    st.drop.failed = failed;
                }
                Err(e) => {
                    st.drop.state = "failed".into();
                    st.drop.message = e;
                }
            }
        }
        (self.notify)(UiEvent::Changed);
        Ok(())
    }
}

impl State {
    fn thermal(&self) -> Thermal {
        match (&self.session, &self.last_status) {
            (Some(_), Some(s)) => s.thermal.unwrap_or(Thermal::Nominal),
            _ => Thermal::Nominal,
        }
    }

    fn control(&self) -> proto::CamControl {
        let eff = cam::effective(self.cam.request, self.thermal(), self.cam.adapt);
        proto::CamControl {
            live: self.cam.live,
            height: eff.quality.height,
            fps: eff.quality.fps,
            bitrate_kbps: eff.quality.bitrate_mbps * 1000,
            codec: if self.h264_readers.is_empty() { self.cam.codec } else { Codec::H264 } as i32,
            front: self.cam.front,
            lens: self.cam.lens,
            exposure_bias_tenths: self.cam.tune.ev_tenths.clamp(-20, 20),
            focus_manual: self.cam.tune.focus.is_some(),
            focus: self.cam.tune.focus.unwrap_or(50).min(100),
            wb_manual: self.cam.tune.wb.is_some(),
            wb_kelvin: self.cam.tune.wb.unwrap_or(5600).clamp(2500, 8000),
            torch: self.cam.tune.torch,
            stabilization: self.cam.tune.stab.min(2),
            mirror: self.cam.mirror,
            turn: self.cam.turn % 4,
            preview: self.cam.preview && !self.cam.live,
        }
    }
}

/// Layout read by `ui/app.js` (Cam): codec u8, keyframe u8, pts i64, width u32,
/// height u32 (little-endian), then the Annex-B data.
pub fn video_packet(f: &proto::VideoFrame) -> Vec<u8> {
    let mut out = Vec::with_capacity(18 + f.data.len());
    out.push(f.codec as u8);
    out.push(f.keyframe as u8);
    out.extend_from_slice(&f.pts_us.to_le_bytes());
    out.extend_from_slice(&f.width.to_le_bytes());
    out.extend_from_slice(&f.height.to_le_bytes());
    out.extend_from_slice(&f.data);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tls::client::{client_config, server_name};
    use std::net::{Ipv4Addr, SocketAddr};
    use tokio_rustls::TlsConnector;

    struct Rig {
        hub: Arc<Hub>,
        addr: SocketAddr,
        events: Arc<Mutex<Vec<UiEvent>>>,
        _dir: tempfile::TempDir,
    }

    async fn rig() -> Rig {
        let dir = tempfile::tempdir().unwrap();
        let events = Arc::new(Mutex::new(Vec::new()));
        let ev = events.clone();
        let hub = Hub::new(
            Identity::generate("pc").unwrap(),
            Store::new(dir.path()).unwrap(),
            "PC-TEST".into(),
            CamWanted {
                live: false,
                request: Quality { height: 1080, fps: 30, bitrate_mbps: 0 },
                adapt: true,
                codec: Codec::Hevc,
                front: false,
                lens: 1,
                mirror: false,
                turn: 0,
                tune: Tune::default(),
                preview: false,
            },
            Box::new(move |e| ev.lock().unwrap().push(e)),
        )
        .unwrap();
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(hub.clone().serve(listener));
        Rig { hub, addr, events, _dir: dir }
    }

    type Phone = tokio_rustls::client::TlsStream<TcpStream>;

    async fn connect(addr: SocketAddr, phone: &Identity, pinned: Fingerprint) -> std::io::Result<Phone> {
        let tcp = TcpStream::connect(addr).await?;
        TlsConnector::from(client_config(phone, pinned)).connect(server_name(), tcp).await
    }

    async fn send(io: &mut Phone, m: Msg) {
        write_msg(io, &env(m)).await.unwrap();
    }

    /// Next message, Pings skipped (they come every 5 s, at any time).
    async fn recv(io: &mut Phone) -> Option<Msg> {
        loop {
            let m = timeout(Duration::from_secs(5), read_msg(io)).await.unwrap().unwrap().and_then(|e| e.msg);
            if !matches!(m, Some(Msg::Ping(_))) {
                return m;
            }
        }
    }

    fn request(offer: &PairOffer) -> Msg {
        Msg::PairRequest(proto::PairRequest {
            protocol_version: PROTOCOL_VERSION,
            token: offer.token.to_vec(),
            device_name: "iPhone d’Evan".into(),
            model: "iPhone17,2".into(),
            app_version: "0.2.0".into(),
        })
    }

    async fn pair(r: &Rig, phone: &Identity) -> Phone {
        let offer = r.hub.issue_offer(Ipv4Addr::LOCALHOST, r.addr.port());
        let mut io = connect(r.addr, phone, offer.pc_fingerprint).await.unwrap();
        send(&mut io, request(&offer)).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::PairPending(p)) if p.pc_name == "PC-TEST"));
        send(&mut io, Msg::PairConfirm(proto::PairConfirm { accept: true })).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::PairDone(_))));
        io
    }

    async fn wait_until(mut f: impl FnMut() -> bool) {
        for _ in 0..100 {
            if f() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        panic!("condition not reached");
    }

    #[tokio::test]
    async fn pairing_then_reconnect_without_scan() {
        let r = rig().await;
        let phone = Identity::generate("phone").unwrap();
        let mut io = pair(&r, &phone).await;
        // The session starts at once: the PC sends the camera settings.
        assert!(matches!(recv(&mut io).await, Some(Msg::CamControl(c)) if !c.live && c.height == 1080));
        let code = pairing::pairing_code(&r.hub.identity.fingerprint, &phone.fingerprint);
        assert!(r.events.lock().unwrap().contains(&UiEvent::PairCode { code, device_name: "iPhone d’Evan".into() }));
        assert_eq!(r.hub.store.devices().len(), 1);
        drop(io);
        wait_until(|| r.hub.view().connected.is_none()).await;

        let mut io = connect(r.addr, &phone, r.hub.identity.fingerprint).await.unwrap();
        send(&mut io, Msg::Hello(proto::Hello { protocol_version: PROTOCOL_VERSION, ..Default::default() })).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::Welcome(w)) if w.pc_name == "PC-TEST"));
        wait_until(|| r.hub.view().connected == Some(phone.fingerprint)).await;
    }

    #[tokio::test]
    async fn saying_no_on_the_iphone_keeps_nothing() {
        let r = rig().await;
        let phone = Identity::generate("phone").unwrap();
        let offer = r.hub.issue_offer(Ipv4Addr::LOCALHOST, r.addr.port());
        let mut io = connect(r.addr, &phone, offer.pc_fingerprint).await.unwrap();
        send(&mut io, request(&offer)).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::PairPending(_))));
        send(&mut io, Msg::PairConfirm(proto::PairConfirm { accept: false })).await;
        wait_until(|| r.events.lock().unwrap().contains(&UiEvent::PairEnded { message: None })).await;
        assert!(r.hub.store.devices().is_empty());
    }

    #[tokio::test]
    async fn reused_token_is_refused_over_the_network() {
        let r = rig().await;
        let offer = r.hub.issue_offer(Ipv4Addr::LOCALHOST, r.addr.port());
        let a = Identity::generate("a").unwrap();
        let mut io = connect(r.addr, &a, offer.pc_fingerprint).await.unwrap();
        send(&mut io, request(&offer)).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::PairPending(_))));

        let b = Identity::generate("b").unwrap();
        let mut io2 = connect(r.addr, &b, offer.pc_fingerprint).await.unwrap();
        send(&mut io2, request(&offer)).await;
        assert!(matches!(recv(&mut io2).await, Some(Msg::Refused(x)) if x.reason == Reason::AlreadyUsed as i32));
    }

    #[tokio::test]
    async fn unknown_token_is_refused() {
        let r = rig().await;
        let mut offer = r.hub.issue_offer(Ipv4Addr::LOCALHOST, r.addr.port());
        offer.token = [0; pairing::TOKEN_LEN];
        let phone = Identity::generate("phone").unwrap();
        let mut io = connect(r.addr, &phone, offer.pc_fingerprint).await.unwrap();
        send(&mut io, request(&offer)).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::Refused(x)) if x.reason == Reason::UnknownToken as i32));
    }

    #[tokio::test]
    async fn fake_pc_fails_the_tls_handshake() {
        let r = rig().await;
        let phone = Identity::generate("phone").unwrap();
        let other = Identity::generate("fake").unwrap();
        assert!(connect(r.addr, &phone, other.fingerprint).await.is_err());
    }

    #[tokio::test]
    async fn unknown_iphone_hello_is_refused() {
        let r = rig().await;
        let stranger = Identity::generate("stranger").unwrap();
        let mut io = connect(r.addr, &stranger, r.hub.identity.fingerprint).await.unwrap();
        send(&mut io, Msg::Hello(proto::Hello { protocol_version: PROTOCOL_VERSION, ..Default::default() })).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::Refused(x)) if x.reason == Reason::UnknownDevice as i32));
    }

    #[tokio::test]
    async fn heat_lowers_the_camera_and_status_is_kept() {
        let r = rig().await;
        let phone = Identity::generate("phone").unwrap();
        let mut io = pair(&r, &phone).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::CamControl(_))));
        let cam = r.hub.lock().cam;
        r.hub.set_cam(CamWanted { live: true, request: Quality { height: 2160, fps: 60, bitrate_mbps: 0 }, ..cam });
        assert!(matches!(recv(&mut io).await, Some(Msg::CamControl(c)) if c.live && c.fps == 60));
        send(
            &mut io,
            Msg::DeviceStatus(proto::DeviceStatus { battery_percent: 14, thermal: proto::Thermal::Critical as i32, ..Default::default() }),
        )
        .await;
        assert!(matches!(recv(&mut io).await, Some(Msg::CamControl(c)) if c.height == 1080 && c.fps == 30));
        assert_eq!(r.hub.view().status.unwrap().battery, Some(14));
    }

    #[tokio::test]
    async fn forget_on_the_pc_tells_the_iphone() {
        let r = rig().await;
        let phone = Identity::generate("phone").unwrap();
        let mut io = pair(&r, &phone).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::CamControl(_))));
        r.hub.forget().unwrap();
        assert!(matches!(recv(&mut io).await, Some(Msg::Forget(_))));
        assert!(r.hub.store.devices().is_empty());
    }

    #[tokio::test]
    async fn video_reaches_the_window() {
        let r = rig().await;
        let phone = Identity::generate("phone").unwrap();
        let _ctl = pair(&r, &phone).await;
        let got = Arc::new(Mutex::new(Vec::<Vec<u8>>::new()));
        let g = got.clone();
        r.hub.set_video_sink("window", Some(Arc::new(move |f| {
            g.lock().unwrap().push(video_packet(f));
            true
        })));
        let mut media = connect(r.addr, &phone, r.hub.identity.fingerprint).await.unwrap();
        send(&mut media, Msg::VideoHello(proto::VideoHello {})).await;
        let frame = proto::VideoFrame {
            pts_us: 42,
            keyframe: true,
            codec: Codec::Hevc as i32,
            width: 1920,
            height: 1080,
            data: vec![0, 0, 0, 1, 0x40, 0x01].into(),
        };
        send(&mut media, Msg::VideoFrame(frame.clone())).await;
        wait_until(|| !got.lock().unwrap().is_empty()).await;
        let p = got.lock().unwrap()[0].clone();
        assert_eq!(p, video_packet(&frame));
        assert_eq!((p[0], p[1]), (Codec::Hevc as u8, 1));
        assert_eq!(u32::from_le_bytes(p[10..14].try_into().unwrap()), 1920);
        assert_eq!(&p[18..], &frame.data[..]);
    }

    #[tokio::test]
    async fn a_drop_send_lands_checked_in_its_month() {
        use sha2::{Digest, Sha256};
        let r = rig().await;
        let photos = tempfile::tempdir().unwrap();
        r.hub.set_drop_target(photos.path().to_path_buf(), "year_month".into());
        let phone = Identity::generate("phone").unwrap();
        let _ctl = pair(&r, &phone).await;
        let mut io = connect(r.addr, &phone, r.hub.identity.fingerprint).await.unwrap();
        send(&mut io, Msg::DropHello(proto::DropHello {})).await;
        send(&mut io, Msg::DropPlan(proto::DropPlan { items: 1, files: 1, bytes: 3_000_000 })).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::DropAck(a)) if a.ok));
        let data: Vec<u8> = (0..3_000_000u32).map(|i| i as u8).collect();
        let file = proto::DropFile { name: "IMG_7.HEIC".into(), size: data.len() as u64, taken_unix: 0, year: 2025, month: 3 };
        send(&mut io, Msg::DropFile(file.clone())).await;
        for c in data.chunks(1 << 20) {
            send(&mut io, Msg::DropChunk(proto::DropChunk { data: c.to_vec() })).await;
        }
        // A wrong hash first: refused, nothing kept; then the right one.
        send(&mut io, Msg::DropEnd(proto::DropEnd { sha256: vec![0; 32], last_of_item: true })).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::DropAck(a)) if !a.ok && a.reason.contains("empreinte")));
        send(&mut io, Msg::DropFile(file)).await;
        for c in data.chunks(1 << 20) {
            send(&mut io, Msg::DropChunk(proto::DropChunk { data: c.to_vec() })).await;
        }
        send(&mut io, Msg::DropEnd(proto::DropEnd { sha256: Sha256::digest(&data).to_vec(), last_of_item: true })).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::DropAck(a)) if a.ok));
        send(&mut io, Msg::DropDone(proto::DropDone { failed: 0 })).await;
        wait_until(|| r.hub.view().drop.state == "done").await;
        let d = r.hub.view().drop;
        assert_eq!((d.items_done, d.files_done, d.bytes_done), (1, 1, 3_000_000));
        let month = photos.path().join("2025").join("03");
        assert_eq!(std::fs::read(month.join("IMG_7.HEIC")).unwrap(), data);
        assert_eq!(std::fs::read_dir(&month).unwrap().count(), 1, "no .part left");
        assert!(r.events.lock().unwrap().contains(&UiEvent::DropStarted));
    }

    #[tokio::test]
    async fn a_drop_bigger_than_the_disk_is_refused() {
        let r = rig().await;
        let photos = tempfile::tempdir().unwrap();
        r.hub.set_drop_target(photos.path().to_path_buf(), "year_month".into());
        if crate::drop::free_space(photos.path()).is_none() {
            return;
        }
        let phone = Identity::generate("phone").unwrap();
        let _ctl = pair(&r, &phone).await;
        let mut io = connect(r.addr, &phone, r.hub.identity.fingerprint).await.unwrap();
        send(&mut io, Msg::DropHello(proto::DropHello {})).await;
        send(&mut io, Msg::DropPlan(proto::DropPlan { items: 1, files: 1, bytes: u64::MAX / 4 })).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::DropAck(a)) if !a.ok && a.reason.starts_with("Il manque")));
        wait_until(|| r.hub.view().drop.state == "failed").await;
    }

    #[tokio::test]
    async fn the_paused_preview_reaches_the_window_only() {
        let r = rig().await;
        let phone = Identity::generate("phone").unwrap();
        let mut ctl = pair(&r, &phone).await;
        assert!(matches!(recv(&mut ctl).await, Some(Msg::CamControl(c)) if !c.preview));
        r.hub.update_cam(|c| c.preview = true);
        assert!(matches!(recv(&mut ctl).await, Some(Msg::CamControl(c)) if c.preview && !c.live));
        let count = |n: &Arc<Mutex<usize>>| *n.lock().unwrap();
        let (win, cam) = (Arc::new(Mutex::new(0usize)), Arc::new(Mutex::new(0usize)));
        let (w, c) = (win.clone(), cam.clone());
        r.hub.set_video_sink("window-0", Some(Arc::new(move |_| { *w.lock().unwrap() += 1; true })));
        r.hub.set_video_sink("vcam-0", Some(Arc::new(move |_| { *c.lock().unwrap() += 1; true })));
        let mut media = connect(r.addr, &phone, r.hub.identity.fingerprint).await.unwrap();
        send(&mut media, Msg::VideoHello(proto::VideoHello {})).await;
        let frame = proto::VideoFrame { keyframe: true, codec: Codec::H264 as i32, width: 854, height: 480, ..Default::default() };
        send(&mut media, Msg::VideoFrame(frame.clone())).await;
        wait_until(|| count(&win) == 1).await;
        assert_eq!(count(&cam), 0, "the webcam keeps the waiting screen");
        // Live: the preview flag goes, everyone gets the picture.
        r.hub.set_live(true);
        assert!(matches!(recv(&mut ctl).await, Some(Msg::CamControl(c)) if c.live && !c.preview));
        send(&mut media, Msg::VideoFrame(frame)).await;
        wait_until(|| count(&cam) == 1).await;
        assert_eq!(count(&win), 2);
    }

    #[tokio::test]
    async fn a_late_iphone_report_does_not_undo_afficher_on_the_pc() {
        let r = rig().await;
        let phone = Identity::generate("phone").unwrap();
        let mut io = pair(&r, &phone).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::CamControl(_))));
        r.hub.set_live(true);
        assert!(matches!(recv(&mut io).await, Some(Msg::CamControl(c)) if c.live));
        // Sent by the iPhone before it got the CamControl: Cam tab still closed.
        send(&mut io, Msg::CamState(proto::CamState { open: false, live: false, by_user: false, ..Default::default() })).await;
        wait_until(|| r.hub.view().phone_cam.is_some_and(|c| !c.open)).await;
        assert!(r.hub.view().live, "the PC must keep « Afficher »");
    }

    #[tokio::test]
    async fn afficher_on_the_iphone_switches_the_pc() {
        let r = rig().await;
        let phone = Identity::generate("phone").unwrap();
        let mut io = pair(&r, &phone).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::CamControl(_))));
        send(&mut io, Msg::CamState(proto::CamState { open: true, live: true, lens: 2, by_user: true, ..Default::default() })).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::CamControl(c)) if c.live && c.lens == 2));
        assert!(r.hub.view().live);
        assert!(r.events.lock().unwrap().contains(&UiEvent::PhoneLive));
        // « Pause » on the iPhone pauses the PC too.
        send(&mut io, Msg::CamState(proto::CamState { open: true, live: false, lens: 2, by_user: true, ..Default::default() })).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::CamControl(c)) if !c.live));
    }

    #[tokio::test]
    async fn a_lens_touch_on_the_iphone_keeps_afficher_from_the_pc() {
        let r = rig().await;
        let phone = Identity::generate("phone").unwrap();
        let mut io = pair(&r, &phone).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::CamControl(_))));
        send(&mut io, Msg::CamState(proto::CamState { open: true, live: false, lens: 1, ..Default::default() })).await;
        wait_until(|| r.hub.view().phone_cam.is_some()).await;
        r.hub.set_live(true);
        assert!(matches!(recv(&mut io).await, Some(Msg::CamControl(c)) if c.live));
        // Lens touched before the iPhone saw « Afficher »: old live, new lens.
        send(&mut io, Msg::CamState(proto::CamState { open: true, live: false, lens: 3, by_user: true, ..Default::default() })).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::CamControl(c)) if c.live && c.lens == 3));
        assert!(r.hub.view().live);
    }

    #[tokio::test]
    async fn reconnecter_ends_the_link_and_afficher_comes_back() {
        let r = rig().await;
        let phone = Identity::generate("phone").unwrap();
        let mut io = pair(&r, &phone).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::CamControl(_))));
        r.hub.set_live(true);
        assert!(matches!(recv(&mut io).await, Some(Msg::CamControl(c)) if c.live));
        // « Reconnecter » on the PC: the iPhone sees the end of the link.
        r.hub.drop_session();
        loop {
            match timeout(Duration::from_secs(5), read_msg(&mut io)).await.unwrap() {
                Ok(Some(_)) => continue,
                _ => break,
            }
        }
        wait_until(|| r.hub.view().connected.is_none()).await;
        assert!(!r.hub.view().live);
        // Back within 5 minutes: live again without a click.
        let mut io = connect(r.addr, &phone, r.hub.identity.fingerprint).await.unwrap();
        send(&mut io, Msg::Hello(proto::Hello { protocol_version: PROTOCOL_VERSION, ..Default::default() })).await;
        assert!(matches!(recv(&mut io).await, Some(Msg::Welcome(_))));
        assert!(matches!(recv(&mut io).await, Some(Msg::CamControl(c)) if c.live));
    }

    #[test]
    fn a_keyed_reader_skips_until_the_next_keyframe() {
        let sent = Arc::new(Mutex::new(Vec::new()));
        let full = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let (s, f) = (sent.clone(), full.clone());
        let sink = keyed_sink(move |fr| {
            if f.load(std::sync::atomic::Ordering::Relaxed) {
                return false;
            }
            s.lock().unwrap().push(fr.pts_us);
            true
        });
        let frame = |pts, keyframe| proto::VideoFrame { pts_us: pts, keyframe, ..Default::default() };
        assert!(sink(&frame(1, false)), "before the first keyframe: dropped quietly");
        assert!(sink(&frame(2, true)));
        full.store(true, std::sync::atomic::Ordering::Relaxed);
        assert!(!sink(&frame(3, false)), "the reader was full");
        full.store(false, std::sync::atomic::Ordering::Relaxed);
        assert!(sink(&frame(4, false)), "depends on the lost frame: dropped");
        assert!(sink(&frame(5, true)));
        assert_eq!(*sent.lock().unwrap(), vec![2, 5]);
    }

    #[tokio::test]
    async fn a_slow_reader_asks_the_iphone_for_a_keyframe_once() {
        let r = rig().await;
        let phone = Identity::generate("phone").unwrap();
        let mut ctl = pair(&r, &phone).await;
        assert!(matches!(recv(&mut ctl).await, Some(Msg::CamControl(_))));
        r.hub.set_video_sink("window", Some(Arc::new(|_| false)));
        let mut media = connect(r.addr, &phone, r.hub.identity.fingerprint).await.unwrap();
        send(&mut media, Msg::VideoHello(proto::VideoHello {})).await;
        for _ in 0..3 {
            send(&mut media, Msg::VideoFrame(proto::VideoFrame { data: vec![0, 0, 0, 1].into(), ..Default::default() })).await;
        }
        assert!(matches!(recv(&mut ctl).await, Some(Msg::KeyRequest(_))));
        wait_until(|| r.hub.view().stats.dropped == 3).await;
        // Rate limited: three drops in a row, one request.
        let more = timeout(Duration::from_millis(150), recv(&mut ctl)).await;
        assert!(more.is_err(), "only one KeyRequest expected");
    }
}
