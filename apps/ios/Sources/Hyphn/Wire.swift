// Messages of protocol/hyphn.proto, encoded by hand (no protoc on the build
// server). Keep the field numbers in step with the .proto file and with
// apps/desktop/src-tauri/src/proto.rs. Each message on the wire is an
// Envelope prefixed by its length (4 bytes, big-endian).

import Foundation

enum WireError: Error {
    case truncated
    case malformed
}

enum Thermal: Int {
    case unknown = 0, nominal, fair, serious, critical
}

enum Charge: Int {
    case unknown = 0, unplugged, charging, full
}

enum Codec: Int {
    case unknown = 0, hevc, h264
}

struct DeviceStatus {
    var batteryPercent: Int32 = -1
    var charge: Charge = .unknown
    var lowPower = false
    var thermal: Thermal = .unknown
    var storageFree: UInt64 = 0
    var storageTotal: UInt64 = 0
    var measuredAtMs: Int64 = 0
}

struct CamControl: Equatable {
    var live = false
    var height: UInt32 = 1080
    var fps: UInt32 = 30
    var bitrateKbps: UInt32 = 12_000
    var codec: Codec = .hevc
    var front = false
    var lens: UInt32 = 1
}

struct CamState {
    var open = false
    var live = false
    var width: UInt32 = 0
    var height: UInt32 = 0
    var fps: UInt32 = 0
    var codec: Codec = .unknown
    var front = false
    var lens: UInt32 = 1
    var lensCount: UInt32 = 4
}

struct VideoFrame {
    var ptsUs: Int64
    var keyframe: Bool
    var codec: Codec
    var width: UInt32
    var height: UInt32
    var data: Data
}

enum RefusedReason: Int {
    case unknown = 0, expired, alreadyUsed, unknownToken, wrongVersion, unknownDevice, busy
}

/// One Envelope. Only the messages the iPhone sends can be encoded, only the
/// ones it receives can be decoded.
enum Msg {
    case pairRequest(token: Data, deviceName: String, model: String, appVersion: String)
    case pairPending(pcName: String)
    case pairConfirm(accept: Bool)
    case pairDone
    case refused(reason: RefusedReason, message: String)
    case hello(deviceName: String, model: String, appVersion: String)
    case welcome(pcName: String)
    case deviceStatus(DeviceStatus)
    case ping(id: UInt64)
    case pong(id: UInt64)
    case camControl(CamControl)
    case camState(CamState)
    case camQuality(height: UInt32, fps: UInt32)
    case videoHello
    case videoFrame(VideoFrame)
    case forget
    case other
}

let protocolVersion: UInt32 = 1

// MARK: - Writer

struct ProtoWriter {
    var data = Data()

    mutating func varint(_ value: UInt64) {
        var v = value
        while v >= 0x80 {
            data.append(UInt8(v & 0x7F) | 0x80)
            v >>= 7
        }
        data.append(UInt8(v))
    }

    mutating func tag(_ field: Int, _ wire: Int) {
        varint(UInt64(field << 3 | wire))
    }

    // proto3: default values are not written.
    mutating func uint(_ field: Int, _ v: UInt64) {
        if v != 0 { tag(field, 0); varint(v) }
    }

    mutating func int(_ field: Int, _ v: Int64) {
        // int32 and int64 negatives are 10-byte varints of the 64-bit pattern.
        if v != 0 { tag(field, 0); varint(UInt64(bitPattern: v)) }
    }

    mutating func bool(_ field: Int, _ v: Bool) {
        if v { tag(field, 0); varint(1) }
    }

    mutating func bytes(_ field: Int, _ v: Data) {
        if !v.isEmpty { tag(field, 2); varint(UInt64(v.count)); data.append(v) }
    }

    mutating func string(_ field: Int, _ v: String) {
        bytes(field, Data(v.utf8))
    }

    /// A oneof member is always written, even empty: its presence is the message.
    mutating func message(_ field: Int, _ body: Data) {
        tag(field, 2)
        varint(UInt64(body.count))
        data.append(body)
    }
}

// MARK: - Reader

struct ProtoReader {
    let data: Data
    var i: Int

    init(_ data: Data) {
        self.data = data
        self.i = data.startIndex
    }

    var atEnd: Bool { i >= data.endIndex }

    mutating func varint() throws -> UInt64 {
        var result: UInt64 = 0
        var shift: UInt64 = 0
        while true {
            guard i < data.endIndex else { throw WireError.truncated }
            let b = data[i]
            i += 1
            result |= UInt64(b & 0x7F) << shift
            if b < 0x80 { return result }
            shift += 7
            if shift > 63 { throw WireError.malformed }
        }
    }

    mutating func field() throws -> (field: Int, wire: Int)? {
        if atEnd { return nil }
        let t = try varint()
        return (Int(t >> 3), Int(t & 7))
    }

    mutating func lengthDelimited() throws -> Data {
        let n = Int(try varint())
        guard n >= 0, i + n <= data.endIndex else { throw WireError.truncated }
        let d = data[i..<(i + n)]
        i += n
        return Data(d)
    }

    mutating func skip(_ wire: Int) throws {
        switch wire {
        case 0: _ = try varint()
        case 1: i += 8
        case 2: _ = try lengthDelimited()
        case 5: i += 4
        default: throw WireError.malformed
        }
        if i > data.endIndex { throw WireError.truncated }
    }

    mutating func string() throws -> String {
        String(decoding: try lengthDelimited(), as: UTF8.self)
    }
}

// MARK: - Envelope

extension Msg {
    func encoded() -> Data {
        var b = ProtoWriter()
        let field: Int
        switch self {
        case let .pairRequest(token, name, model, version):
            field = 1
            b.uint(1, UInt64(protocolVersion)); b.bytes(2, token); b.string(3, name); b.string(4, model); b.string(5, version)
        case let .pairConfirm(accept):
            field = 3
            b.bool(1, accept)
        case let .hello(name, model, version):
            field = 6
            b.uint(1, UInt64(protocolVersion)); b.string(2, name); b.string(3, model); b.string(4, version)
        case let .deviceStatus(s):
            field = 8
            b.int(1, Int64(s.batteryPercent)); b.uint(2, UInt64(s.charge.rawValue)); b.bool(3, s.lowPower)
            b.uint(4, UInt64(s.thermal.rawValue)); b.uint(5, s.storageFree); b.uint(6, s.storageTotal); b.int(7, s.measuredAtMs)
        case let .pong(id):
            field = 10
            b.uint(1, id)
        case let .camState(c):
            field = 12
            b.bool(1, c.open); b.bool(2, c.live); b.uint(3, UInt64(c.width)); b.uint(4, UInt64(c.height))
            b.uint(5, UInt64(c.fps)); b.uint(6, UInt64(c.codec.rawValue)); b.bool(7, c.front); b.uint(8, UInt64(c.lens))
            b.uint(9, UInt64(c.lensCount))
        case let .camQuality(height, fps):
            field = 13
            b.uint(1, UInt64(height)); b.uint(2, UInt64(fps))
        case .videoHello:
            field = 14
        case let .videoFrame(f):
            field = 15
            b.int(1, f.ptsUs); b.bool(2, f.keyframe); b.uint(3, UInt64(f.codec.rawValue))
            b.uint(4, UInt64(f.width)); b.uint(5, UInt64(f.height)); b.bytes(6, f.data)
        case .forget:
            field = 16
        default:
            return Data()
        }
        var env = ProtoWriter()
        env.message(field, b.data)
        return env.data
    }

    /// Length prefix + envelope, ready for the socket.
    func framed() -> Data {
        let body = encoded()
        var len = UInt32(body.count).bigEndian
        var out = Data(bytes: &len, count: 4)
        out.append(body)
        return out
    }

    static func decode(_ data: Data) throws -> Msg {
        var r = ProtoReader(data)
        var result: Msg = .other
        while let (field, wire) = try r.field() {
            guard wire == 2 else { try r.skip(wire); continue }
            let body = try r.lengthDelimited()
            var m = ProtoReader(body)
            switch field {
            case 2:
                var pc = ""
                while let (f, w) = try m.field() { if f == 1 && w == 2 { pc = try m.string() } else { try m.skip(w) } }
                result = .pairPending(pcName: pc)
            case 4:
                result = .pairDone
            case 5:
                var reason = RefusedReason.unknown, text = ""
                while let (f, w) = try m.field() {
                    if f == 1 && w == 0 { reason = RefusedReason(rawValue: Int(try m.varint())) ?? .unknown }
                    else if f == 2 && w == 2 { text = try m.string() }
                    else { try m.skip(w) }
                }
                result = .refused(reason: reason, message: text)
            case 7:
                var pc = ""
                while let (f, w) = try m.field() { if f == 1 && w == 2 { pc = try m.string() } else { try m.skip(w) } }
                result = .welcome(pcName: pc)
            case 9:
                var id: UInt64 = 0
                while let (f, w) = try m.field() { if f == 1 && w == 0 { id = try m.varint() } else { try m.skip(w) } }
                result = .ping(id: id)
            case 11:
                // Every field starts at its proto3 default (0 / false), not at CamControl's.
                var c = CamControl(live: false, height: 0, fps: 0, bitrateKbps: 0, codec: .unknown, front: false, lens: 0)
                while let (f, w) = try m.field() {
                    guard w == 0 else { try m.skip(w); continue }
                    let v = try m.varint()
                    switch f {
                    case 1: c.live = v != 0
                    case 2: c.height = UInt32(truncatingIfNeeded: v)
                    case 3: c.fps = UInt32(truncatingIfNeeded: v)
                    case 4: c.bitrateKbps = UInt32(truncatingIfNeeded: v)
                    case 5: c.codec = Codec(rawValue: Int(v)) ?? .unknown
                    case 6: c.front = v != 0
                    case 7: c.lens = UInt32(truncatingIfNeeded: v)
                    default: break
                    }
                }
                result = .camControl(c)
            case 16:
                result = .forget
            default:
                result = .other
            }
        }
        return result
    }
}
