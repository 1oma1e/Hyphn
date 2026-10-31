//! QR pairing (spec `Core - Appairage QR`): QR content (E2), single-use token
//! (E3), checks on `PairRequest` (E5) and the 4-digit code (E6). The TLS tunnel
//! (E4) and the messages are in `link`.

use std::net::IpAddr;
use std::time::{Duration, Instant};

use rand::RngCore;
use sha2::{Digest, Sha256};

#[cfg(test)]
use crate::identity::fingerprint_of;
use crate::identity::Fingerprint;

pub const PROTOCOL_VERSION: u32 = 1;
/// Uppercase only, so the whole QR fits the compact alphanumeric mode.
pub const URI_PREFIX: &str = "HYPHN:";
pub const TOKEN_TTL: Duration = Duration::from_secs(120);
/// The QR carries the first half of the PC fingerprint (128 bits, still
/// impossible to forge); the iPhone keeps the full one after the handshake.
pub const QR_FINGERPRINT_LEN: usize = 16;
pub const TOKEN_LEN: usize = 8;
pub type Token = [u8; TOKEN_LEN];

/// The QR-reading variants are produced by the iPhone; the PC keeps them for its tests.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[cfg_attr(not(test), allow(dead_code))]
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
    pub token: Token,
}

/// What the iPhone reads from the QR (`PairOffer.parse` in Swift).
#[cfg(test)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScannedQr {
    pub host: IpAddr,
    pub port: u16,
    pub fingerprint_prefix: [u8; QR_FINGERPRINT_LEN],
    pub token: Token,
}

impl PairOffer {
    /// `HYPHN:1/192.168.1.20/47800/<fingerprint half>/<token>`, base32 (E2).
    pub fn to_uri(&self) -> String {
        format!(
            "{URI_PREFIX}{}/{}/{}/{}/{}",
            self.version,
            self.host,
            self.port,
            base32(&self.pc_fingerprint[..QR_FINGERPRINT_LEN]),
            base32(&self.token)
        )
        .to_uppercase()
    }

    /// Parsing done by the iPhone after the scan, kept here to test the format
    /// from both ends.
    #[cfg(test)]
    pub fn parse(uri: &str) -> Result<ScannedQr, PairError> {
        let uri = uri.to_uppercase();
        let rest = uri.strip_prefix(URI_PREFIX).ok_or(PairError::NotHyphn)?;
        let parts: Vec<&str> = rest.split('/').collect();
        let version = parts.first().and_then(|v| v.parse::<u32>().ok()).ok_or(PairError::Malformed)?;
        if version != PROTOCOL_VERSION {
            return Err(PairError::WrongVersion);
        }
        let [_, h, p, fp, t] = parts.as_slice() else { return Err(PairError::Malformed) };
        Ok(ScannedQr {
            host: h.parse().map_err(|_| PairError::Malformed)?,
            port: p.parse().map_err(|_| PairError::Malformed)?,
            fingerprint_prefix: unbase32(fp).and_then(|b| b.try_into().ok()).ok_or(PairError::Malformed)?,
            token: unbase32(t).and_then(|b| b.try_into().ok()).ok_or(PairError::Malformed)?,
        })
    }
}

const BASE32: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/// RFC 4648 base32 without padding: only characters of the QR alphanumeric mode.
fn base32(data: &[u8]) -> String {
    let (mut out, mut acc, mut bits) = (String::new(), 0u32, 0);
    for &b in data {
        acc = (acc << 8) | b as u32;
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            out.push(BASE32[((acc >> bits) & 31) as usize] as char);
        }
    }
    if bits > 0 {
        out.push(BASE32[((acc << (5 - bits)) & 31) as usize] as char);
    }
    out
}

#[cfg(test)]
fn unbase32(s: &str) -> Option<Vec<u8>> {
    let (mut out, mut acc, mut bits) = (Vec::new(), 0u32, 0);
    for c in s.bytes() {
        let v = BASE32.iter().position(|&x| x == c)? as u32;
        acc = (acc << 5) | v;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
        }
    }
    Some(out)
}

/// Sent by the iPhone inside the TLS tunnel (E5). The device fingerprint comes
/// from its TLS client certificate, not from the message.
#[derive(Debug, Clone)]
pub struct PairRequest {
    pub protocol_version: u32,
    pub token: Token,
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
    value: Token,
    issued: Instant,
    used: bool,
}

/// PC side of the pairing: one token at a time, then one pending device until
/// Evan says yes or no on the iPhone.
#[derive(Default)]
pub struct PairingSession {
    token: Option<ActiveToken>,
    pending: Option<PendingPair>,
}

impl PairingSession {
    /// Creates a new QR offer and cancels the previous token (E3, « Nouveau QR »).
    pub fn issue(&mut self, host: IpAddr, port: u16, pc_fingerprint: Fingerprint, now: Instant) -> PairOffer {
        let mut token = [0u8; TOKEN_LEN];
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

    /// Evan's answer, sent by the iPhone. Returns the device to keep if he said yes.
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

/// iPhone side of E4: the PC certificate is accepted only if its fingerprint
/// starts with the QR half (or equals the full one kept after pairing).
#[cfg(test)]
pub fn check_pinned(expected: &[u8], presented_cert_der: &[u8]) -> Result<(), PairError> {
    let fp = fingerprint_of(presented_cert_der);
    if expected.len() >= QR_FINGERPRINT_LEN && constant_time_eq(expected, &fp[..expected.len().min(fp.len())]) {
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

    fn request(token: Token) -> PairRequest {
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
        assert!(uri.starts_with("HYPHN:1/192.168.1.20/47800/"));
        // Small enough for a 29x29 QR (version 3, low correction, alphanumeric).
        assert!(uri.len() <= 77, "{} chars: {uri}", uri.len());
        assert!(uri.bytes().all(|c| b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:".contains(&c)));
        let q = PairOffer::parse(&uri).unwrap();
        assert_eq!((q.host, q.port, q.token), (offer.host, offer.port, offer.token));
        assert_eq!(q.fingerprint_prefix[..], offer.pc_fingerprint[..QR_FINGERPRINT_LEN]);
        assert_eq!(base32(b"foobar"), "MZXW6YTBOI");
    }

    #[test]
    fn qr_is_29_by_29_even_with_the_longest_ipv4() {
        let pc = Identity::generate("pc").unwrap();
        let mut s = PairingSession::default();
        let offer = s.issue(IpAddr::V4(Ipv4Addr::new(192, 168, 255, 255)), 65535, pc.fingerprint, Instant::now());
        let code = qrcode::QrCode::with_error_correction_level(offer.to_uri().as_bytes(), qrcode::EcLevel::L).unwrap();
        assert_eq!(code.width(), 29);
    }

    #[test]
    fn foreign_qr_is_refused() {
        assert_eq!(PairOffer::parse("https://example.com"), Err(PairError::NotHyphn));
        assert_eq!(PairOffer::parse("HYPHN:1/nope"), Err(PairError::Malformed));
    }

    #[test]
    fn wrong_version_is_refused() {
        let (mut s, offer, pc, phone, now) = setup();
        let uri = offer.to_uri().replace("HYPHN:1/", "HYPHN:2/");
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
        let half = &offer.pc_fingerprint[..QR_FINGERPRINT_LEN];
        assert!(check_pinned(half, &pc.cert_der).is_ok());
        assert!(check_pinned(&offer.pc_fingerprint, &pc.cert_der).is_ok());
        assert_eq!(check_pinned(half, &phone.cert_der), Err(PairError::WrongFingerprint));
        // A shorter prefix would be too easy to forge.
        assert_eq!(check_pinned(&half[..8], &pc.cert_der), Err(PairError::WrongFingerprint));
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
