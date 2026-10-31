//! The PC end of the network (specs `Core - Appairage QR`, `Core - Reconnexion`,
//! `Infos iPhone - Batterie et chaleur`, `Cam - Flux v1`): one TLS port, three
//! kinds of connection told apart by their first message.
//! - `PairRequest`: checks the QR token, shows the code, waits for « Oui » on the iPhone.
//! - `Hello`: a paired iPhone comes back; it becomes the control session.
//! - `VideoHello`: the camera stream, passed to the window as it comes.

use std::net::IpAddr;
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

/// Called with each video packet for the window; false = the window did not take it.
pub type VideoSink = Arc<dyn Fn(Vec<u8>) -> bool + Send + Sync>;

struct Session {
    id: u64,
    fingerprint: Fingerprint,
    tx: UnboundedSender<Envelope>,
    rtt_ms: Option<u32>,
    cam: Option<proto::CamState>,
}

pub struct State {
    pub pairing: PairingSession,
    session: Option<Session>,
    next_id: u64,
    /// Kept after the iPhone leaves, shown greyed (E5).
    pub last_status: Option<StatusView>,
    pub cam: CamWanted,
    sent_control: Option<proto::CamControl>,
    stats: CamStats,
    video_sink: Option<VideoSink>,
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
}

pub struct Hub {
    pub identity: Identity,
    pub store: Store,
    pub pc_name: String,
    state: Mutex<State>,
    notify: Box<dyn Fn(UiEvent) + Send + Sync>,
    tls: TlsAcceptor,
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
                video_sink: None,
            }),
            notify,
            tls,
        }))
    }

    pub fn lock(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn issue_offer(&self, host: IpAddr, port: u16) -> PairOffer {
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
        }
    }

    pub fn set_cam(&self, wanted: CamWanted) {
        self.lock().cam = wanted;
        self.push_control();
    }

    pub fn set_video_sink(&self, sink: Option<VideoSink>) {
        self.lock().video_sink = sink;
    }

    /// Once per second: turns the frame counters into fps and Mb/s.
    pub fn tick(&self) {
        let mut st = self.lock();
        let s = &mut st.stats;
        s.fps = s.frames as f32;
        s.bitrate_mbps = s.bytes as f32 * 8.0 / 1e6;
        s.frames = 0;
        s.bytes = 0;
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
        let Ok(token) = <[u8; 16]>::try_from(r.token.as_slice()) else {
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
        let id = {
            let mut st = self.lock();
            st.next_id += 1;
            let id = st.next_id;
            // A newer connection from the same iPhone replaces the old one.
            st.session = Some(Session { id, fingerprint: fp, tx: tx.clone(), rtt_ms: None, cam: None });
            st.sent_control = None;
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

        while let Ok(Some(m)) = read_msg(&mut rd).await {
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
                    {
                        let mut st = self.lock();
                        // The iPhone may change these itself: the PC follows.
                        st.cam.live = c.live;
                        st.cam.front = c.front;
                        st.cam.lens = c.lens;
                        if let Some(s) = st.session.as_mut().filter(|s| s.id == id) {
                            s.cam = Some(c);
                        }
                    }
                    self.push_control();
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
        while let Ok(Some(m)) = read_msg(&mut io).await {
            let Some(Msg::VideoFrame(f)) = m.msg else { continue };
            let sink = {
                let mut st = self.lock();
                st.stats.frames += 1;
                st.stats.bytes += f.data.len() as u64;
                st.video_sink.clone()
            };
            if let Some(sink) = sink {
                if !sink(video_packet(&f)) {
                    self.lock().stats.dropped += 1;
                }
            }
        }
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
            codec: self.cam.codec as i32,
            front: self.cam.front,
            lens: self.cam.lens,
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

    async fn recv(io: &mut Phone) -> Option<Msg> {
        timeout(Duration::from_secs(5), read_msg(io)).await.unwrap().unwrap().and_then(|e| e.msg)
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
        let offer = r.hub.issue_offer(IpAddr::V4(Ipv4Addr::LOCALHOST), r.addr.port());
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
        let offer = r.hub.issue_offer(IpAddr::V4(Ipv4Addr::LOCALHOST), r.addr.port());
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
        let offer = r.hub.issue_offer(IpAddr::V4(Ipv4Addr::LOCALHOST), r.addr.port());
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
        let mut offer = r.hub.issue_offer(IpAddr::V4(Ipv4Addr::LOCALHOST), r.addr.port());
        offer.token = [0; 16];
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
        r.hub.set_video_sink(Some(Arc::new(move |p| {
            g.lock().unwrap().push(p);
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
            data: vec![0, 0, 0, 1, 0x40, 0x01],
        };
        send(&mut media, Msg::VideoFrame(frame.clone())).await;
        wait_until(|| !got.lock().unwrap().is_empty()).await;
        let p = got.lock().unwrap()[0].clone();
        assert_eq!(p, video_packet(&frame));
        assert_eq!((p[0], p[1]), (Codec::Hevc as u8, 1));
        assert_eq!(u32::from_le_bytes(p[10..14].try_into().unwrap()), 1920);
        assert_eq!(&p[18..], &frame.data[..]);
    }
}
