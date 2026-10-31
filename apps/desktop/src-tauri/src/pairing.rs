//! QR pairing (spec `Core - Appairage QR`): QR content (E2), single-use token
//! (E3), checks on `PairRequest` (E5) and the 4-digit code (E6).
//! The TLS tunnel (E4) is not written yet: the fingerprint check below is the
//! one the iPhone will run on the PC certificate.

use std::net::IpAddr;
use std::time::{Duration, Instant};

use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64;
use base64::Engine;
use rand::RngCore;
use sha2::{Digest, Sha256};

use crate::identity::{fingerprint_of, Fingerprint};

pub const PROTOCOL_VERSION: u32 = 1;
pub const URI_PREFIX: &str = "hyphn://pair?";
pub const TOKEN_TTL: Duration = Duration::from_secs(120);

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PairError {
    #[error("Ce QR code ne vient pas de Hyphn.")]
    NotHyphn,
    #[error("Ce QR code est abîmé.")]
    Malformed,
    #[error("Versions différentes : mets à jour Hyphn sur le PC et l’iPhone.")]
    WrongVersion,
    #[error("Ce QR a expiré. Clique « Nouveau QR » sur le PC.")]
    Expired,
    #[error("Ce QR a déjà servi. Clique « Nouveau QR » sur le PC.")]
    AlreadyUsed,
    #[error("Ce QR n’est plus valable. Clique « Nouveau QR » sur le PC.")]
    UnknownToken,
    #[error("PC introuvable ou faux QR.")]
    WrongFingerprint,
}

/// What the QR code carries. Nothing in it is a long-term secret.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PairOffer {
    pub version: u32,
    pub host: IpAddr,
    pub port: u16,
    pub pc_fingerprint: Fingerprint,
    pub token: [u8; 16],
}

impl PairOffer {
    pub fn to_uri(&self) -> String {
        format!(
            "{URI_PREFIX}v={}&h={}&p={}&fp={}&t={}",
            self.version,
            self.host,
            self.port,
            B64.encode(self.pc_fingerprint),
            B64.encode(self.token)
        )
    }

    /// Parsing done by the iPhone after the scan.
    pub fn parse(uri: &str) -> Result<Self, PairError> {
        let query = uri.strip_prefix(URI_PREFIX).ok_or(PairError::NotHyphn)?;
        let (mut v, mut h, mut p, mut fp, mut t) = (None, None, None, None, None);
        for pair in query.split('&') {
            let (k, val) = pair.split_once('=').ok_or(PairError::Malformed)?;
            match k {
                "v" => v = val.parse::<u32>().ok(),
                "h" => h = val.parse::<IpAddr>().ok(),
                "p" => p = val.parse::<u16>().ok(),
                "fp" => fp = B64.decode(val).ok().and_then(|b| b.try_into().ok()),
                "t" => t = B64.decode(val).ok().and_then(|b| b.try_into().ok()),
                _ => {}
            }
        }
        let version = v.ok_or(PairError::Malformed)?;
        if version != PROTOCOL_VERSION {
            return Err(PairError::WrongVersion);
        }
        Ok(Self {
            version,
            host: h.ok_or(PairError::Malformed)?,
            port: p.ok_or(PairError::Malformed)?,
            pc_fingerprint: fp.ok_or(PairError::Malformed)?,
            token: t.ok_or(PairError::Malformed)?,
        })
    }
}

/// Sent by the iPhone inside the TLS tunnel (E5). The device fingerprint comes
/// from its TLS client certificate, not from the message.
#[derive(Debug, Clone)]
pub struct PairRequest {
    pub protocol_version: u32,
    pub token: [u8; 16],
    pub device_name: String,
    pub model: String,
    /// Logged by the real receiver, not checked.
    #[allow(dead_code)]
    pub app_version: String,
}

#[derive(Debug, Clone)]
pub struct PendingPair {
    pub device_name: String,
    pub model: String,
    pub fingerprint: Fingerprint,
    pub code: String,
}

struct ActiveToken {
    value: [u8; 16],
    issued: Instant,
    used: bool,
}

/// PC side of the pairing: one token at a time, then one pending device until
/// Evan says yes or no.
#[derive(Default)]
pub struct PairingSession {
    token: Option<ActiveToken>,
    pending: Option<PendingPair>,
}

impl PairingSession {
    /// Creates a new QR offer and cancels the previous token (E3, « Nouveau QR »).
    pub fn issue(&mut self, host: IpAddr, port: u16, pc_fingerprint: Fingerprint, now: Instant) -> PairOffer {
        let mut token = [0u8; 16];
        rand::rngs::OsRng.fill_bytes(&mut token);
        self.token = Some(ActiveToken { value: token, issued: now, used: false });
        self.pending = None;
        PairOffer { version: PROTOCOL_VERSION, host, port, pc_fingerprint, token }
    }

    /// Seconds left before the current token expires (0 if none).
    pub fn seconds_left(&self, now: Instant) -> u64 {
        match &self.token {
            Some(t) if !t.used => TOKEN_TTL.saturating_sub(now.duration_since(t.issued)).as_secs(),
            _ => 0,
        }
    }

    pub fn handle_request(
        &mut self,
        req: &PairRequest,
        device_fingerprint: Fingerprint,
        pc_fingerprint: &Fingerprint,
        now: Instant,
    ) -> Result<PendingPair, PairError> {
        if req.protocol_version != PROTOCOL_VERSION {
            return Err(PairError::WrongVersion);
        }
        let active = self.token.as_mut().ok_or(PairError::UnknownToken)?;
        if !constant_time_eq(&active.value, &req.token) {
            return Err(PairError::UnknownToken);
        }
        if active.used {
            return Err(PairError::AlreadyUsed);
        }
        if now.duration_since(active.issued) >= TOKEN_TTL {
            return Err(PairError::Expired);
        }
        active.used = true;
        let pending = PendingPair {
            device_name: req.device_name.clone(),
            model: req.model.clone(),
            fingerprint: device_fingerprint,
            code: pairing_code(pc_fingerprint, &device_fingerprint),
        };
        self.pending = Some(pending.clone());
        Ok(pending)
    }

    /// Evan's answer on the PC. Returns the device to keep if he said yes.
    pub fn answer(&mut self, accept: bool) -> Option<PendingPair> {
        let pending = self.pending.take();
        if accept { pending } else { None }
    }
}

/// 4 digits from both fingerprints, the same on both sides whatever the order (E6).
pub fn pairing_code(a: &Fingerprint, b: &Fingerprint) -> String {
    let (first, second) = if a <= b { (a, b) } else { (b, a) };
    let mut h = Sha256::new();
    h.update(b"hyphn-pair-code");
    h.update(first);
    h.update(second);
    let d = h.finalize();
    let n = u32::from_be_bytes([d[0], d[1], d[2], d[3]]) % 10_000;
    format!("{n:04}")
}

/// iPhone side of E4: the PC certificate is accepted only if its fingerprint is the QR one.
pub fn check_pinned(expected: &Fingerprint, presented_cert_der: &[u8]) -> Result<(), PairError> {
    if constant_time_eq(expected, &fingerprint_of(presented_cert_der)) {
        Ok(())
    } else {
        Err(PairError::WrongFingerprint)
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::Identity;
    use std::net::Ipv4Addr;

    fn setup() -> (PairingSession, PairOffer, Identity, Identity, Instant) {
        let pc = Identity::generate("pc").unwrap();
        let phone = Identity::generate("phone").unwrap();
        let now = Instant::now();
        let mut s = PairingSession::default();
        let offer = s.issue(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 20)), 47800, pc.fingerprint, now);
        (s, offer, pc, phone, now)
    }

    fn request(token: [u8; 16]) -> PairRequest {
        PairRequest {
            protocol_version: PROTOCOL_VERSION,
            token,
            device_name: "iPhone".into(),
            model: "iPhone17,2".into(),
            app_version: "0.1.0".into(),
        }
    }

    #[test]
    fn uri_round_trip() {
        let (_, offer, ..) = setup();
        let uri = offer.to_uri();
        assert!(uri.starts_with("hyphn://pair?v=1&h=192.168.1.20&p=47800&"));
        assert_eq!(PairOffer::parse(&uri).unwrap(), offer);
    }

    #[test]
    fn foreign_qr_is_refused() {
        assert_eq!(PairOffer::parse("https://example.com"), Err(PairError::NotHyphn));
        assert_eq!(PairOffer::parse("hyphn://pair?v=1&h=nope"), Err(PairError::Malformed));
    }

    #[test]
    fn wrong_version_is_refused() {
        let (mut s, offer, pc, phone, now) = setup();
        let uri = offer.to_uri().replace("v=1", "v=2");
        assert_eq!(PairOffer::parse(&uri), Err(PairError::WrongVersion));
        let mut req = request(offer.token);
        req.protocol_version = 2;
        assert_eq!(
            s.handle_request(&req, phone.fingerprint, &pc.fingerprint, now).unwrap_err(),
            PairError::WrongVersion
        );
    }

    #[test]
    fn valid_token_gives_same_code_on_both_sides() {
        let (mut s, offer, pc, phone, now) = setup();
        let p = s
            .handle_request(&request(offer.token), phone.fingerprint, &pc.fingerprint, now)
            .unwrap();
        assert_eq!(p.code.len(), 4);
        assert_eq!(p.code, pairing_code(&phone.fingerprint, &pc.fingerprint));
        assert!(s.answer(true).is_some());
    }

    #[test]
    fn expired_token_is_refused() {
        let (mut s, offer, pc, phone, now) = setup();
        let later = now + TOKEN_TTL;
        assert_eq!(
            s.handle_request(&request(offer.token), phone.fingerprint, &pc.fingerprint, later)
                .unwrap_err(),
            PairError::Expired
        );
        assert_eq!(s.seconds_left(later), 0);
    }

    #[test]
    fn reused_token_is_refused() {
        let (mut s, offer, pc, phone, now) = setup();
        s.handle_request(&request(offer.token), phone.fingerprint, &pc.fingerprint, now)
            .unwrap();
        assert_eq!(
            s.handle_request(&request(offer.token), phone.fingerprint, &pc.fingerprint, now)
                .unwrap_err(),
            PairError::AlreadyUsed
        );
    }

    #[test]
    fn new_qr_cancels_old_token() {
        let (mut s, old, pc, phone, now) = setup();
        s.issue(old.host, old.port, pc.fingerprint, now);
        assert_eq!(
            s.handle_request(&request(old.token), phone.fingerprint, &pc.fingerprint, now)
                .unwrap_err(),
            PairError::UnknownToken
        );
    }

    #[test]
    fn wrong_fingerprint_is_refused() {
        let (_, offer, pc, phone, _) = setup();
        assert!(check_pinned(&offer.pc_fingerprint, &pc.cert_der).is_ok());
        assert_eq!(
            check_pinned(&offer.pc_fingerprint, &phone.cert_der),
            Err(PairError::WrongFingerprint)
        );
    }

    #[test]
    fn saying_no_keeps_nothing() {
        let (mut s, offer, pc, phone, now) = setup();
        s.handle_request(&request(offer.token), phone.fingerprint, &pc.fingerprint, now)
            .unwrap();
        assert!(s.answer(false).is_none());
        assert!(s.answer(true).is_none());
    }
}
