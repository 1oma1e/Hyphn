//! Cam quality rules that do not depend on the network: the thermal adaptation
//! of RULES (Énergie 9) and the 120 fps limit.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Thermal {
    Nominal,
    Fair,
    Serious,
    Critical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Quality {
    /// Vertical lines: 2160, 1440, 1080, 720, 480.
    pub height: u32,
    pub fps: u32,
    /// 0 = automatic.
    pub bitrate_mbps: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Effective {
    pub quality: Quality,
    /// Shown on the PC only (critical).
    pub alert: bool,
    /// The quality was lowered because of the heat.
    pub lowered: bool,
}

/// Automatic bitrate used when the user picks « Auto », per resolution.
pub fn auto_bitrate(height: u32, fps: u32) -> u32 {
    let base = match height {
        h if h >= 2160 => 40,
        h if h >= 1440 => 24,
        h if h >= 1080 => 12,
        h if h >= 720 => 6,
        _ => 3,
    };
    if fps > 30 { base * 3 / 2 } else { base }
}

pub fn effective(requested: Quality, thermal: Thermal, adapt: bool) -> Effective {
    let mut q = requested;
    // 120 fps only at 1080p and below.
    if q.fps > 60 && q.height > 1080 {
        q.fps = 60;
    }
    if q.bitrate_mbps == 0 {
        q.bitrate_mbps = auto_bitrate(q.height, q.fps);
    }
    let before = q;
    let mut alert = false;
    if adapt {
        match thermal {
            Thermal::Nominal | Thermal::Fair => {}
            Thermal::Serious => {
                q.fps = q.fps.min(30);
                q.bitrate_mbps = q.bitrate_mbps * 7 / 10;
            }
            Thermal::Critical => {
                q.height = q.height.min(1080);
                q.fps = q.fps.min(30);
                q.bitrate_mbps = q.bitrate_mbps.min(auto_bitrate(1080, 30));
                alert = true;
            }
        }
    }
    Effective { quality: q, alert, lowered: q != before }
}

#[cfg(test)]
mod tests {
    use super::*;

    const UHD60: Quality = Quality { height: 2160, fps: 60, bitrate_mbps: 50 };

    #[test]
    fn nominal_and_fair_keep_the_request() {
        for t in [Thermal::Nominal, Thermal::Fair] {
            let e = effective(UHD60, t, true);
            assert_eq!(e.quality, UHD60);
            assert!(!e.lowered && !e.alert);
        }
    }

    #[test]
    fn serious_halves_fps_and_cuts_bitrate() {
        let e = effective(UHD60, Thermal::Serious, true);
        assert_eq!(e.quality, Quality { height: 2160, fps: 30, bitrate_mbps: 35 });
        assert!(e.lowered && !e.alert);
    }

    #[test]
    fn critical_goes_to_1080p30_with_alert() {
        let e = effective(UHD60, Thermal::Critical, true);
        assert_eq!((e.quality.height, e.quality.fps), (1080, 30));
        assert!(e.alert);
    }

    #[test]
    fn adaptation_can_be_switched_off() {
        assert_eq!(effective(UHD60, Thermal::Critical, false).quality, UHD60);
    }

    #[test]
    fn fps_120_only_up_to_1080p() {
        let q = Quality { height: 2160, fps: 120, bitrate_mbps: 0 };
        assert_eq!(effective(q, Thermal::Nominal, true).quality.fps, 60);
        let q = Quality { height: 1080, fps: 120, bitrate_mbps: 0 };
        assert_eq!(effective(q, Thermal::Nominal, true).quality.fps, 120);
    }
}
