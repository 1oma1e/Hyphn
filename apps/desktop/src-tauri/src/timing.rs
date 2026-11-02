//! Time per step of a Cam frame (spec `Cam - Latence et fluidite`, E2): on
//! the iPhone (capture → out of the encoder), then iPhone queue and link (out
//! of the encoder → arrival on the PC). The window measures decoding and
//! drawing itself (`ui/app.js`).

use std::collections::VecDeque;

use serde::Serialize;

use crate::proto;

/// One ping every 5 s: the last minute.
const CLOCK_SAMPLES: usize = 12;
/// Keyframes counted over the last minute, one slot per second.
const KEY_SECONDS: usize = 60;

/// iPhone clock minus PC clock, from the ping answers. The answer with the
/// shortest round trip of the last minute is the best guess (error under
/// half of that round trip).
#[derive(Debug, Clone, Default)]
pub struct ClockSync {
    samples: VecDeque<(i64, i64)>,
}

impl ClockSync {
    /// `sent_pc_us` and `back_pc_us`: PC clock when the Ping left and when
    /// the Pong arrived; `phone_us`: iPhone clock in the Pong (0 = older app).
    pub fn add(&mut self, sent_pc_us: i64, back_pc_us: i64, phone_us: i64) {
        if phone_us == 0 || back_pc_us < sent_pc_us {
            return;
        }
        let rtt = back_pc_us - sent_pc_us;
        self.samples.push_back((rtt, phone_us - (sent_pc_us + rtt / 2)));
        if self.samples.len() > CLOCK_SAMPLES {
            self.samples.pop_front();
        }
    }

    pub fn offset_us(&self) -> Option<i64> {
        self.samples.iter().min_by_key(|s| s.0).map(|s| s.1)
    }
}

#[derive(Debug, Clone, Copy, Default)]
struct Avg {
    sum: f64,
    n: u32,
}

impl Avg {
    fn add(&mut self, v: f64) {
        self.sum += v;
        self.n += 1;
    }

    fn take(&mut self) -> Option<f64> {
        let v = (self.n > 0).then(|| self.sum / self.n as f64);
        *self = Avg::default();
        v
    }
}

/// Shown in « Infos du flux »; None = « inconnu » (older iPhone app, clocks
/// not lined up yet, or a value that makes no sense).
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct StepView {
    pub encode_ms: Option<f32>,
    pub link_ms: Option<f32>,
    pub queue_ms: Option<f32>,
    pub keys_per_min: u32,
}

#[derive(Debug, Clone, Default)]
pub struct Steps {
    encode: Avg,
    link: Avg,
    queued: Avg,
    keys_now: u32,
    keys: VecDeque<u32>,
}

impl Steps {
    /// One frame arrived on the PC at `arrival_pc_us`; `offset` from `ClockSync`.
    pub fn frame(&mut self, f: &proto::VideoFrame, arrival_pc_us: i64, offset: Option<i64>) {
        if f.keyframe {
            self.keys_now += 1;
        }
        if f.encoded_us == 0 {
            return;
        }
        // Out of range = the capture time is not on the same clock: unknown.
        let encode = f.encoded_us - f.pts_us;
        if (0..2_000_000).contains(&encode) {
            self.encode.add(encode as f64 / 1000.0);
        }
        if let Some(o) = offset {
            // A few ms below zero is the clock guess, not time travel.
            let link = arrival_pc_us + o - f.encoded_us;
            if (-20_000..10_000_000).contains(&link) {
                self.link.add(link.max(0) as f64 / 1000.0);
            }
        }
        self.queued.add(f.queued_bytes as f64);
    }

    /// Once a second, with the bitrate of that second.
    pub fn tick(&mut self, bitrate_mbps: f32) -> StepView {
        self.keys.push_back(std::mem::take(&mut self.keys_now));
        if self.keys.len() > KEY_SECONDS {
            self.keys.pop_front();
        }
        let queued = self.queued.take();
        StepView {
            encode_ms: self.encode.take().map(|v| v as f32),
            link_ms: self.link.take().map(|v| v as f32),
            // Bytes waiting, at the current rate: how long they take to leave.
            queue_ms: queued.filter(|_| bitrate_mbps > 0.0).map(|b| (b * 8.0 / (bitrate_mbps as f64 * 1000.0)) as f32),
            keys_per_min: self.keys.iter().sum(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(pts: i64, encoded: i64, queued: u32, keyframe: bool) -> proto::VideoFrame {
        proto::VideoFrame { pts_us: pts, encoded_us: encoded, queued_bytes: queued, keyframe, ..Default::default() }
    }

    #[test]
    fn clock_keeps_the_shortest_round_trip() {
        let mut c = ClockSync::default();
        assert_eq!(c.offset_us(), None);
        // iPhone clock = PC clock + 5 s. Slow answer: guess off by 40 ms.
        c.add(1_000_000, 1_100_000, 6_090_000);
        // Fast answer (2 ms): close to the truth.
        c.add(2_000_000, 2_002_000, 7_001_000);
        assert_eq!(c.offset_us(), Some(5_000_000));
        // An older app sends no clock: ignored.
        c.add(3_000_000, 3_000_500, 0);
        assert_eq!(c.offset_us(), Some(5_000_000));
    }

    #[test]
    fn clock_forgets_old_answers() {
        let mut c = ClockSync::default();
        c.add(0, 1_000, 10_500);
        for i in 1..=CLOCK_SAMPLES as i64 {
            c.add(i * 1_000_000, i * 1_000_000 + 4_000, i * 1_000_000 + 2_000 + 7);
        }
        assert_eq!(c.offset_us(), Some(7));
    }

    #[test]
    fn steps_per_second() {
        let mut s = Steps::default();
        // iPhone clock = PC + 1 s. Encoded 10 ms after capture, on the PC 30 ms later.
        s.frame(&frame(1_000_000, 1_010_000, 100_000, true), 40_000, Some(1_000_000));
        s.frame(&frame(1_016_000, 1_036_000, 300_000, false), 66_000 + 10_000, Some(1_000_000));
        let v = s.tick(80.0);
        assert_eq!(v.encode_ms, Some(15.0));
        assert_eq!(v.link_ms, Some(35.0));
        // 200 kB waiting at 80 Mb/s = 20 ms.
        assert_eq!(v.queue_ms, Some(20.0));
        assert_eq!(v.keys_per_min, 1);
        // Nothing this second: unknown, the keyframe still counts for the minute.
        let v = s.tick(80.0);
        assert_eq!((v.encode_ms, v.link_ms, v.queue_ms, v.keys_per_min), (None, None, None, 1));
    }

    #[test]
    fn older_app_or_other_clock_is_unknown() {
        let mut s = Steps::default();
        s.frame(&frame(5_000, 0, 0, false), 0, Some(0));
        // Capture time on another clock: encode « took » hours.
        s.frame(&frame(5_000, 9_000_000_000, 0, false), 0, None);
        let v = s.tick(0.0);
        assert_eq!((v.encode_ms, v.link_ms, v.queue_ms), (None, None, None));
    }
}
