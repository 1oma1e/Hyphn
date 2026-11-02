//! H.264 from the iPhone (spec `Cam - Latence et fluidite`): VideoToolbox
//! never reorders frames but does not say so in the SPS, so a decoder fills
//! its whole picture buffer before showing a frame (up to 16 frames: 110 to
//! 420 ms measured in the window). The PC adds that promise to each SPS
//! (VUI `bitstream_restriction`, `max_num_reorder_frames = 0`), as Moonlight
//! and Sunshine do. Everything before it is copied bit for bit.

/// NAL type of a sequence parameter set.
const SPS: u8 = 7;

/// The keyframe with its SPS rewritten, or None when there is nothing to
/// change (no SPS, or one this code cannot read: then it is left as it is).
pub fn low_delay(annex_b: &[u8]) -> Option<Vec<u8>> {
    let nals = split(annex_b);
    let mut changed = false;
    let mut out = Vec::with_capacity(annex_b.len() + 16);
    for nal in nals {
        out.extend_from_slice(&[0, 0, 0, 1]);
        match nal.first().filter(|h| *h & 0x1F == SPS).and_then(|_| low_delay_sps(nal)) {
            Some(sps) => {
                changed |= sps != nal;
                out.extend_from_slice(&sps);
            }
            None => out.extend_from_slice(nal),
        }
    }
    changed.then_some(out)
}

/// The NAL units of an Annex-B buffer, without start codes.
fn split(d: &[u8]) -> Vec<&[u8]> {
    let mut starts = Vec::new();
    let mut i = 0;
    while i + 3 <= d.len() {
        if d[i] == 0 && d[i + 1] == 0 && d[i + 2] == 1 {
            starts.push(i + 3);
            i += 3;
        } else {
            i += 1;
        }
    }
    let mut nals = Vec::with_capacity(starts.len());
    for (k, &s) in starts.iter().enumerate() {
        let mut end = starts.get(k + 1).map_or(d.len(), |&n| n - 3);
        // The zero of a 4-byte start code (and any padding) is not the NAL's.
        while end > s && d[end - 1] == 0 {
            end -= 1;
        }
        if end > s {
            nals.push(&d[s..end]);
        }
    }
    nals
}

/// One SPS NAL (header byte included) with `bitstream_restriction` set.
pub fn low_delay_sps(nal: &[u8]) -> Option<Vec<u8>> {
    let rbsp = unescape(nal.get(1..)?);
    let mut c = Copier { r: Reader { d: &rbsp, pos: 0 }, w: Writer::default() };
    let profile = c.u(8)?;
    c.u(16)?; // constraint flags, level
    c.ue()?; // seq_parameter_set_id
    if matches!(profile, 100 | 110 | 122 | 244 | 44 | 83 | 86 | 118 | 128 | 138 | 139 | 134 | 135) {
        let chroma = c.ue()?;
        if chroma == 3 {
            c.u(1)?;
        }
        c.ue()?; // bit_depth_luma_minus8
        c.ue()?; // bit_depth_chroma_minus8
        c.u(1)?; // qpprime_y_zero_transform_bypass_flag
        if c.u(1)? == 1 {
            for i in 0..if chroma == 3 { 12 } else { 8 } {
                if c.u(1)? == 1 {
                    c.scaling_list(if i < 6 { 16 } else { 64 })?;
                }
            }
        }
    }
    c.ue()?; // log2_max_frame_num_minus4
    match c.ue()? {
        0 => {
            c.ue()?;
        }
        1 => {
            c.u(1)?;
            c.se()?;
            c.se()?;
            let n = c.ue()?;
            if n > 255 {
                return None;
            }
            for _ in 0..n {
                c.se()?;
            }
        }
        _ => {}
    }
    let refs = c.ue()?; // max_num_ref_frames
    c.u(1)?; // gaps_in_frame_num_value_allowed_flag
    c.ue()?; // pic_width_in_mbs_minus1
    c.ue()?; // pic_height_in_map_units_minus1
    if c.u(1)? == 0 {
        c.u(1)?; // mb_adaptive_frame_field_flag
    }
    c.u(1)?; // direct_8x8_inference_flag
    if c.u(1)? == 1 {
        for _ in 0..4 {
            c.ue()?; // frame_crop offsets
        }
    }
    // vui_parameters_present_flag: always 1 in the output.
    let vui = c.r.bit()?;
    c.w.put(1, 1);
    if vui == 1 {
        if c.u(1)? == 1 && c.u(8)? == 255 {
            c.u(32)?; // sar_width, sar_height
        }
        if c.u(1)? == 1 {
            c.u(1)?; // overscan_appropriate_flag
        }
        if c.u(1)? == 1 {
            c.u(4)?; // video_format, video_full_range_flag
            if c.u(1)? == 1 {
                c.u(24)?; // colour primaries, transfer, matrix
            }
        }
        if c.u(1)? == 1 {
            c.ue()?;
            c.ue()?;
        }
        if c.u(1)? == 1 {
            c.u(32)?; // num_units_in_tick
            c.u(32)?; // time_scale
            c.u(1)?; // fixed_frame_rate_flag
        }
        let nal_hrd = c.u(1)? == 1;
        if nal_hrd {
            c.hrd()?;
        }
        let vcl_hrd = c.u(1)? == 1;
        if vcl_hrd {
            c.hrd()?;
        }
        if nal_hrd || vcl_hrd {
            c.u(1)?; // low_delay_hrd_flag
        }
        c.u(1)?; // pic_struct_present_flag
        // An existing bitstream_restriction is replaced below.
    } else {
        // aspect, overscan, signal type, chroma loc, timing, NAL HRD, VCL HRD, pic struct: none.
        c.w.put(8, 0);
    }
    let w = &mut c.w;
    w.put(1, 1); // bitstream_restriction_flag
    w.put(1, 1); // motion_vectors_over_pic_boundaries_flag
    w.ue(2); // max_bytes_per_pic_denom (default)
    w.ue(1); // max_bits_per_mb_denom (default)
    w.ue(16); // log2_max_mv_length_horizontal (default)
    w.ue(16); // log2_max_mv_length_vertical (default)
    w.ue(0); // max_num_reorder_frames: never reordered
    w.ue(refs.max(1)); // max_dec_frame_buffering: only the references
    w.put(1, 1); // rbsp_stop_one_bit
    w.align();
    let mut out = vec![nal[0]];
    out.extend_from_slice(&escape(&w.bytes()));
    Some(out)
}

/// Emulation prevention bytes removed (00 00 03 → 00 00).
fn unescape(d: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(d.len());
    let mut zeros = 0;
    for &b in d {
        if zeros >= 2 && b == 3 {
            zeros = 0;
            continue;
        }
        zeros = if b == 0 { zeros + 1 } else { 0 };
        out.push(b);
    }
    out
}

/// Emulation prevention bytes added (00 00 0x, x ≤ 3 → 00 00 03 0x).
fn escape(d: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(d.len() + 4);
    let mut zeros = 0;
    for &b in d {
        if zeros >= 2 && b <= 3 {
            out.push(3);
            zeros = 0;
        }
        zeros = if b == 0 { zeros + 1 } else { 0 };
        out.push(b);
    }
    out
}

struct Reader<'a> {
    d: &'a [u8],
    pos: usize,
}

impl Reader<'_> {
    fn bit(&mut self) -> Option<u32> {
        let byte = self.d.get(self.pos / 8)?;
        let b = (byte >> (7 - self.pos % 8)) & 1;
        self.pos += 1;
        Some(b as u32)
    }
}

#[derive(Default)]
struct Writer {
    bits: Vec<bool>,
}

impl Writer {
    fn put(&mut self, n: u32, v: u64) {
        for i in (0..n).rev() {
            self.bits.push((v >> i) & 1 == 1);
        }
    }

    fn ue(&mut self, v: u32) {
        let x = v as u64 + 1;
        let len = 64 - x.leading_zeros();
        self.put(len - 1, 0);
        self.put(len, x);
    }

    fn align(&mut self) {
        while self.bits.len() % 8 != 0 {
            self.bits.push(false);
        }
    }

    fn bytes(&self) -> Vec<u8> {
        self.bits.chunks(8).map(|c| c.iter().fold(0u8, |a, &b| a << 1 | b as u8) << (8 - c.len())).collect()
    }
}

/// Reads the SPS and writes the same bits as it goes.
struct Copier<'a> {
    r: Reader<'a>,
    w: Writer,
}

impl Copier<'_> {
    fn u(&mut self, n: u32) -> Option<u64> {
        let mut v = 0u64;
        for _ in 0..n {
            v = v << 1 | self.r.bit()? as u64;
        }
        self.w.put(n, v);
        Some(v)
    }

    fn ue(&mut self) -> Option<u32> {
        let mut zeros = 0;
        while self.r.bit()? == 0 {
            zeros += 1;
            if zeros > 31 {
                return None;
            }
        }
        let mut rest = 0u64;
        for _ in 0..zeros {
            rest = rest << 1 | self.r.bit()? as u64;
        }
        let v = (1u64 << zeros) - 1 + rest;
        let v = u32::try_from(v).ok()?;
        self.w.ue(v);
        Some(v)
    }

    fn se(&mut self) -> Option<i32> {
        let k = self.ue()? as i64;
        Some(if k % 2 == 1 { (k + 1) / 2 } else { -(k / 2) } as i32)
    }

    fn u_bits(&mut self, n: u32) -> Option<()> {
        self.u(n).map(|_| ())
    }

    fn scaling_list(&mut self, size: usize) -> Option<()> {
        let (mut last, mut next) = (8i32, 8i32);
        for _ in 0..size {
            if next != 0 {
                next = (last + self.se()? + 256) % 256;
            }
            last = if next == 0 { last } else { next };
        }
        Some(())
    }

    fn hrd(&mut self) -> Option<()> {
        let cpb = self.ue()?;
        if cpb > 31 {
            return None;
        }
        self.u_bits(8)?; // bit_rate_scale, cpb_size_scale
        for _ in 0..=cpb {
            self.ue()?;
            self.ue()?;
            self.u_bits(1)?;
        }
        self.u_bits(20) // delays and time offset lengths
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A High profile 1080p SPS like VideoToolbox writes, with or without the
    /// restriction (`reorder`: Some(max_dec_frame_buffering)).
    fn sps(vui: bool, restriction: Option<u32>) -> Vec<u8> {
        let mut w = Writer::default();
        w.put(8, 100); // High
        w.put(8, 0);
        w.put(8, 51); // level 5.1
        w.ue(0); // sps id
        w.ue(1); // 4:2:0
        w.ue(0);
        w.ue(0);
        w.put(1, 0);
        w.put(1, 0); // no scaling matrix
        w.ue(0); // log2_max_frame_num_minus4
        w.ue(0); // poc type 0
        w.ue(2);
        w.ue(1); // one reference
        w.put(1, 0);
        w.ue(119); // 1920
        w.ue(67); // 1088
        w.put(1, 1); // frame_mbs_only
        w.put(1, 1);
        w.put(1, 1); // cropping 1088 → 1080
        w.ue(0);
        w.ue(0);
        w.ue(0);
        w.ue(4);
        if !vui && restriction.is_none() {
            w.put(1, 0);
        } else {
            w.put(1, 1);
            if vui {
                w.put(1, 0); // aspect
                w.put(1, 0); // overscan
                w.put(1, 1); // signal type, colour description (BT.709)
                w.put(4, 0b1010);
                w.put(1, 1);
                w.put(24, 0x01_01_01);
                w.put(1, 0); // chroma loc
                w.put(1, 1); // timing 60 fps
                w.put(32, 1);
                w.put(32, 120);
                w.put(1, 0);
                w.put(1, 0); // NAL HRD
                w.put(1, 0); // VCL HRD
                w.put(1, 0); // pic struct
            } else {
                w.put(8, 0);
            }
            match restriction {
                Some(dpb) => {
                    w.put(1, 1);
                    w.put(1, 1);
                    w.ue(2);
                    w.ue(1);
                    w.ue(16);
                    w.ue(16);
                    w.ue(0);
                    w.ue(dpb);
                }
                None => w.put(1, 0),
            }
        }
        w.put(1, 1);
        w.align();
        let mut out = vec![0x67];
        out.extend_from_slice(&escape(&w.bytes()));
        out
    }

    #[test]
    fn adds_the_restriction_after_the_vui() {
        let fixed = low_delay_sps(&sps(true, None)).unwrap();
        assert_eq!(fixed, sps(true, Some(1)));
        // Done twice: the same (the old restriction is replaced).
        assert_eq!(low_delay_sps(&fixed).unwrap(), fixed);
    }

    #[test]
    fn adds_a_vui_when_there_is_none() {
        assert_eq!(low_delay_sps(&sps(false, None)).unwrap(), sps(false, Some(1)));
    }

    #[test]
    fn keyframe_gets_the_new_sps_and_keeps_the_rest() {
        let pps = [0x68, 0xEE, 0x3C, 0x80];
        let idr = [0x65, 0x88, 0x84, 0x00, 0x21];
        let mut frame = vec![0, 0, 0, 1];
        frame.extend_from_slice(&sps(true, None));
        frame.extend_from_slice(&[0, 0, 0, 1]);
        frame.extend_from_slice(&pps);
        frame.extend_from_slice(&[0, 0, 1]);
        frame.extend_from_slice(&idr);
        let out = low_delay(&frame).unwrap();
        let mut want = vec![0, 0, 0, 1];
        want.extend_from_slice(&sps(true, Some(1)));
        want.extend_from_slice(&[0, 0, 0, 1]);
        want.extend_from_slice(&pps);
        want.extend_from_slice(&[0, 0, 0, 1]);
        want.extend_from_slice(&idr);
        assert_eq!(out, want);
        // Already fixed, or no SPS at all: nothing to do.
        assert_eq!(low_delay(&out), None);
        assert_eq!(low_delay(&[0, 0, 0, 1, 0x41, 0x9A]), None);
    }

    #[test]
    fn unreadable_sps_is_left_alone() {
        assert_eq!(low_delay_sps(&[0x67, 100]), None);
        let mut frame = vec![0, 0, 0, 1, 0x67, 100, 0];
        frame.extend_from_slice(&[0, 0, 0, 1, 0x65, 0x88]);
        assert_eq!(low_delay(&frame), None);
    }

    /// A real stream: `HYPHN_H264_IN=a.h264 HYPHN_H264_OUT=b.h264 cargo test
    /// -- --ignored real_stream`, then check `b.h264` with ffmpeg.
    #[test]
    #[ignore]
    fn real_stream() {
        let input = std::fs::read(std::env::var("HYPHN_H264_IN").unwrap()).unwrap();
        let out = low_delay(&input).expect("an SPS was rewritten");
        std::fs::write(std::env::var("HYPHN_H264_OUT").unwrap(), out).unwrap();
    }

    #[test]
    fn emulation_prevention_round_trip() {
        let raw = [0, 0, 0, 0, 1, 0, 0, 3, 7, 0, 0];
        assert_eq!(unescape(&escape(&raw)), raw);
        assert_eq!(escape(&[0, 0, 1]), [0, 0, 3, 1]);
    }
}
