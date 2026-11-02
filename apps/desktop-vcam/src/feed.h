// The picture shared by the Windows webcam and the OBS source: reads the
// Hyphn pipe, decodes the iPhone stream on the graphics card (Media
// Foundation + Direct3D 11), scales it to the size the reader wants, and draws
// the waiting screen (Direct2D) when there is no picture (ADR-0018, ADR-0022).
#pragma once

#include <windows.h>
#include <d2d1_3.h>
#include <d3d11_4.h>
#include <dwrite_3.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mftransform.h>
#include <wrl/client.h>

#include <atomic>
#include <cstdint>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace hyphn {

using Microsoft::WRL::ComPtr;

enum class Pixel { NV12, BGRA };

struct Header;  // hyphn_pipe.h

// Diagnostic log, written only if C:\ProgramData\Hyphn exists (made by the
// installer): vcam.log, one line per event, never any picture.
void Log(const char* fmt, ...);

// What the app says about the camera (pipe message kState).
struct WaitState {
    bool app = false;  // the pipe is connected
    bool live = false;
    bool phone = false;
    bool multi = true;
    uint8_t style = 0;  // 0 animated, 1 minimal
    std::wstring message = L"Je reviens bientôt";
};

class Feed {
public:
    explicit Feed(HMODULE module);
    ~Feed();
    Feed(const Feed&) = delete;
    Feed& operator=(const Feed&) = delete;

    // Opens the graphics card and starts reading the pipe. `w`×`h` is sent to
    // the app (informative); Fill decides the real size.
    HRESULT Start(UINT32 w, UINT32 h);
    void Stop();

    // In the Hyphn app (ADR-0035): no pipe, the app hands the compressed
    // frames to Decode and takes NV12 pictures with Fill, for the webcam,
    // which cannot decode HEVC in the camera service.
    HRESULT StartLocal();
    // True when the decoder needs a keyframe (the app asks the iPhone).
    bool Decode(uint8_t codec, uint32_t w, uint32_t h, bool key, int64_t pts, const BYTE* p, uint32_t len);
    bool HevcOk() const { return hevcOk_; }

    // Set each time a new decoded picture is ready.
    HANDLE FrameEvent() const { return frameEvent_; }

    // Writes the latest picture into `dst` (Y plane then UV plane for NV12,
    // `pitch` bytes per row, may be negative for bottom-up RGB). `video` tells
    // whether it was the iPhone picture or the waiting screen.
    HRESULT Fill(BYTE* dst, LONG pitch, UINT32 w, UINT32 h, Pixel fmt, bool* video);

    // Size of the iPhone picture as shown (0×0 if none yet).
    void VideoSize(UINT32* w, UINT32* h);

    // A recent iPhone picture is there and the camera is live.
    bool HasLiveVideo();

private:
    // Pipe thread.
    void PipeLoop();
    bool ReadAll(HANDLE pipe, void* buf, DWORD len);
    bool WriteAll(HANDLE pipe, const void* buf, DWORD len);
    void SendKind(HANDLE pipe, uint16_t kind, uint16_t flags);
    bool ServerIsHyphn(HANDLE pipe);
    void SendSize(HANDLE pipe, uint32_t w, uint32_t h);
    void OnState(const BYTE* p, uint32_t len);
    bool ReadRaw(HANDLE pipe, const Header& h);

    // Decoder (pipe thread only).
    HRESULT MakeDecoder(uint8_t codec, uint32_t w, uint32_t h);
    HRESULT NegotiateOutput();
    void DropDecoder();
    HRESULT Drain();
    void Publish(IMFSample* sample, bool raw = false);
    bool CanDecode(const GUID& subtype);

    // Rendering (caller of Fill, under renderLock_).
    HRESULT InitDevice();
    HRESULT EnsureTargets(UINT32 w, UINT32 h, Pixel fmt);
    HRESULT EnsureProcessor(ComPtr<ID3D11VideoProcessor>& vp, ComPtr<ID3D11VideoProcessorEnumerator>& en,
                            UINT32& keyW, UINT32& keyH, UINT32 inW, UINT32 inH, UINT32 outW, UINT32 outH);
    HRESULT Blit(ID3D11VideoProcessor* vp, ID3D11VideoProcessorEnumerator* en, ID3D11Texture2D* in, UINT slice,
                 RECT src, bool rgbIn, ID3D11Texture2D* out, UINT32 outW, UINT32 outH, Pixel fmt, bool letterbox);
    HRESULT TextureOf(IMFSample* s, ComPtr<ID3D11Texture2D>& tex, UINT& slice);
    HRESULT DrawWait(const WaitState& st, bool videoExpected);
    HRESULT LoadFonts();
    HRESULT Readback(ID3D11Texture2D* tex, BYTE* dst, LONG pitch, UINT32 w, UINT32 h, Pixel fmt);

    HMODULE module_;
    std::atomic<bool> stop_{false};
    HANDLE stopEvent_ = nullptr;
    HANDLE frameEvent_ = nullptr;
    std::thread pipeThread_;
    bool started_ = false;
    UINT32 askW_ = 1920, askH_ = 1080;

    std::mutex stateLock_;
    WaitState state_;

    // Device (thread safe: multithread protected).
    ComPtr<ID3D11Device> dev_;
    ComPtr<ID3D11DeviceContext> ctx_;
    ComPtr<ID3D11VideoDevice> vdev_;
    ComPtr<ID3D11VideoContext> vctx_;
    ComPtr<IMFDXGIDeviceManager> manager_;
    UINT managerToken_ = 0;

    // Decoder.
    ComPtr<IMFTransform> mft_;
    bool providesSamples_ = false;
    DWORD outBytes_ = 0;
    uint8_t decCodec_ = 0;
    uint32_t decW_ = 0, decH_ = 0;
    bool waitKey_ = true;
    bool hevcOk_ = false;
    ULONGLONG decoderFailTick_ = 0;

    // Latest decoded picture.
    std::mutex frameLock_;
    ComPtr<IMFSample> latest_;
    RECT latestRect_{};
    ULONGLONG latestTick_ = 0;
    uint64_t latestSeq_ = 0;
    // The latest picture came decoded from the app (kRaw): NV12, rows packed.
    bool latestRaw_ = false;
    // Size the reader asked at its last Fill: sent to the app (kSize).
    std::atomic<uint32_t> fillW_{0}, fillH_{0};
    UINT32 vidW_ = 0, vidH_ = 0;
    // Software decoder output, uploaded to the card.
    ComPtr<ID3D11Texture2D> upload_, uploaded_;
    UINT32 uploadW_ = 0, uploadH_ = 0;

    // Render targets.
    std::mutex renderLock_;
    UINT32 outW_ = 0, outH_ = 0;
    Pixel outFmt_ = Pixel::NV12;
    ComPtr<ID3D11Texture2D> out_, staging_, wait_;
    ComPtr<ID3D11VideoProcessor> vpVideo_, vpWait_;
    ComPtr<ID3D11VideoProcessorEnumerator> enVideo_, enWait_;
    UINT32 vpVideoW_ = 0, vpVideoH_ = 0, vpWaitW_ = 0, vpWaitH_ = 0;

    // Waiting screen.
    ComPtr<ID2D1Factory3> d2dFactory_;
    ComPtr<ID2D1Device2> d2dDevice_;
    ComPtr<ID2D1DeviceContext2> dc_;
    ComPtr<ID2D1Bitmap1> waitBitmap_;
    ComPtr<IDWriteFactory5> dwrite_;
    ComPtr<IDWriteFontCollection1> fonts_;
    LARGE_INTEGER qpcFreq_{}, qpcStart_{};
};

}  // namespace hyphn
