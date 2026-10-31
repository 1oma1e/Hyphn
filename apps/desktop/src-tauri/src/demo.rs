//! Simulated iPhone (ADR-0019). Everything here stands in for the real app on
//! the phone and the network between them; it is the only module to replace
//! when the iPhone app exists. The PC side it talks to (pairing, store, cam
//! and drop rules) is the real one.

use serde::Serialize;

use crate::cam::{Effective, Thermal};
use crate::identity::{Fingerprint, Identity};
use crate::pairing::{check_pinned, PairError, PairOffer, PairRequest, PROTOCOL_VERSION};

pub const NAME: &str = "iPhone d’Evan";
pub const MODEL: &str = "iPhone 16 Pro Max";

/// What the iPhone reports (spec `Pulse - Batterie et thermique`, E1).
/// `None` means never received, shown as « inconnu ».
#[derive(Debug, Clone, Serialize)]
pub struct Pulse {
    pub battery: Option<u8>,
    /// "charging", "full" or "unplugged".
    pub charge: Option<String>,
    pub low_power: Option<bool>,
    pub thermal: Option<Thermal>,
    pub storage_free_gb: Option<f32>,
    pub storage_total_gb: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Transfer {
    /// "in" (iPhone → PC) or "out" (PC → iPhone).
    pub direction: &'static str,
    pub items_total: u32,
    pub items_done: u32,
    pub bytes_total: u64,
    pub bytes_done: u64,
    pub speed_bps: u64,
    /// "running", "paused", "waiting" (iPhone gone) or "done".
    pub state: &'static str,
    pub duplicates: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct HistoryEntry {
    pub at: u64,
    pub direction: &'static str,
    pub items: u32,
    pub bytes: u64,
    pub verified: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct CamStats {
    pub fps: f32,
    pub bitrate_mbps: f32,
    pub latency_ms: u32,
    pub dropped: u32,
}

pub struct DemoPhone {
    pub identity: Identity,
    /// The Hyphn app is open on the iPhone, so it is connected.
    pub open: bool,
    pub thermal: Thermal,
    battery: f32,
    charging: bool,
    pub transfer: Option<Transfer>,
    pub history: Vec<HistoryEntry>,
    pub new_photos: u32,
    new_photos_bytes: u64,
    tick: u64,
}

impl DemoPhone {
    pub fn new() -> Result<Self, crate::Error> {
        Ok(Self {
            identity: Identity::generate(NAME)?,
            open: true,
            thermal: Thermal::Nominal,
            battery: 82.0,
            charging: true,
            transfer: None,
            history: Vec::new(),
            new_photos: 240,
            new_photos_bytes: 1_900_000_000,
            tick: 0,
        })
    }

    pub fn fingerprint(&self) -> Fingerprint {
        self.identity.fingerprint
    }

    /// What the iPhone does after reading the QR: parse it, check the PC
    /// certificate against the QR fingerprint (E4), then build `PairRequest` (E5).
    pub fn scan(&self, uri: &str, pc_cert_der: &[u8]) -> Result<PairRequest, PairError> {
        let offer = PairOffer::parse(uri)?;
        check_pinned(&offer.pc_fingerprint, pc_cert_der)?;
        Ok(PairRequest {
            protocol_version: PROTOCOL_VERSION,
            token: offer.token,
            device_name: NAME.into(),
            model: MODEL.into(),
            app_version: env!("CARGO_PKG_VERSION").into(),
        })
    }

    pub fn pulse(&self) -> Pulse {
        let level = self.battery.round().clamp(0.0, 100.0) as u8;
        let charge = match (self.charging, level) {
            (true, 100) => "full",
            (true, _) => "charging",
            _ => "unplugged",
        };
        Pulse {
            battery: Some(level),
            charge: Some(charge.into()),
            low_power: Some(false),
            thermal: Some(self.thermal),
            storage_free_gb: Some(41.0),
            storage_total_gb: Some(256.0),
        }
    }

    pub fn latency_ms(&self) -> u32 {
        3 + (self.tick * 7 % 4) as u32
    }

    pub fn set_battery(&mut self, level: u8, charging: bool) {
        self.battery = level.min(100) as f32;
        self.charging = charging;
    }

    pub fn set_open(&mut self, open: bool) {
        self.open = open;
        if let Some(t) = self.transfer.as_mut() {
            if t.state == "running" && !open {
                t.state = "waiting";
            } else if t.state == "waiting" && open {
                t.state = "running";
            }
        }
    }

    pub fn start_receive(&mut self) {
        if self.new_photos == 0 || self.busy() {
            return;
        }
        self.transfer = Some(Transfer {
            direction: "in",
            items_total: self.new_photos,
            items_done: 0,
            bytes_total: self.new_photos_bytes,
            bytes_done: 0,
            speed_bps: 38_000_000,
            state: if self.open { "running" } else { "waiting" },
            duplicates: 7,
        });
    }

    pub fn send_files(&mut self, sizes: &[u64]) {
        if sizes.is_empty() || self.busy() {
            return;
        }
        self.transfer = Some(Transfer {
            direction: "out",
            items_total: sizes.len() as u32,
            items_done: 0,
            bytes_total: sizes.iter().sum::<u64>().max(1),
            bytes_done: 0,
            speed_bps: 30_000_000,
            state: if self.open { "running" } else { "waiting" },
            duplicates: 0,
        });
    }

    pub fn toggle_pause(&mut self) {
        if let Some(t) = self.transfer.as_mut() {
            t.state = match t.state {
                "running" | "waiting" => "paused",
                "paused" if self.open => "running",
                "paused" => "waiting",
                other => other,
            };
        }
    }

    pub fn cancel(&mut self) {
        if self.transfer.as_ref().is_some_and(|t| t.state != "done") {
            self.transfer = None;
        }
    }

    pub fn dismiss(&mut self) {
        if self.transfer.as_ref().is_some_and(|t| t.state == "done") {
            self.transfer = None;
        }
    }

    fn busy(&self) -> bool {
        self.transfer.as_ref().is_some_and(|t| t.state != "done")
    }

    /// Advances the simulation by one second.
    pub fn tick(&mut self, now_unix: u64) {
        self.tick += 1;
        if self.charging {
            self.battery = (self.battery + 1.0 / 60.0).min(100.0);
        } else {
            self.battery = (self.battery - 1.0 / 120.0).max(1.0);
        }
        let Some(t) = self.transfer.as_mut() else { return };
        if t.state != "running" {
            return;
        }
        let jitter = 0.9 + (self.tick * 13 % 20) as f64 / 100.0;
        t.bytes_done = (t.bytes_done + (t.speed_bps as f64 * jitter) as u64).min(t.bytes_total);
        t.items_done = ((t.bytes_done as f64 / t.bytes_total as f64) * t.items_total as f64) as u32;
        if t.bytes_done >= t.bytes_total {
            t.items_done = t.items_total;
            t.state = "done";
            self.history.insert(0, HistoryEntry {
                at: now_unix,
                direction: t.direction,
                items: t.items_total,
                bytes: t.bytes_total,
                verified: true,
            });
            if t.direction == "in" {
                self.new_photos = 0;
                self.new_photos_bytes = 0;
            }
        }
    }

    pub fn cam_stats(&self, eff: &Effective, live: bool) -> CamStats {
        let wobble = (self.tick * 3 % 4) as f32 / 10.0;
        CamStats {
            fps: if live { eff.quality.fps as f32 - 0.2 - wobble } else { 30.0 },
            bitrate_mbps: if live { eff.quality.bitrate_mbps as f32 * (0.94 + wobble / 10.0) } else { 0.4 },
            latency_ms: 74 + (self.tick * 3 % 9) as u32,
            dropped: 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pairing::PairingSession;
    use std::net::{IpAddr, Ipv4Addr};
    use std::time::Instant;

    #[test]
    fn simulated_scan_pairs_with_the_real_pc_side() {
        let pc = Identity::generate("pc").unwrap();
        let phone = DemoPhone::new().unwrap();
        let mut s = PairingSession::default();
        let now = Instant::now();
        let offer = s.issue(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 20)), 47800, pc.fingerprint, now);
        let req = phone.scan(&offer.to_uri(), &pc.cert_der).unwrap();
        let p = s.handle_request(&req, phone.fingerprint(), &pc.fingerprint, now).unwrap();
        assert_eq!(p.device_name, NAME);
    }

    #[test]
    fn simulated_scan_refuses_a_fake_pc() {
        let pc = Identity::generate("pc").unwrap();
        let fake = Identity::generate("fake").unwrap();
        let phone = DemoPhone::new().unwrap();
        let mut s = PairingSession::default();
        let offer = s.issue(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 20)), 47800, pc.fingerprint, Instant::now());
        assert_eq!(phone.scan(&offer.to_uri(), &fake.cert_der).unwrap_err(), PairError::WrongFingerprint);
    }

    #[test]
    fn transfer_pauses_when_iphone_closes_and_finishes() {
        let mut phone = DemoPhone::new().unwrap();
        phone.start_receive();
        phone.set_open(false);
        phone.tick(1);
        assert_eq!(phone.transfer.as_ref().unwrap().bytes_done, 0);
        phone.set_open(true);
        for i in 0..200 {
            phone.tick(i);
        }
        assert_eq!(phone.transfer.as_ref().unwrap().state, "done");
        assert_eq!(phone.history.len(), 1);
        assert_eq!(phone.new_photos, 0);
    }
}
