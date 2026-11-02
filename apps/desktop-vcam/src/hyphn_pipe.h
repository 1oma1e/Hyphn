// The pipe between the Hyphn app and its readers (the Windows webcam DLL, the
// OBS plugin). Same layout as `apps/desktop/src-tauri/src/vcam.rs`.
#pragma once
#include <cstdint>

namespace hyphn {

constexpr wchar_t kPipeName[] = L"\\\\.\\pipe\\hyphn-vcam";
constexpr uint32_t kMagic = 0x31565948;  // "HYV1"

enum Kind : uint16_t {
    kVideo = 1,   // app -> reader: one Annex-B frame
    kState = 2,   // app -> reader: live, phone, multi, style, then the message (UTF-8)
    kRaw = 3,     // app -> reader: one decoded NV12 picture, width x height, rows packed (ADR-0035)
    kHello = 16,  // reader -> app: an app shows the camera, at width x height (flags: kCanHevc, kCanRaw)
    kKey = 17,    // reader -> app: the decoder needs a keyframe
    kSize = 18,   // reader -> app: the camera is now shown at width x height
};

enum HelloFlags : uint16_t {
    kCanHevc = 1,  // the reader decodes HEVC itself
    kCanRaw = 2,   // the reader takes decoded pictures (kRaw)
};

enum Codec : uint8_t { kHevc = 1, kH264 = 2 };

#pragma pack(push, 1)
struct Header {
    uint32_t magic;
    uint16_t kind;
    uint16_t flags;
    uint32_t len;
    uint32_t width;
    uint32_t height;
    uint8_t codec;
    uint8_t key;
    uint16_t reserved;
    int64_t pts_us;
};
#pragma pack(pop)
static_assert(sizeof(Header) == 32, "pipe header is 32 bytes");

}  // namespace hyphn
