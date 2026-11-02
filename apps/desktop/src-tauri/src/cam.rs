//! Cam quality rules that do not depend on the network: the power profiles of
//! ADR-0032 (RULES Énergie 5, 7, 9) and the 120 fps limit.

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

/// How much the quality gives way to the iPhone's battery and heat (ADR-0032).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Power {
    /// Default: only « critical » lowers anything.
    #[default]
    Max,
    /// Also « serious »: 30 fps and −30 % bitrate.
    Balanced,
    /// Also iOS low power mode and under 15 % unplugged: 1080p30.
    Eco,
}

/// What the iPhone says about itself, for the power rules.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Load {
    pub thermal: Thermal,
    pub low_power: bool,
    /// Under 15 % and not charging (RULES Énergie 7).
    pub low_battery: bool,
}

impl Default for Load {
    fn default() -> Self {
        Self { thermal: Thermal::Nominal, low_power: false, low_battery: false }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Effective {
    pub quality: Quality,
    /// Shown on the PC only (critical).
    pub alert: bool,
    /// The quality was lowered (heat, battery or low power mode).
    pub lowered: bool,
    /// Why, or what would have been lowered in a stronger profile:
    /// "hot", "low_power", "battery". None = nothing to say.
    pub reason: Option<&'static str>,
}

/// Automatic bitrate (Mb/s) used when the user picks « Auto ». Raised on
/// 2026-11-02 (Evan wanted a sharper picture): still well under what a 5 GHz
/// Wi-Fi carries, and the iPhone lowers it at once if the network falls
/// behind. 60 images/s costs 40 % more, not twice: half the frames are almost
/// identical.
pub fn auto_bitrate(height: u32, fps: u32) -> u32 {
    let base = match height {
        h if h >= 2160 => 40,
        h if h >= 1440 => 24,
        h if h >= 1080 => 16,
        h if h >= 720 => 8,
        _ => 4,
    };
    if fps > 30 { base * 7 / 5 } else { base }
}

/// `cable`: the session runs through the USB cable (ADR-0031), which carries
/// more than the Wi-Fi and never shares it: « Auto » gives 1.5× more there.
pub fn effective(requested: Quality, load: Load, power: Power, cable: bool) -> Effective {
    let mut q = requested;
    // 120 fps only at 1080p and below.
    if q.fps > 60 && q.height > 1080 {
        q.fps = 60;
    }
    if q.bitrate_mbps == 0 {
        q.bitrate_mbps = auto_bitrate(q.height, q.fps);
        if cable {
            q.bitrate_mbps = q.bitrate_mbps * 3 / 2;
        }
    }
    let before = q;
    let to_1080p30 = |q: &mut Quality| {
        q.height = q.height.min(1080);
        q.fps = q.fps.min(30);
        q.bitrate_mbps = q.bitrate_mbps.min(auto_bitrate(1080, 30));
    };
    let mut alert = false;
    let mut reason = None;
    match load.thermal {
        Thermal::Nominal | Thermal::Fair => {}
        // In every profile: iOS would stop the camera otherwise.
        Thermal::Critical => {
            to_1080p30(&mut q);
            alert = true;
            reason = Some("hot");
        }
        Thermal::Serious => {
            reason = Some("hot");
            if power != Power::Max {
                q.fps = q.fps.min(30);
                q.bitrate_mbps = q.bitrate_mbps * 7 / 10;
            }
        }
    }
    if reason.is_none() && (load.low_battery || load.low_power) {
        reason = Some(if load.low_battery { "battery" } else { "low_power" });
        if power == Power::Eco {
            to_1080p30(&mut q);
        }
    }
    Effective { quality: q, alert, lowered: q != before, reason }
}

#[cfg(test)]
mod tests {
    use super::*;

    const UHD60: Quality = Quality { height: 2160, fps: 60, bitrate_mbps: 50 };

    #[test]
    fn nominal_and_fair_keep_the_request() {
        for t in [Thermal::Nominal, Thermal::Fair] {
            let e = effective(UHD60, hot(t), Power::Balanced, false);
            assert_eq!(e.quality, UHD60);
            assert!(!e.lowered && !e.alert);
        }
    }

    fn hot(thermal: Thermal) -> Load {
        Load { thermal, ..Load::default() }
    }

    #[test]
    fn serious_halves_fps_and_cuts_bitrate() {
        let e = effective(UHD60, hot(Thermal::Serious), Power::Balanced, false);
        assert_eq!(e.quality, Quality { height: 2160, fps: 30, bitrate_mbps: 35 });
        assert!(e.lowered && !e.alert);
    }

    #[test]
    fn critical_goes_to_1080p30_with_alert() {
        for p in [Power::Max, Power::Balanced, Power::Eco] {
            let e = effective(UHD60, hot(Thermal::Critical), p, false);
            assert_eq!((e.quality.height, e.quality.fps), (1080, 30));
            assert!(e.alert);
        }
    }

    #[test]
    fn max_only_signals_serious() {
        let e = effective(UHD60, hot(Thermal::Serious), Power::Max, false);
        assert_eq!(e.quality, UHD60);
        assert!(!e.lowered && e.reason == Some("hot"));
    }

    #[test]
    fn battery_and_low_power_lower_only_in_eco() {
        for load in [Load { low_battery: true, ..Load::default() }, Load { low_power: true, ..Load::default() }] {
            for p in [Power::Max, Power::Balanced] {
                let e = effective(UHD60, load, p, false);
                assert_eq!(e.quality, UHD60);
                assert!(e.reason.is_some());
            }
            let e = effective(UHD60, load, Power::Eco, false);
            assert_eq!((e.quality.height, e.quality.fps), (1080, 30));
            assert!(e.lowered && !e.alert);
        }
    }

    #[test]
    fn auto_gives_more_by_cable() {
        let q = Quality { height: 1080, fps: 30, bitrate_mbps: 0 };
        assert_eq!(effective(q, Load::default(), Power::Max, false).quality.bitrate_mbps, 16);
        assert_eq!(effective(q, Load::default(), Power::Max, true).quality.bitrate_mbps, 24);
        // A rate chosen by hand stays as chosen.
        let q = Quality { height: 1080, fps: 30, bitrate_mbps: 8 };
        assert_eq!(effective(q, Load::default(), Power::Max, true).quality.bitrate_mbps, 8);
    }

    #[test]
    fn fps_120_only_up_to_1080p() {
        let q = Quality { height: 2160, fps: 120, bitrate_mbps: 0 };
        assert_eq!(effective(q, Load::default(), Power::Max, false).quality.fps, 60);
        let q = Quality { height: 1080, fps: 120, bitrate_mbps: 0 };
        assert_eq!(effective(q, Load::default(), Power::Max, false).quality.fps, 120);
    }
}
