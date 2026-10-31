//! The iPhone infos shown on the PC (spec `Infos iPhone - Batterie et chaleur`):
//! what a `DeviceStatus` becomes for the window. `None` means never received,
//! shown as « inconnu ».

use serde::Serialize;

use crate::cam::Thermal;
use crate::proto::{self, Charge};

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StatusView {
    pub battery: Option<u8>,
    /// "charging", "full" or "unplugged".
    pub charge: Option<&'static str>,
    pub low_power: Option<bool>,
    pub thermal: Option<Thermal>,
    pub storage_free_gb: Option<f32>,
    pub storage_total_gb: Option<f32>,
}

impl From<&proto::DeviceStatus> for StatusView {
    fn from(s: &proto::DeviceStatus) -> Self {
        let gb = |b: u64| (b > 0).then(|| (b as f64 / 1e9) as f32);
        Self {
            battery: (0..=100).contains(&s.battery_percent).then_some(s.battery_percent as u8),
            charge: match Charge::try_from(s.charge) {
                Ok(Charge::Charging) => Some("charging"),
                Ok(Charge::Full) => Some("full"),
                Ok(Charge::Unplugged) => Some("unplugged"),
                _ => None,
            },
            low_power: Some(s.low_power),
            thermal: thermal_of(s.thermal),
            storage_free_gb: gb(s.storage_free_bytes),
            storage_total_gb: gb(s.storage_total_bytes),
        }
    }
}

pub fn thermal_of(v: i32) -> Option<Thermal> {
    match proto::Thermal::try_from(v) {
        Ok(proto::Thermal::Nominal) => Some(Thermal::Nominal),
        Ok(proto::Thermal::Fair) => Some(Thermal::Fair),
        Ok(proto::Thermal::Serious) => Some(Thermal::Serious),
        Ok(proto::Thermal::Critical) => Some(Thermal::Critical),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_values_stay_unknown() {
        let v = StatusView::from(&proto::DeviceStatus { battery_percent: -1, ..Default::default() });
        assert_eq!(v.battery, None);
        assert_eq!(v.charge, None);
        assert_eq!(v.thermal, None);
        assert_eq!(v.storage_free_gb, None);
    }

    #[test]
    fn every_thermal_state_maps() {
        assert_eq!(thermal_of(proto::Thermal::Nominal as i32), Some(Thermal::Nominal));
        assert_eq!(thermal_of(proto::Thermal::Fair as i32), Some(Thermal::Fair));
        assert_eq!(thermal_of(proto::Thermal::Serious as i32), Some(Thermal::Serious));
        assert_eq!(thermal_of(proto::Thermal::Critical as i32), Some(Thermal::Critical));
        assert_eq!(thermal_of(42), None);
    }

    #[test]
    fn real_values_pass() {
        let v = StatusView::from(&proto::DeviceStatus {
            battery_percent: 14,
            charge: Charge::Unplugged as i32,
            storage_free_bytes: 41_000_000_000,
            storage_total_bytes: 256_000_000_000,
            ..Default::default()
        });
        assert_eq!(v.battery, Some(14));
        assert_eq!(v.charge, Some("unplugged"));
        assert_eq!(v.storage_free_gb, Some(41.0));
    }
}
