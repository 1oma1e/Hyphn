//! What the PC keeps on disk: settings and paired devices (E7, E10), as JSON in
//! the app data folder. Writes go through a temp file so a crash never leaves
//! a half-written file.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{de::DeserializeOwned, Deserialize, Serialize};

use crate::Error;

const SETTINGS_FILE: &str = "settings.json";
const DEVICES_FILE: &str = "devices.json";
/// What Drop already received (spec `Drop - Photos vers le PC`, E6).
const DROP_INDEX_FILE: &str = "drop_index.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct Settings {
    pub launch_at_startup: bool,
    pub close_to_tray: bool,
    /// "system", "dark" or "light".
    pub theme: String,
    pub photos_dir: String,
    /// "year_month", "year" or "flat".
    pub sort: String,
    pub low_battery_alert: bool,
    /// Port kept once chosen (spec `Core - Reconnexion`, E8).
    pub port: Option<u16>,
    /// Cam settings, owned by the Cam page.
    pub cam: serde_json::Value,
    /// « Non » to the admin prompt of the automatic webcam install: not asked
    /// again at start, the Réglages button stays.
    pub vcam_declined: bool,
    /// Drop: folder and sorting chosen once in the guided start (ADR-0029);
    /// changed later in Réglages.
    pub drop_setup_done: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            launch_at_startup: false,
            close_to_tray: true,
            theme: "system".into(),
            photos_dir: String::new(),
            sort: "year_month".into(),
            low_battery_alert: true,
            port: None,
            cam: serde_json::Value::Object(Default::default()),
            vcam_declined: false,
            drop_setup_done: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PairedDevice {
    pub name: String,
    pub model: String,
    /// SHA-256 of its certificate, hex.
    pub fingerprint: String,
    /// Unix seconds.
    pub paired_at: u64,
    pub last_seen: Option<u64>,
}

pub struct Store {
    dir: PathBuf,
}

impl Store {
    pub fn new(dir: &Path) -> Result<Self, Error> {
        fs::create_dir_all(dir)?;
        Ok(Self { dir: dir.to_path_buf() })
    }

    pub fn settings(&self) -> Settings {
        self.read(SETTINGS_FILE).unwrap_or_default()
    }

    pub fn save_settings(&self, s: &Settings) -> Result<(), Error> {
        self.write(SETTINGS_FILE, s)
    }

    pub fn drop_index(&self) -> crate::drop::DropIndex {
        self.read(DROP_INDEX_FILE).unwrap_or_default()
    }

    pub fn save_drop_index(&self, ix: &crate::drop::DropIndex) -> Result<(), Error> {
        self.write(DROP_INDEX_FILE, ix)
    }

    pub fn devices(&self) -> Vec<PairedDevice> {
        self.read(DEVICES_FILE).unwrap_or_default()
    }

    /// Phase 1 keeps one iPhone: a new one replaces the old one.
    pub fn set_device(&self, d: PairedDevice) -> Result<(), Error> {
        self.write(DEVICES_FILE, &vec![d])
    }

    pub fn forget(&self, fingerprint: &str) -> Result<(), Error> {
        let left: Vec<_> = self.devices().into_iter().filter(|d| d.fingerprint != fingerprint).collect();
        self.write(DEVICES_FILE, &left)
    }

    pub fn touch(&self, fingerprint: &str, now: u64) -> Result<(), Error> {
        let mut all = self.devices();
        for d in all.iter_mut().filter(|d| d.fingerprint == fingerprint) {
            d.last_seen = Some(now);
        }
        self.write(DEVICES_FILE, &all)
    }

    fn read<T: DeserializeOwned>(&self, name: &str) -> Option<T> {
        let text = fs::read_to_string(self.dir.join(name)).ok()?;
        serde_json::from_str(&text).ok()
    }

    fn write<T: Serialize>(&self, name: &str, value: &T) -> Result<(), Error> {
        let tmp = self.dir.join(format!("{name}.tmp"));
        fs::write(&tmp, serde_json::to_vec_pretty(value)?)?;
        fs::rename(&tmp, self.dir.join(name))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn device(fp: &str) -> PairedDevice {
        PairedDevice { name: "iPhone".into(), model: "iPhone17,2".into(), fingerprint: fp.into(), paired_at: 1, last_seen: None }
    }

    #[test]
    fn settings_round_trip_and_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path()).unwrap();
        assert_eq!(store.settings(), Settings::default());
        let s = Settings { theme: "light".into(), ..Default::default() };
        store.save_settings(&s).unwrap();
        assert_eq!(store.settings().theme, "light");
    }

    #[test]
    fn missing_fields_take_defaults() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(SETTINGS_FILE), r#"{"theme":"dark"}"#).unwrap();
        let s = Store::new(dir.path()).unwrap().settings();
        assert_eq!(s.theme, "dark");
        assert!(s.close_to_tray);
    }

    #[test]
    fn device_is_kept_until_forgotten() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path()).unwrap();
        store.set_device(device("aa")).unwrap();
        store.touch("aa", 42).unwrap();
        assert_eq!(store.devices()[0].last_seen, Some(42));
        store.forget("aa").unwrap();
        assert!(store.devices().is_empty());
    }
}
