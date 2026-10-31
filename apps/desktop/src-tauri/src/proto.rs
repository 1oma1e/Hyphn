//! Messages of `protocol/hyphn.proto`, written by hand with prost derives (no
//! protoc needed to build). Keep the tags in step with the .proto file and
//! with `apps/ios/Sources/Hyphn/Wire.swift`.

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

/// Biggest message accepted (a 4K keyframe fits easily).
pub const MAX_MESSAGE: usize = 16 * 1024 * 1024;

#[derive(Clone, PartialEq, prost::Message)]
pub struct Envelope {
    #[prost(oneof = "envelope::Msg", tags = "1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17")]
    pub msg: Option<envelope::Msg>,
}

pub mod envelope {
    #[derive(Clone, PartialEq, prost::Oneof)]
    pub enum Msg {
        #[prost(message, tag = "1")]
        PairRequest(super::PairRequest),
        #[prost(message, tag = "2")]
        PairPending(super::PairPending),
        #[prost(message, tag = "3")]
        PairConfirm(super::PairConfirm),
        #[prost(message, tag = "4")]
        PairDone(super::PairDone),
        #[prost(message, tag = "5")]
        Refused(super::Refused),
        #[prost(message, tag = "6")]
        Hello(super::Hello),
        #[prost(message, tag = "7")]
        Welcome(super::Welcome),
        #[prost(message, tag = "8")]
        DeviceStatus(super::DeviceStatus),
        #[prost(message, tag = "9")]
        Ping(super::Ping),
        #[prost(message, tag = "10")]
        Pong(super::Pong),
        #[prost(message, tag = "11")]
        CamControl(super::CamControl),
        #[prost(message, tag = "12")]
        CamState(super::CamState),
        #[prost(message, tag = "13")]
        CamQuality(super::CamQuality),
        #[prost(message, tag = "14")]
        VideoHello(super::VideoHello),
        #[prost(message, tag = "15")]
        VideoFrame(super::VideoFrame),
        #[prost(message, tag = "16")]
        Forget(super::Forget),
        #[prost(message, tag = "17")]
        KeyRequest(super::KeyRequest),
    }
}

impl From<envelope::Msg> for Envelope {
    fn from(m: envelope::Msg) -> Self {
        Self { msg: Some(m) }
    }
}

#[derive(Clone, PartialEq, prost::Message)]
pub struct PairRequest {
    #[prost(uint32, tag = "1")]
    pub protocol_version: u32,
    #[prost(bytes = "vec", tag = "2")]
    pub token: Vec<u8>,
    #[prost(string, tag = "3")]
    pub device_name: String,
    #[prost(string, tag = "4")]
    pub model: String,
    #[prost(string, tag = "5")]
    pub app_version: String,
}

#[derive(Clone, PartialEq, prost::Message)]
pub struct PairPending {
    #[prost(string, tag = "1")]
    pub pc_name: String,
}

#[derive(Clone, PartialEq, prost::Message)]
pub struct PairConfirm {
    #[prost(bool, tag = "1")]
    pub accept: bool,
}

#[derive(Clone, PartialEq, prost::Message)]
pub struct PairDone {}

#[derive(Clone, PartialEq, prost::Message)]
pub struct Refused {
    #[prost(enumeration = "refused::Reason", tag = "1")]
    pub reason: i32,
    #[prost(string, tag = "2")]
    pub message: String,
}

pub mod refused {
    #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, prost::Enumeration)]
    #[repr(i32)]
    pub enum Reason {
        Unknown = 0,
        Expired = 1,
        AlreadyUsed = 2,
        UnknownToken = 3,
        WrongVersion = 4,
        UnknownDevice = 5,
        Busy = 6,
    }
}

#[derive(Clone, PartialEq, prost::Message)]
pub struct Hello {
    #[prost(uint32, tag = "1")]
    pub protocol_version: u32,
    #[prost(string, tag = "2")]
    pub device_name: String,
    #[prost(string, tag = "3")]
    pub model: String,
    #[prost(string, tag = "4")]
    pub app_version: String,
}

#[derive(Clone, PartialEq, prost::Message)]
pub struct Welcome {
    #[prost(string, tag = "1")]
    pub pc_name: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, prost::Enumeration)]
#[repr(i32)]
pub enum Thermal {
    Unknown = 0,
    Nominal = 1,
    Fair = 2,
    Serious = 3,
    Critical = 4,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, prost::Enumeration)]
#[repr(i32)]
pub enum Charge {
    Unknown = 0,
    Unplugged = 1,
    Charging = 2,
    Full = 3,
}

#[derive(Clone, PartialEq, prost::Message)]
pub struct DeviceStatus {
    #[prost(int32, tag = "1")]
    pub battery_percent: i32,
    #[prost(enumeration = "Charge", tag = "2")]
    pub charge: i32,
    #[prost(bool, tag = "3")]
    pub low_power: bool,
    #[prost(enumeration = "Thermal", tag = "4")]
    pub thermal: i32,
    #[prost(uint64, tag = "5")]
    pub storage_free_bytes: u64,
    #[prost(uint64, tag = "6")]
    pub storage_total_bytes: u64,
    #[prost(int64, tag = "7")]
    pub measured_at_ms: i64,
}

#[derive(Clone, PartialEq, prost::Message)]
pub struct Ping {
    #[prost(uint64, tag = "1")]
    pub id: u64,
}

#[derive(Clone, PartialEq, prost::Message)]
pub struct Pong {
    #[prost(uint64, tag = "1")]
    pub id: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, prost::Enumeration)]
#[repr(i32)]
pub enum Codec {
    Unknown = 0,
    Hevc = 1,
    H264 = 2,
}

#[derive(Clone, PartialEq, prost::Message)]
pub struct CamControl {
    #[prost(bool, tag = "1")]
    pub live: bool,
    #[prost(uint32, tag = "2")]
    pub height: u32,
    #[prost(uint32, tag = "3")]
    pub fps: u32,
    #[prost(uint32, tag = "4")]
    pub bitrate_kbps: u32,
    #[prost(enumeration = "Codec", tag = "5")]
    pub codec: i32,
    #[prost(bool, tag = "6")]
    pub front: bool,
    #[prost(uint32, tag = "7")]
    pub lens: u32,
    #[prost(sint32, tag = "8")]
    pub exposure_bias_tenths: i32,
    #[prost(bool, tag = "9")]
    pub focus_manual: bool,
    #[prost(uint32, tag = "10")]
    pub focus: u32,
    #[prost(bool, tag = "11")]
    pub wb_manual: bool,
    #[prost(uint32, tag = "12")]
    pub wb_kelvin: u32,
    #[prost(bool, tag = "13")]
    pub torch: bool,
    #[prost(uint32, tag = "14")]
    pub stabilization: u32,
}

#[derive(Clone, PartialEq, prost::Message)]
pub struct CamState {
    #[prost(bool, tag = "1")]
    pub open: bool,
    #[prost(bool, tag = "2")]
    pub live: bool,
    #[prost(uint32, tag = "3")]
    pub width: u32,
    #[prost(uint32, tag = "4")]
    pub height: u32,
    #[prost(uint32, tag = "5")]
    pub fps: u32,
    #[prost(enumeration = "Codec", tag = "6")]
    pub codec: i32,
    #[prost(bool, tag = "7")]
    pub front: bool,
    #[prost(uint32, tag = "8")]
    pub lens: u32,
    #[prost(uint32, tag = "9")]
    pub lens_count: u32,
    #[prost(bool, tag = "10")]
    pub by_user: bool,
}

#[derive(Clone, PartialEq, prost::Message)]
pub struct CamQuality {
    #[prost(uint32, tag = "1")]
    pub height: u32,
    #[prost(uint32, tag = "2")]
    pub fps: u32,
}

#[derive(Clone, PartialEq, prost::Message)]
pub struct VideoHello {}

#[derive(Clone, PartialEq, prost::Message)]
pub struct VideoFrame {
    #[prost(int64, tag = "1")]
    pub pts_us: i64,
    #[prost(bool, tag = "2")]
    pub keyframe: bool,
    #[prost(enumeration = "Codec", tag = "3")]
    pub codec: i32,
    #[prost(uint32, tag = "4")]
    pub width: u32,
    #[prost(uint32, tag = "5")]
    pub height: u32,
    /// `Bytes`: decoded without a copy out of the received buffer.
    #[prost(bytes = "bytes", tag = "6")]
    pub data: bytes::Bytes,
}

#[derive(Clone, PartialEq, prost::Message)]
pub struct Forget {}

#[derive(Clone, PartialEq, prost::Message)]
pub struct KeyRequest {}

/// Reads one length-prefixed message. `Ok(None)` on a clean end of stream.
pub async fn read_msg<R: AsyncRead + Unpin>(r: &mut R) -> std::io::Result<Option<Envelope>> {
    let mut len = [0u8; 4];
    match r.read_exact(&mut len).await {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let len = u32::from_be_bytes(len) as usize;
    if len > MAX_MESSAGE {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "message too big"));
    }
    let mut buf = vec![0u8; len];
    r.read_exact(&mut buf).await?;
    prost::Message::decode(bytes::Bytes::from(buf))
        .map(Some)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}

pub async fn write_msg<W: AsyncWrite + Unpin>(w: &mut W, m: &Envelope) -> std::io::Result<()> {
    let body = prost::Message::encode_to_vec(m);
    let mut out = Vec::with_capacity(body.len() + 4);
    out.extend_from_slice(&(body.len() as u32).to_be_bytes());
    out.extend_from_slice(&body);
    w.write_all(&out).await?;
    w.flush().await
}

#[cfg(test)]
mod tests {
    use super::*;
    use envelope::Msg;

    /// The bytes Wire.swift must write and read for the Cam fields of 2026-10-31.
    #[test]
    fn cam_fields_known_encoding() {
        use prost::Message;
        // sint32 −3 = zigzag 5, in CamControl (envelope field 11).
        let c: Envelope = Msg::CamControl(CamControl { exposure_bias_tenths: -3, ..Default::default() }).into();
        assert_eq!(c.encode_to_vec(), vec![0x5A, 0x02, 0x40, 0x05]);
        // by_user (tag 10) in CamState (envelope field 12).
        let s: Envelope = Msg::CamState(CamState { by_user: true, ..Default::default() }).into();
        assert_eq!(s.encode_to_vec(), vec![0x62, 0x02, 0x50, 0x01]);
        // KeyRequest: envelope field 17, empty.
        let k: Envelope = Msg::KeyRequest(KeyRequest {}).into();
        assert_eq!(k.encode_to_vec(), vec![0x8A, 0x01, 0x00]);
    }

    #[tokio::test]
    async fn frames_round_trip() {
        let msgs: Vec<Envelope> = vec![
            Msg::PairRequest(PairRequest {
                protocol_version: 1,
                token: vec![7; 16],
                device_name: "iPhone d’Evan".into(),
                model: "iPhone17,2".into(),
                app_version: "0.2.0".into(),
            })
            .into(),
            Msg::DeviceStatus(DeviceStatus { battery_percent: -1, thermal: Thermal::Serious as i32, ..Default::default() }).into(),
            Msg::VideoFrame(VideoFrame { keyframe: true, data: vec![0, 0, 0, 1, 0x40].into(), ..Default::default() }).into(),
            Msg::KeyRequest(KeyRequest {}).into(),
        ];
        let mut buf = Vec::new();
        for m in &msgs {
            write_msg(&mut buf, m).await.unwrap();
        }
        let mut rd = buf.as_slice();
        for m in &msgs {
            assert_eq!(read_msg(&mut rd).await.unwrap().as_ref(), Some(m));
        }
        assert_eq!(read_msg(&mut rd).await.unwrap(), None);
    }

    /// Bytes the Swift codec must produce for the same message (Wire.swift).
    #[test]
    fn known_encoding() {
        let m: Envelope = Msg::Pong(Pong { id: 300 }).into();
        // field 10, length-delimited: tag 0x52, len 3, then field 1 varint 300 = 08 AC 02.
        assert_eq!(prost::Message::encode_to_vec(&m), vec![0x52, 3, 0x08, 0xAC, 0x02]);
        let s: Envelope = Msg::DeviceStatus(DeviceStatus { battery_percent: -1, ..Default::default() }).into();
        // int32 -1 is a 10-byte varint.
        assert_eq!(
            prost::Message::encode_to_vec(&s),
            vec![0x42, 11, 0x08, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x01]
        );
    }

    #[tokio::test]
    async fn oversized_message_is_refused() {
        let mut buf = ((MAX_MESSAGE + 1) as u32).to_be_bytes().to_vec();
        buf.extend_from_slice(&[0; 8]);
        assert!(read_msg(&mut buf.as_slice()).await.is_err());
    }
}
