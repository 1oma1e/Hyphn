//! PC identity (spec `Core - Appairage QR`, E1): a key pair and a self-signed
//! certificate created on first launch and kept forever. The fingerprint is the
//! SHA-256 of the DER certificate.

use std::fs;
use std::path::Path;

use sha2::{Digest, Sha256};

use crate::Error;

const CERT_FILE: &str = "identity.der";
const KEY_FILE: &str = "identity.key.pem";

pub type Fingerprint = [u8; 32];

pub struct Identity {
    pub cert_der: Vec<u8>,
    /// Kept for the TLS listener (E4), not used yet.
    #[allow(dead_code)]
    pub key_pem: String,
    pub fingerprint: Fingerprint,
}

impl Identity {
    /// Loads the identity from `dir`, or creates and saves a new one.
    pub fn load_or_create(dir: &Path, common_name: &str) -> Result<Self, Error> {
        let cert_path = dir.join(CERT_FILE);
        let key_path = dir.join(KEY_FILE);
        if cert_path.exists() && key_path.exists() {
            let cert_der = fs::read(&cert_path)?;
            let key_pem = fs::read_to_string(&key_path)?;
            // Fails loudly on a broken key instead of silently making a new identity,
            // which would break every pinned device.
            rcgen::KeyPair::from_pem(&key_pem).map_err(|e| Error::Identity(e.to_string()))?;
            return Ok(Self::from_parts(cert_der, key_pem));
        }
        let identity = Self::generate(common_name)?;
        fs::create_dir_all(dir)?;
        // %APPDATA% is readable only by the current user by default on Windows.
        fs::write(&key_path, &identity.key_pem)?;
        fs::write(&cert_path, &identity.cert_der)?;
        Ok(identity)
    }

    /// Creates a new identity in memory (also used by the simulated iPhone).
    pub fn generate(common_name: &str) -> Result<Self, Error> {
        let key = rcgen::KeyPair::generate().map_err(|e| Error::Identity(e.to_string()))?;
        let mut params = rcgen::CertificateParams::new(vec!["hyphn.local".to_string()])
            .map_err(|e| Error::Identity(e.to_string()))?;
        params
            .distinguished_name
            .push(rcgen::DnType::CommonName, common_name);
        params.not_before = rcgen::date_time_ymd(2026, 1, 1);
        params.not_after = rcgen::date_time_ymd(2126, 1, 1);
        let cert = params
            .self_signed(&key)
            .map_err(|e| Error::Identity(e.to_string()))?;
        Ok(Self::from_parts(cert.der().to_vec(), key.serialize_pem()))
    }

    fn from_parts(cert_der: Vec<u8>, key_pem: String) -> Self {
        let fingerprint = fingerprint_of(&cert_der);
        Self { cert_der, key_pem, fingerprint }
    }
}

pub fn fingerprint_of(cert_der: &[u8]) -> Fingerprint {
    Sha256::digest(cert_der).into()
}

/// Short form shown to people: first 8 bytes in hex, grouped by 4 characters.
pub fn short_hex(fp: &Fingerprint) -> String {
    let hex: String = fp[..8].iter().map(|b| format!("{b:02X}")).collect();
    hex.as_bytes()
        .chunks(4)
        .map(|c| std::str::from_utf8(c).unwrap_or_default())
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn to_hex(fp: &Fingerprint) -> String {
    fp.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn from_hex(s: &str) -> Option<Fingerprint> {
    if s.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(s.get(i * 2..i * 2 + 2)?, 16).ok()?;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_is_created_once_then_reloaded() {
        let dir = tempfile::tempdir().unwrap();
        let first = Identity::load_or_create(dir.path(), "Hyphn PC").unwrap();
        let again = Identity::load_or_create(dir.path(), "Hyphn PC").unwrap();
        assert_eq!(first.fingerprint, again.fingerprint);
        assert_eq!(first.fingerprint, fingerprint_of(&again.cert_der));
    }

    #[test]
    fn two_identities_differ() {
        let a = Identity::generate("a").unwrap();
        let b = Identity::generate("b").unwrap();
        assert_ne!(a.fingerprint, b.fingerprint);
    }

    #[test]
    fn hex_round_trip() {
        let id = Identity::generate("x").unwrap();
        assert_eq!(from_hex(&to_hex(&id.fingerprint)), Some(id.fingerprint));
        assert_eq!(from_hex("zz"), None);
        assert_eq!(short_hex(&id.fingerprint).len(), 19);
    }
}
