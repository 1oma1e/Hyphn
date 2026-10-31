// See feed.h. Threads: the pipe thread reads and decodes; the reader (webcam
// stream or OBS thread) calls Fill. The Direct3D device is multithread
// protected; the latest decoded sample is swapped under frameLock_.

#include "feed.h"

#include <aclapi.h>
#include <sddl.h>
#include <strmif.h>
#include <codecapi.h>
#include <mferror.h>

#include <algorithm>
#include <cmath>
#include <cstdarg>
#include <cstdio>

#include "hyphn_pipe.h"
#include "resource.h"

namespace hyphn {

namespace {

constexpr ULONGLONG kStaleMs = 1500;  // no picture for this long: waiting screen
constexpr uint32_t kMaxPayload = 16u << 20;

const wchar_t* const kLangs[] = {
    L"Je reviens bientôt", L"Be right back",  L"Vuelvo enseguida", L"Bin gleich zurück",
    L"Torno subito",            L"Volto já", L"すぐ戻ります", L"곧 돌아올게요",
};
constexpr int kLangCount = 8;
constexpr double kLangSeconds = 2.6;

D2D1_COLOR_F Rgba(uint32_t rgb, float a = 1.f) {
    return D2D1::ColorF(((rgb >> 16) & 255) / 255.f, ((rgb >> 8) & 255) / 255.f, (rgb & 255) / 255.f, a);
}

double Smooth(double x) {
    x = std::clamp(x, 0.0, 1.0);
    return x * x * (3 - 2 * x);
}

}  // namespace

void Log(const char* fmt, ...) {
    static std::mutex m;
    char line[512];
    SYSTEMTIME t;
    GetLocalTime(&t);
    int n = snprintf(line, sizeof line, "%02d:%02d:%02d.%03d [%lu] ", t.wHour, t.wMinute, t.wSecond, t.wMilliseconds, GetCurrentProcessId());
    va_list a;
    va_start(a, fmt);
    vsnprintf(line + n, sizeof line - n - 2, fmt, a);
    va_end(a);
    strcat_s(line, "\r\n");
    char dir[MAX_PATH];
    if (!GetEnvironmentVariableA("ProgramData", dir, MAX_PATH)) strcpy_s(dir, "C:\\ProgramData");
    std::string path = std::string(dir) + "\\Hyphn\\vcam.log";
    std::lock_guard<std::mutex> l(m);
    HANDLE f = CreateFileA(path.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_ALWAYS, 0, nullptr);
    if (f == INVALID_HANDLE_VALUE) return;
    DWORD w;
    WriteFile(f, line, static_cast<DWORD>(strlen(line)), &w, nullptr);
    CloseHandle(f);
}

Feed::Feed(HMODULE module) : module_(module) {
    stopEvent_ = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    frameEvent_ = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    QueryPerformanceFrequency(&qpcFreq_);
    QueryPerformanceCounter(&qpcStart_);
}

Feed::~Feed() {
    Stop();
    if (stopEvent_) CloseHandle(stopEvent_);
    if (frameEvent_) CloseHandle(frameEvent_);
}

HRESULT Feed::Start(UINT32 w, UINT32 h) {
    if (started_) return S_OK;
    askW_ = w ? w : 1920;
    askH_ = h ? h : 1080;
    HRESULT hr = MFStartup(MF_VERSION, MFSTARTUP_NOSOCKET);
    if (FAILED(hr)) return hr;
    hr = InitDevice();
    if (FAILED(hr)) {
        Log("feed: no device 0x%08X", hr);
        MFShutdown();
        return hr;
    }
    hevcOk_ = CanDecode(MFVideoFormat_HEVC);
    Log("feed: start %ux%u, HEVC decoder %s, h264 %s", askW_, askH_, hevcOk_ ? "yes" : "no", CanDecode(MFVideoFormat_H264) ? "yes" : "no");
    stop_ = false;
    ResetEvent(stopEvent_);
    pipeThread_ = std::thread([this] { PipeLoop(); });
    started_ = true;
    return S_OK;
}

void Feed::Stop() {
    if (!started_) return;
    stop_ = true;
    SetEvent(stopEvent_);
    if (pipeThread_.joinable()) pipeThread_.join();
    {
        std::lock_guard<std::mutex> l(frameLock_);
        latest_.Reset();
    }
    DropDecoder();
    {
        std::lock_guard<std::mutex> l(renderLock_);
        out_.Reset(); staging_.Reset(); wait_.Reset(); waitBitmap_.Reset();
        vpVideo_.Reset(); vpWait_.Reset(); enVideo_.Reset(); enWait_.Reset();
        outW_ = outH_ = vpVideoW_ = vpVideoH_ = vpWaitW_ = vpWaitH_ = 0;
        upload_.Reset(); uploaded_.Reset();
        dc_.Reset(); d2dDevice_.Reset();
    }
    manager_.Reset(); vctx_.Reset(); vdev_.Reset(); ctx_.Reset(); dev_.Reset();
    MFShutdown();
    started_ = false;
}

void Feed::VideoSize(UINT32* w, UINT32* h) {
    std::lock_guard<std::mutex> l(frameLock_);
    *w = vidW_;
    *h = vidH_;
}

// ---------------------------------------------------------------- device

HRESULT Feed::InitDevice() {
    const D3D_FEATURE_LEVEL levels[] = {D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_1, D3D_FEATURE_LEVEL_10_0};
    UINT flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT;
    HRESULT hr = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, flags, levels, ARRAYSIZE(levels),
                                   D3D11_SDK_VERSION, &dev_, nullptr, &ctx_);
    if (FAILED(hr)) {
        // No usable card (remote session…): software device, slower but working.
        hr = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_WARP, nullptr, flags & ~D3D11_CREATE_DEVICE_VIDEO_SUPPORT, levels,
                               ARRAYSIZE(levels), D3D11_SDK_VERSION, &dev_, nullptr, &ctx_);
        if (FAILED(hr)) return hr;
    }
    ComPtr<ID3D10Multithread> mt;
    if (SUCCEEDED(ctx_.As(&mt))) mt->SetMultithreadProtected(TRUE);
    dev_.As(&vdev_);
    ctx_.As(&vctx_);
    if (SUCCEEDED(MFCreateDXGIDeviceManager(&managerToken_, &manager_))) {
        if (FAILED(manager_->ResetDevice(dev_.Get(), managerToken_))) manager_.Reset();
    }
    hr = D2D1CreateFactory(D2D1_FACTORY_TYPE_MULTI_THREADED, __uuidof(ID2D1Factory3), nullptr,
                           reinterpret_cast<void**>(d2dFactory_.ReleaseAndGetAddressOf()));
    if (FAILED(hr)) return hr;
    ComPtr<IDXGIDevice> dxgi;
    hr = dev_.As(&dxgi);
    if (FAILED(hr)) return hr;
    hr = d2dFactory_->CreateDevice(dxgi.Get(), &d2dDevice_);
    if (FAILED(hr)) return hr;
    hr = d2dDevice_->CreateDeviceContext(D2D1_DEVICE_CONTEXT_OPTIONS_NONE, &dc_);
    if (FAILED(hr)) return hr;
    hr = DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED, __uuidof(IDWriteFactory5),
                             reinterpret_cast<IUnknown**>(dwrite_.ReleaseAndGetAddressOf()));
    if (FAILED(hr)) return hr;
    LoadFonts();  // Segoe UI if Geist cannot be read
    return S_OK;
}

// Geist and Geist Mono, embedded as WOFF2 (same files as the app), unpacked
// by DirectWrite.
HRESULT Feed::LoadFonts() {
    ComPtr<IDWriteInMemoryFontFileLoader> loader;
    HRESULT hr = dwrite_->CreateInMemoryFontFileLoader(&loader);
    if (FAILED(hr)) return hr;
    dwrite_->RegisterFontFileLoader(loader.Get());
    ComPtr<IDWriteFontSetBuilder1> builder;
    hr = dwrite_->CreateFontSetBuilder(&builder);
    if (FAILED(hr)) return hr;
    for (int id : {IDR_GEIST, IDR_GEIST_MONO}) {
        HRSRC res = FindResourceW(module_, MAKEINTRESOURCEW(id), RT_RCDATA);
        HGLOBAL mem = res ? LoadResource(module_, res) : nullptr;
        const void* data = mem ? LockResource(mem) : nullptr;
        DWORD size = res ? SizeofResource(module_, res) : 0;
        if (!data || !size) continue;
        ComPtr<IDWriteFontFileStream> unpacked;
        if (FAILED(dwrite_->UnpackFontFile(DWRITE_CONTAINER_TYPE_WOFF2, data, size, &unpacked))) continue;
        UINT64 len = 0;
        unpacked->GetFileSize(&len);
        const void* frag = nullptr;
        void* fragCtx = nullptr;
        if (FAILED(unpacked->ReadFileFragment(&frag, 0, len, &fragCtx))) continue;
        ComPtr<IDWriteFontFile> file;
        // No owner: DirectWrite keeps its own copy.
        hr = loader->CreateInMemoryFontFileReference(dwrite_.Get(), frag, static_cast<UINT32>(len), nullptr, &file);
        unpacked->ReleaseFileFragment(fragCtx);
        if (SUCCEEDED(hr)) builder->AddFontFile(file.Get());
    }
    ComPtr<IDWriteFontSet> set;
    hr = builder->CreateFontSet(&set);
    if (FAILED(hr)) return hr;
    return dwrite_->CreateFontCollectionFromFontSet(set.Get(), &fonts_);
}

// ---------------------------------------------------------------- pipe

bool Feed::ReadAll(HANDLE pipe, void* buf, DWORD len) {
    BYTE* p = static_cast<BYTE*>(buf);
    while (len) {
        OVERLAPPED ov{};
        ov.hEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
        DWORD got = 0;
        BOOL ok = ReadFile(pipe, p, len, &got, &ov);
        if (!ok && GetLastError() == ERROR_IO_PENDING) {
            HANDLE w[] = {ov.hEvent, stopEvent_};
            if (WaitForMultipleObjects(2, w, FALSE, INFINITE) != WAIT_OBJECT_0) {
                CancelIoEx(pipe, &ov);
                GetOverlappedResult(pipe, &ov, &got, TRUE);
                CloseHandle(ov.hEvent);
                return false;
            }
            ok = GetOverlappedResult(pipe, &ov, &got, FALSE);
        }
        CloseHandle(ov.hEvent);
        if (!ok || got == 0) return false;
        p += got;
        len -= got;
    }
    return true;
}

bool Feed::WriteAll(HANDLE pipe, const void* buf, DWORD len) {
    OVERLAPPED ov{};
    ov.hEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    DWORD put = 0;
    BOOL ok = WriteFile(pipe, buf, len, &put, &ov);
    if (!ok && GetLastError() == ERROR_IO_PENDING) ok = GetOverlappedResult(pipe, &ov, &put, TRUE);
    CloseHandle(ov.hEvent);
    return ok && put == len;
}

void Feed::SendKind(HANDLE pipe, uint16_t kind, uint16_t flags) {
    Header h{};
    h.magic = kMagic;
    h.kind = kind;
    h.flags = flags;
    h.width = askW_;
    h.height = askH_;
    WriteAll(pipe, &h, sizeof h);
}

void Feed::PipeLoop() {
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    std::vector<BYTE> body;
    while (!stop_) {
        // SECURITY_IDENTIFICATION: the server may know who we are, never act as us.
        HANDLE pipe = CreateFileW(kPipeName, GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING,
                                  FILE_FLAG_OVERLAPPED | SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION, nullptr);
        if (pipe == INVALID_HANDLE_VALUE) {
            // Hyphn is not running (or busy): try again in a second.
            WaitForSingleObject(stopEvent_, GetLastError() == ERROR_PIPE_BUSY ? 200 : 1000);
            continue;
        }
        if (!ServerIsHyphn(pipe)) {
            Log("feed: pipe server is not Hyphn, refused");
            CloseHandle(pipe);
            WaitForSingleObject(stopEvent_, 3000);
            continue;
        }
        {
            std::lock_guard<std::mutex> l(stateLock_);
            state_.app = true;
        }
        Log("feed: pipe connected");
        waitKey_ = true;
        SendKind(pipe, kHello, hevcOk_ ? 1 : 0);
        Header h{};
        while (!stop_ && ReadAll(pipe, &h, sizeof h)) {
            if (h.magic != kMagic || h.len > kMaxPayload) break;
            body.resize(h.len);
            if (h.len && !ReadAll(pipe, body.data(), h.len)) break;
            if (h.kind == kState) OnState(body.data(), h.len);
            else if (h.kind == kVideo) OnVideo(pipe, h.codec, h.width, h.height, h.key != 0, h.pts_us, body.data(), h.len);
        }
        CloseHandle(pipe);
        DropDecoder();
        {
            std::lock_guard<std::mutex> l(stateLock_);
            state_.app = false;
            state_.live = false;
        }
        if (!stop_) WaitForSingleObject(stopEvent_, 500);
    }
    CoUninitialize();
}

// The pipe must belong to a real user account (the Hyphn app), never to a
// service: the app's ACL lets no service create a second instance, and this
// refuses a service that would have taken the name first.
bool Feed::ServerIsHyphn(HANDLE pipe) {
    PSID owner = nullptr;
    PSECURITY_DESCRIPTOR sd = nullptr;
    if (GetSecurityInfo(pipe, SE_KERNEL_OBJECT, OWNER_SECURITY_INFORMATION, &owner, nullptr, nullptr, nullptr, &sd) != ERROR_SUCCESS)
        return false;
    bool ok = false;
    LPWSTR text = nullptr;
    if (owner && ConvertSidToStringSidW(owner, &text)) {
        // S-1-5-21-…: a local or domain user (not Local Service, SYSTEM…).
        ok = wcsncmp(text, L"S-1-5-21-", 9) == 0;
        LocalFree(text);
    }
    LocalFree(sd);
    return ok;
}

void Feed::OnState(const BYTE* p, uint32_t len) {
    // The app sends at most 60 characters; anything longer is not from it.
    if (len < 4 || len > 4 + 256) return;
    WaitState s;
    s.app = true;
    s.live = p[0] != 0;
    s.phone = p[1] != 0;
    s.multi = p[2] != 0;
    s.style = p[3] > 1 ? 0 : p[3];
    if (len > 4) {
        int n = MultiByteToWideChar(CP_UTF8, 0, reinterpret_cast<const char*>(p + 4), static_cast<int>(len - 4), nullptr, 0);
        s.message.assign(static_cast<size_t>(n), L'\0');
        MultiByteToWideChar(CP_UTF8, 0, reinterpret_cast<const char*>(p + 4), static_cast<int>(len - 4), s.message.data(), n);
    }
    std::lock_guard<std::mutex> l(stateLock_);
    state_ = s;
}

// ---------------------------------------------------------------- decoder

bool Feed::CanDecode(const GUID& subtype) {
    MFT_REGISTER_TYPE_INFO in{MFMediaType_Video, subtype};
    IMFActivate** acts = nullptr;
    UINT32 n = 0;
    MFTEnumEx(MFT_CATEGORY_VIDEO_DECODER, MFT_ENUM_FLAG_SYNCMFT | MFT_ENUM_FLAG_LOCALMFT | MFT_ENUM_FLAG_SORTANDFILTER, &in, nullptr, &acts, &n);
    for (UINT32 i = 0; i < n; i++) acts[i]->Release();
    CoTaskMemFree(acts);
    return n > 0;
}

void Feed::DropDecoder() {
    if (mft_) {
        mft_->ProcessMessage(MFT_MESSAGE_NOTIFY_END_STREAMING, 0);
        mft_->ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER, 0);
    }
    mft_.Reset();
    decCodec_ = 0;
    decW_ = decH_ = 0;
}

HRESULT Feed::MakeDecoder(uint8_t codec, uint32_t w, uint32_t h) {
    DropDecoder();
    const GUID& sub = codec == kHevc ? MFVideoFormat_HEVC : MFVideoFormat_H264;
    MFT_REGISTER_TYPE_INFO in{MFMediaType_Video, sub};
    MFT_REGISTER_TYPE_INFO out{MFMediaType_Video, MFVideoFormat_NV12};
    IMFActivate** acts = nullptr;
    UINT32 n = 0;
    HRESULT hr = MFTEnumEx(MFT_CATEGORY_VIDEO_DECODER, MFT_ENUM_FLAG_SYNCMFT | MFT_ENUM_FLAG_LOCALMFT | MFT_ENUM_FLAG_SORTANDFILTER,
                           &in, &out, &acts, &n);
    if (SUCCEEDED(hr) && n == 0) hr = MF_E_TOPO_CODEC_NOT_FOUND;
    if (SUCCEEDED(hr)) hr = acts[0]->ActivateObject(IID_PPV_ARGS(&mft_));
    for (UINT32 i = 0; i < n; i++) acts[i]->Release();
    CoTaskMemFree(acts);
    Log("feed: decoder %s %ux%u -> 0x%08X", codec == kHevc ? "hevc" : "h264", w, h, hr);
    if (FAILED(hr)) return hr;

    ComPtr<IMFAttributes> attrs;
    if (SUCCEEDED(mft_->GetAttributes(&attrs))) {
        // No reordering delay: each frame comes out as soon as it is decoded.
        attrs->SetUINT32(MF_LOW_LATENCY, TRUE);
        UINT32 aware = 0;
        if (manager_ && SUCCEEDED(attrs->GetUINT32(MF_SA_D3D11_AWARE, &aware)) && aware) {
            mft_->ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER, reinterpret_cast<ULONG_PTR>(manager_.Get()));
        }
    }
    ComPtr<ICodecAPI> api;
    if (SUCCEEDED(mft_.As(&api))) {
        VARIANT v{};
        v.vt = VT_BOOL;
        v.boolVal = VARIANT_TRUE;
        api->SetValue(&CODECAPI_AVLowLatencyMode, &v);
    }
    ComPtr<IMFMediaType> type;
    hr = MFCreateMediaType(&type);
    if (FAILED(hr)) return hr;
    type->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
    type->SetGUID(MF_MT_SUBTYPE, sub);
    type->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
    if (w && h) MFSetAttributeSize(type.Get(), MF_MT_FRAME_SIZE, w, h);
    hr = mft_->SetInputType(0, type.Get(), 0);
    if (FAILED(hr)) return hr;
    hr = NegotiateOutput();
    if (FAILED(hr)) return hr;
    mft_->ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0);
    mft_->ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM, 0);
    decCodec_ = codec;
    decW_ = w;
    decH_ = h;
    return S_OK;
}

HRESULT Feed::NegotiateOutput() {
    for (DWORD i = 0;; i++) {
        ComPtr<IMFMediaType> t;
        HRESULT hr = mft_->GetOutputAvailableType(0, i, &t);
        if (FAILED(hr)) return hr;
        GUID sub{};
        t->GetGUID(MF_MT_SUBTYPE, &sub);
        if (sub != MFVideoFormat_NV12) continue;
        hr = mft_->SetOutputType(0, t.Get(), 0);
        if (FAILED(hr)) return hr;
        MFT_OUTPUT_STREAM_INFO info{};
        mft_->GetOutputStreamInfo(0, &info);
        providesSamples_ = (info.dwFlags & (MFT_OUTPUT_STREAM_PROVIDES_SAMPLES | MFT_OUTPUT_STREAM_CAN_PROVIDE_SAMPLES)) != 0;
        outBytes_ = info.cbSize;
        // The picture as shown: 1920×1080 out of a 1920×1088 surface, for example.
        UINT32 w = 0, h = 0;
        MFGetAttributeSize(t.Get(), MF_MT_FRAME_SIZE, &w, &h);
        RECT r{0, 0, static_cast<LONG>(w), static_cast<LONG>(h)};
        MFVideoArea area{};
        if (SUCCEEDED(t->GetBlob(MF_MT_MINIMUM_DISPLAY_APERTURE, reinterpret_cast<UINT8*>(&area), sizeof area, nullptr))) {
            r.left = area.OffsetX.value;
            r.top = area.OffsetY.value;
            r.right = r.left + area.Area.cx;
            r.bottom = r.top + area.Area.cy;
        }
        std::lock_guard<std::mutex> l(frameLock_);
        latestRect_ = r;
        vidW_ = static_cast<UINT32>(r.right - r.left);
        vidH_ = static_cast<UINT32>(r.bottom - r.top);
        return S_OK;
    }
}

void Feed::OnVideo(HANDLE pipe, uint8_t codec, uint32_t w, uint32_t h, bool key, int64_t pts, const BYTE* p, uint32_t len) {
    if (!mft_ || codec != decCodec_ || w != decW_ || h != decH_) {
        // After a failed decoder, wait a second before asking again (the app
        // switches the iPhone to H.264 when a reader cannot decode HEVC).
        const bool resting = GetTickCount64() - decoderFailTick_ < 1000;
        if (!key) {
            if (!resting) SendKind(pipe, kKey, 0);
            return;
        }
        if (resting) return;
        if (FAILED(MakeDecoder(codec, w, h))) {
            DropDecoder();
            decoderFailTick_ = GetTickCount64();
            return;
        }
        waitKey_ = false;
    }
    if (waitKey_ && !key) return;
    waitKey_ = false;
    ComPtr<IMFMediaBuffer> buf;
    ComPtr<IMFSample> sample;
    if (FAILED(MFCreateMemoryBuffer(len, &buf)) || FAILED(MFCreateSample(&sample))) return;
    BYTE* dst = nullptr;
    if (FAILED(buf->Lock(&dst, nullptr, nullptr))) return;
    memcpy(dst, p, len);
    buf->Unlock();
    buf->SetCurrentLength(len);
    sample->AddBuffer(buf.Get());
    sample->SetSampleTime(pts * 10);
    if (key) sample->SetUINT32(MFSampleExtension_CleanPoint, TRUE);
    HRESULT hr = mft_->ProcessInput(0, sample.Get(), 0);
    if (hr == MF_E_NOTACCEPTING) {
        Drain();
        hr = mft_->ProcessInput(0, sample.Get(), 0);
    }
    if (SUCCEEDED(hr)) hr = Drain();
    if (FAILED(hr)) {
        Log("feed: decode 0x%08X", hr);
        // Broken stream: start again from the next keyframe, asked at once.
        waitKey_ = true;
        mft_->ProcessMessage(MFT_MESSAGE_COMMAND_FLUSH, 0);
        SendKind(pipe, kKey, 0);
    }
}

HRESULT Feed::Drain() {
    for (;;) {
        MFT_OUTPUT_DATA_BUFFER ob{};
        ComPtr<IMFSample> own;
        if (!providesSamples_) {
            ComPtr<IMFMediaBuffer> b;
            if (FAILED(MFCreateSample(&own)) || FAILED(MFCreateMemoryBuffer(outBytes_ ? outBytes_ : 4u << 20, &b))) return E_OUTOFMEMORY;
            own->AddBuffer(b.Get());
            ob.pSample = own.Get();
        }
        DWORD status = 0;
        HRESULT hr = mft_->ProcessOutput(0, 1, &ob, &status);
        if (ob.pEvents) ob.pEvents->Release();
        if (hr == MF_E_TRANSFORM_NEED_MORE_INPUT) return S_OK;
        if (hr == MF_E_TRANSFORM_STREAM_CHANGE) {
            if (providesSamples_ && ob.pSample) ob.pSample->Release();
            hr = NegotiateOutput();
            if (FAILED(hr)) return hr;
            continue;
        }
        if (FAILED(hr)) {
            if (providesSamples_ && ob.pSample) ob.pSample->Release();
            return hr;
        }
        ComPtr<IMFSample> s;
        if (providesSamples_) s.Attach(ob.pSample);
        else s = own;
        if (s) Publish(s.Get());
    }
}

void Feed::Publish(IMFSample* sample) {
    std::lock_guard<std::mutex> l(frameLock_);
    latest_ = sample;
    latestTick_ = GetTickCount64();
    latestSeq_++;
    SetEvent(frameEvent_);
}

// ---------------------------------------------------------------- render

HRESULT Feed::EnsureTargets(UINT32 w, UINT32 h, Pixel fmt) {
    if (out_ && w == outW_ && h == outH_ && fmt == outFmt_) return S_OK;
    out_.Reset(); staging_.Reset(); wait_.Reset(); waitBitmap_.Reset();
    vpVideo_.Reset(); enVideo_.Reset(); vpWait_.Reset(); enWait_.Reset();
    vpVideoW_ = vpVideoH_ = vpWaitW_ = vpWaitH_ = 0;
    D3D11_TEXTURE2D_DESC d{};
    d.Width = w;
    d.Height = h;
    d.MipLevels = 1;
    d.ArraySize = 1;
    d.Format = fmt == Pixel::NV12 ? DXGI_FORMAT_NV12 : DXGI_FORMAT_B8G8R8A8_UNORM;
    d.SampleDesc.Count = 1;
    d.Usage = D3D11_USAGE_DEFAULT;
    d.BindFlags = D3D11_BIND_RENDER_TARGET;
    HRESULT hr = dev_->CreateTexture2D(&d, nullptr, &out_);
    if (FAILED(hr)) return hr;
    d.Usage = D3D11_USAGE_STAGING;
    d.BindFlags = 0;
    d.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
    hr = dev_->CreateTexture2D(&d, nullptr, &staging_);
    if (FAILED(hr)) return hr;
    // The waiting screen, drawn by Direct2D in BGRA.
    d.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    d.Usage = D3D11_USAGE_DEFAULT;
    d.CPUAccessFlags = 0;
    d.BindFlags = D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE;
    hr = dev_->CreateTexture2D(&d, nullptr, &wait_);
    if (FAILED(hr)) return hr;
    ComPtr<IDXGISurface> surface;
    hr = wait_.As(&surface);
    if (FAILED(hr)) return hr;
    D2D1_BITMAP_PROPERTIES1 props = D2D1::BitmapProperties1(D2D1_BITMAP_OPTIONS_TARGET | D2D1_BITMAP_OPTIONS_CANNOT_DRAW,
                                                            D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED));
    hr = dc_->CreateBitmapFromDxgiSurface(surface.Get(), &props, &waitBitmap_);
    if (FAILED(hr)) return hr;
    outW_ = w;
    outH_ = h;
    outFmt_ = fmt;
    return S_OK;
}

HRESULT Feed::EnsureProcessor(ComPtr<ID3D11VideoProcessor>& vp, ComPtr<ID3D11VideoProcessorEnumerator>& en, UINT32& keyW,
                              UINT32& keyH, UINT32 inW, UINT32 inH, UINT32 outW, UINT32 outH) {
    if (vp && keyW == inW && keyH == inH) return S_OK;
    vp.Reset();
    en.Reset();
    if (!vdev_) return E_NOINTERFACE;
    D3D11_VIDEO_PROCESSOR_CONTENT_DESC c{};
    c.InputFrameFormat = D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE;
    c.InputWidth = inW;
    c.InputHeight = inH;
    c.OutputWidth = outW;
    c.OutputHeight = outH;
    c.InputFrameRate = {60, 1};
    c.OutputFrameRate = {60, 1};
    c.Usage = D3D11_VIDEO_USAGE_OPTIMAL_SPEED;
    HRESULT hr = vdev_->CreateVideoProcessorEnumerator(&c, &en);
    if (FAILED(hr)) return hr;
    hr = vdev_->CreateVideoProcessor(en.Get(), 0, &vp);
    if (FAILED(hr)) return hr;
    // No automatic enhancement: the picture stays as the iPhone made it.
    vctx_->VideoProcessorSetStreamAutoProcessingMode(vp.Get(), 0, FALSE);
    vctx_->VideoProcessorSetStreamFrameFormat(vp.Get(), 0, D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE);
    keyW = inW;
    keyH = inH;
    return S_OK;
}

HRESULT Feed::Blit(ID3D11VideoProcessor* vp, ID3D11VideoProcessorEnumerator* en, ID3D11Texture2D* in, UINT slice, RECT src,
                   bool rgbIn, ID3D11Texture2D* out, UINT32 outW, UINT32 outH, Pixel fmt, bool letterbox) {
    D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC ivd{};
    ivd.ViewDimension = D3D11_VPIV_DIMENSION_TEXTURE2D;
    ivd.Texture2D.ArraySlice = slice;
    ComPtr<ID3D11VideoProcessorInputView> iv;
    HRESULT hr = vdev_->CreateVideoProcessorInputView(in, en, &ivd, &iv);
    if (FAILED(hr)) return hr;
    D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC ovd{};
    ovd.ViewDimension = D3D11_VPOV_DIMENSION_TEXTURE2D;
    ComPtr<ID3D11VideoProcessorOutputView> ov;
    hr = vdev_->CreateVideoProcessorOutputView(out, en, &ovd, &ov);
    if (FAILED(hr)) return hr;

    RECT full{0, 0, static_cast<LONG>(outW), static_cast<LONG>(outH)};
    RECT dst = full;
    if (letterbox) {
        // Keep the iPhone proportions (a portrait picture gets black sides).
        double sw = src.right - src.left, sh = src.bottom - src.top;
        double scale = std::min(outW / sw, outH / sh);
        LONG w = static_cast<LONG>(sw * scale) & ~1, h = static_cast<LONG>(sh * scale) & ~1;
        dst.left = ((static_cast<LONG>(outW) - w) / 2) & ~1;
        dst.top = ((static_cast<LONG>(outH) - h) / 2) & ~1;
        dst.right = dst.left + w;
        dst.bottom = dst.top + h;
    }
    D3D11_VIDEO_PROCESSOR_COLOR_SPACE inCs{};
    inCs.RGB_Range = 0;  // full range RGB
    inCs.YCbCr_Matrix = 1;  // BT.709
    inCs.Nominal_Range = rgbIn ? D3D11_VIDEO_PROCESSOR_NOMINAL_RANGE_0_255 : D3D11_VIDEO_PROCESSOR_NOMINAL_RANGE_16_235;
    D3D11_VIDEO_PROCESSOR_COLOR_SPACE outCs{};
    outCs.RGB_Range = 0;
    outCs.YCbCr_Matrix = 1;
    outCs.Nominal_Range = fmt == Pixel::NV12 ? D3D11_VIDEO_PROCESSOR_NOMINAL_RANGE_16_235 : D3D11_VIDEO_PROCESSOR_NOMINAL_RANGE_0_255;
    vctx_->VideoProcessorSetStreamColorSpace(vp, 0, &inCs);
    vctx_->VideoProcessorSetOutputColorSpace(vp, &outCs);
    vctx_->VideoProcessorSetStreamSourceRect(vp, 0, TRUE, &src);
    vctx_->VideoProcessorSetStreamDestRect(vp, 0, TRUE, &dst);
    vctx_->VideoProcessorSetOutputTargetRect(vp, TRUE, &full);
    D3D11_VIDEO_COLOR black{};
    black.RGBA = {0.f, 0.f, 0.f, 1.f};
    vctx_->VideoProcessorSetOutputBackgroundColor(vp, FALSE, &black);
    D3D11_VIDEO_PROCESSOR_STREAM st{};
    st.Enable = TRUE;
    st.pInputSurface = iv.Get();
    return vctx_->VideoProcessorBlt(vp, ov.Get(), 0, 1, &st);
}

HRESULT Feed::TextureOf(IMFSample* s, ComPtr<ID3D11Texture2D>& tex, UINT& slice) {
    ComPtr<IMFMediaBuffer> buf;
    HRESULT hr = s->GetBufferByIndex(0, &buf);
    if (FAILED(hr)) return hr;
    ComPtr<IMFDXGIBuffer> dxgi;
    if (SUCCEEDED(buf.As(&dxgi))) {
        hr = dxgi->GetResource(IID_PPV_ARGS(&tex));
        if (SUCCEEDED(hr)) hr = dxgi->GetSubresourceIndex(&slice);
        return hr;
    }
    // Software decoder: copy the NV12 picture to the card.
    UINT32 w = 0, h = 0;
    RECT r;
    {
        std::lock_guard<std::mutex> l(frameLock_);
        r = latestRect_;
    }
    w = static_cast<UINT32>(r.right) & ~1u;
    h = static_cast<UINT32>(r.bottom) & ~1u;
    if (!w || !h) return E_FAIL;
    if (!uploaded_ || uploadW_ != w || uploadH_ != h) {
        D3D11_TEXTURE2D_DESC d{};
        d.Width = w;
        d.Height = h;
        d.MipLevels = 1;
        d.ArraySize = 1;
        d.Format = DXGI_FORMAT_NV12;
        d.SampleDesc.Count = 1;
        d.Usage = D3D11_USAGE_STAGING;
        d.CPUAccessFlags = D3D11_CPU_ACCESS_WRITE;
        hr = dev_->CreateTexture2D(&d, nullptr, &upload_);
        if (FAILED(hr)) return hr;
        d.Usage = D3D11_USAGE_DEFAULT;
        d.CPUAccessFlags = 0;
        d.BindFlags = D3D11_BIND_SHADER_RESOURCE;
        hr = dev_->CreateTexture2D(&d, nullptr, &uploaded_);
        if (FAILED(hr)) return hr;
        uploadW_ = w;
        uploadH_ = h;
    }
    BYTE* src = nullptr;
    LONG pitch = 0;
    ComPtr<IMF2DBuffer> b2;
    bool locked2d = SUCCEEDED(buf.As(&b2)) && SUCCEEDED(b2->Lock2D(&src, &pitch));
    DWORD cur = 0;
    if (!locked2d) {
        if (FAILED(buf->Lock(&src, nullptr, &cur))) return E_FAIL;
        pitch = static_cast<LONG>(w);
    }
    D3D11_MAPPED_SUBRESOURCE m{};
    hr = ctx_->Map(upload_.Get(), 0, D3D11_MAP_WRITE, 0, &m);
    if (SUCCEEDED(hr)) {
        // The decoder's surface height may be padded (1088 for 1080).
        UINT32 planeRows = static_cast<UINT32>(r.bottom);
        if (!locked2d && cur >= static_cast<DWORD>(pitch) * 3 / 2) planeRows = std::max(planeRows, static_cast<UINT32>(cur / pitch * 2 / 3));
        BYTE* d = static_cast<BYTE*>(m.pData);
        for (UINT32 y = 0; y < h; y++) memcpy(d + y * m.RowPitch, src + y * pitch, w);
        BYTE* uv = d + m.RowPitch * h;
        const BYTE* suv = src + static_cast<size_t>(pitch) * planeRows;
        for (UINT32 y = 0; y < h / 2; y++) memcpy(uv + y * m.RowPitch, suv + y * pitch, w);
        ctx_->Unmap(upload_.Get(), 0);
        ctx_->CopyResource(uploaded_.Get(), upload_.Get());
    }
    if (locked2d) b2->Unlock2D();
    else buf->Unlock();
    tex = uploaded_;
    slice = 0;
    return hr;
}

HRESULT Feed::Readback(ID3D11Texture2D* tex, BYTE* dst, LONG pitch, UINT32 w, UINT32 h, Pixel fmt) {
    ctx_->CopyResource(staging_.Get(), tex);
    D3D11_MAPPED_SUBRESOURCE m{};
    HRESULT hr = ctx_->Map(staging_.Get(), 0, D3D11_MAP_READ, 0, &m);
    if (FAILED(hr)) return hr;
    const BYTE* s = static_cast<const BYTE*>(m.pData);
    UINT32 rowBytes = fmt == Pixel::NV12 ? w : w * 4;
    for (UINT32 y = 0; y < h; y++) memcpy(dst + static_cast<ptrdiff_t>(y) * pitch, s + y * m.RowPitch, rowBytes);
    if (fmt == Pixel::NV12) {
        const BYTE* suv = s + static_cast<size_t>(m.RowPitch) * h;
        BYTE* duv = dst + static_cast<ptrdiff_t>(pitch) * h;
        for (UINT32 y = 0; y < h / 2; y++) memcpy(duv + static_cast<ptrdiff_t>(y) * pitch, suv + y * m.RowPitch, w);
    }
    ctx_->Unmap(staging_.Get(), 0);
    return S_OK;
}

bool Feed::HasLiveVideo() {
    bool live = false;
    {
        std::lock_guard<std::mutex> l(stateLock_);
        live = state_.app && state_.live;
    }
    std::lock_guard<std::mutex> l(frameLock_);
    return live && latest_ && GetTickCount64() - latestTick_ < kStaleMs;
}

HRESULT Feed::Fill(BYTE* dst, LONG pitch, UINT32 w, UINT32 h, Pixel fmt, bool* video) {
    if (video) *video = false;
    if (!dst || w < 2 || h < 2) return E_INVALIDARG;
    if (!started_) {
        // No graphics device: a black picture rather than none.
        for (UINT32 y = 0; y < h; y++) memset(dst + static_cast<ptrdiff_t>(y) * pitch, fmt == Pixel::NV12 ? 16 : 0, fmt == Pixel::NV12 ? w : w * 4);
        if (fmt == Pixel::NV12)
            for (UINT32 y = 0; y < h / 2; y++) memset(dst + static_cast<ptrdiff_t>(h + y) * pitch, 128, w);
        return S_OK;
    }
    std::lock_guard<std::mutex> rl(renderLock_);
    HRESULT hr = EnsureTargets(w, h, fmt);
    if (FAILED(hr)) return hr;
    WaitState st;
    {
        std::lock_guard<std::mutex> l(stateLock_);
        st = state_;
    }
    ComPtr<IMFSample> sample;
    RECT src{};
    ULONGLONG tick = 0;
    {
        std::lock_guard<std::mutex> l(frameLock_);
        sample = latest_;
        src = latestRect_;
        tick = latestTick_;
    }
    bool fresh = sample && GetTickCount64() - tick < kStaleMs;
    bool showVideo = st.app && st.live && fresh && src.right > src.left && src.bottom > src.top;
    if (showVideo) {
        ComPtr<ID3D11Texture2D> tex;
        UINT slice = 0;
        D3D11_TEXTURE2D_DESC td{};
        hr = TextureOf(sample.Get(), tex, slice);
        if (SUCCEEDED(hr)) {
            tex->GetDesc(&td);
            hr = EnsureProcessor(vpVideo_, enVideo_, vpVideoW_, vpVideoH_, td.Width, td.Height, w, h);
        }
        if (SUCCEEDED(hr)) hr = Blit(vpVideo_.Get(), enVideo_.Get(), tex.Get(), slice, src, false, out_.Get(), w, h, fmt, true);
        if (SUCCEEDED(hr)) {
            if (video) *video = true;
            return Readback(out_.Get(), dst, pitch, w, h, fmt);
        }
        // Could not show this picture: the waiting screen instead.
    }
    hr = DrawWait(st, st.app && st.live);
    if (FAILED(hr)) return hr;
    if (fmt == Pixel::BGRA) return Readback(wait_.Get(), dst, pitch, w, h, fmt);
    hr = EnsureProcessor(vpWait_, enWait_, vpWaitW_, vpWaitH_, w, h, w, h);
    if (SUCCEEDED(hr)) {
        RECT all{0, 0, static_cast<LONG>(w), static_cast<LONG>(h)};
        hr = Blit(vpWait_.Get(), enWait_.Get(), wait_.Get(), 0, all, true, out_.Get(), w, h, fmt, false);
    }
    if (FAILED(hr)) return hr;
    return Readback(out_.Get(), dst, pitch, w, h, fmt);
}

// The waiting screen: same design as the app (ui/app.css, .wait2). Drifting
// coral, lime and cyan glows, the Hyphn mark breathing with a light running
// along its bar, the message in Geist, languages taking turns.
HRESULT Feed::DrawWait(const WaitState& st, bool videoExpected) {
    LARGE_INTEGER now;
    QueryPerformanceCounter(&now);
    const double t = static_cast<double>(now.QuadPart - qpcStart_.QuadPart) / qpcFreq_.QuadPart;
    const float W = static_cast<float>(outW_), H = static_cast<float>(outH_);
    dc_->SetTarget(waitBitmap_.Get());
    dc_->BeginDraw();
    dc_->SetTransform(mirrorWait_ ? D2D1::Matrix3x2F::Scale(-1.f, 1.f, D2D1::Point2F(W / 2, H / 2)) : D2D1::Matrix3x2F::Identity());
    dc_->Clear(Rgba(0x05070A));

    auto glow = [&](float cx, float cy, float r, uint32_t rgb, float a) {
        D2D1_GRADIENT_STOP stops[] = {{0.f, Rgba(rgb, a)}, {0.72f, Rgba(rgb, 0.f)}, {1.f, Rgba(rgb, 0.f)}};
        ComPtr<ID2D1GradientStopCollection> sc;
        ComPtr<ID2D1RadialGradientBrush> b;
        if (FAILED(dc_->CreateGradientStopCollection(stops, 3, &sc))) return;
        if (FAILED(dc_->CreateRadialGradientBrush(D2D1::RadialGradientBrushProperties(D2D1::Point2F(cx, cy), {}, r, r), sc.Get(), &b))) return;
        dc_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(cx, cy), r, r), b.Get());
    };
    if (st.style == 0) {
        const float s = std::max(W, H);
        auto wave = [&](double period, double phase) { return static_cast<float>(std::sin(t * 2 * 3.14159265 / period + phase)); };
        glow(W * (0.30f + 0.10f * wave(26, 0)), H * (0.32f + 0.10f * wave(31, 1)), s * 0.42f * (1 + 0.08f * wave(22, 2)), 0xFF7A66, 0.42f);
        glow(W * (0.74f - 0.12f * wave(31, 3)), H * (0.46f + 0.08f * wave(24, 4)), s * 0.40f, 0xB9F25A, 0.28f);
        glow(W * (0.50f + 0.08f * wave(23, 5)), H * (0.86f - 0.12f * wave(27, 6)), s * 0.38f * (1 + 0.1f * wave(19, 1)), 0x5FD4F4, 0.26f);
    } else {
        glow(W * 0.5f, H * 0.45f, std::max(W, H) * 0.6f, 0x10141B, 1.f);
    }
    {
        // Vignette.
        D2D1_GRADIENT_STOP stops[] = {{0.f, Rgba(0x05070A, 0.f)}, {0.45f, Rgba(0x05070A, 0.f)}, {1.f, Rgba(0x05070A, 0.85f)}};
        ComPtr<ID2D1GradientStopCollection> sc;
        ComPtr<ID2D1RadialGradientBrush> b;
        if (SUCCEEDED(dc_->CreateGradientStopCollection(stops, 3, &sc)) &&
            SUCCEEDED(dc_->CreateRadialGradientBrush(D2D1::RadialGradientBrushProperties(D2D1::Point2F(W / 2, H / 2), {}, W * 0.62f, H * 0.62f), sc.Get(), &b)))
            dc_->FillRectangle(D2D1::RectF(0, 0, W, H), b.Get());
    }

    // The mark, a little above the middle.
    const float dot = std::clamp(H * 0.026f, 10.f, 30.f) / 2;
    const float barW = std::clamp(H * 0.064f, 26.f, 72.f), barH = std::clamp(H * 0.009f, 4.f, 9.f);
    const float textSize = std::min(H * 0.095f, W * 0.075f);
    const float cy = H * 0.5f - textSize * 0.95f;
    const float cx = W * 0.5f;
    ComPtr<ID2D1SolidColorBrush> solid;
    dc_->CreateSolidColorBrush(Rgba(0xF1F3F6), &solid);
    auto breathe = [&](double phase) { return static_cast<float>(0.93 + 0.07 * std::sin(t * 2 * 3.14159265 / 3.2 + phase)); };
    const float left = cx - barW / 2 - dot + 2, right = cx + barW / 2 + dot - 2;
    if (solid) {
        float k = breathe(0);
        dc_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(left, cy), dot * k, dot * k), solid.Get());
        k = breathe(3.14159265);
        dc_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(right, cy), dot * k, dot * k), solid.Get());
    }
    D2D1_ROUNDED_RECT bar = D2D1::RoundedRect(D2D1::RectF(cx - barW / 2, cy - barH / 2, cx + barW / 2, cy + barH / 2), barH / 2, barH / 2);
    ComPtr<ID2D1SolidColorBrush> barBase;
    if (SUCCEEDED(dc_->CreateSolidColorBrush(Rgba(0x3F5A1A), &barBase))) dc_->FillRoundedRectangle(bar, barBase.Get());
    {
        const double run = std::fmod(t, 2.4) / 2.4;
        const float x0 = cx - barW / 2 - barW + static_cast<float>(Smooth(run)) * barW * 2;
        D2D1_GRADIENT_STOP stops[] = {{0.f, Rgba(0xB9F25A, 0.f)}, {0.45f, Rgba(0xE7FFB8)}, {0.55f, Rgba(0xB9F25A)}, {1.f, Rgba(0xB9F25A, 0.f)}};
        ComPtr<ID2D1GradientStopCollection> sc;
        ComPtr<ID2D1LinearGradientBrush> b;
        if (SUCCEEDED(dc_->CreateGradientStopCollection(stops, 4, &sc)) &&
            SUCCEEDED(dc_->CreateLinearGradientBrush(D2D1::LinearGradientBrushProperties(D2D1::Point2F(x0, cy), D2D1::Point2F(x0 + barW, cy)), sc.Get(), &b)))
            dc_->FillRoundedRectangle(bar, b.Get());
    }

    // The message.
    const bool cycle = st.multi && st.message == kLangs[0];
    std::wstring text = st.message;
    float alpha = 1.f, dy = 0.f;
    if (cycle) {
        const int i = static_cast<int>(t / kLangSeconds) % kLangCount;
        text = kLangs[i];
        const double ph = std::fmod(t, kLangSeconds) / kLangSeconds;
        const double in = Smooth(ph / 0.2), out = 1 - Smooth((ph - 0.8) / 0.2);
        alpha = static_cast<float>(std::min(in, out));
        dy = static_cast<float>((ph < 0.5 ? 1 - in : -(1 - out)) * textSize * 0.3);
    }
    IDWriteFontCollection* family = fonts_ ? fonts_.Get() : nullptr;
    ComPtr<IDWriteTextFormat> fmt;
    HRESULT hr = dwrite_->CreateTextFormat(family ? L"Geist" : L"Segoe UI", family, DWRITE_FONT_WEIGHT_SEMI_BOLD, DWRITE_FONT_STYLE_NORMAL,
                                           DWRITE_FONT_STRETCH_NORMAL, textSize, L"fr-fr", &fmt);
    if (SUCCEEDED(hr)) {
        fmt->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_CENTER);
        fmt->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_CENTER);
        ComPtr<IDWriteTextLayout> layout;
        const float boxW = W * 0.88f, boxH = textSize * 2.6f;
        if (SUCCEEDED(dwrite_->CreateTextLayout(text.c_str(), static_cast<UINT32>(text.size()), fmt.Get(), boxW, boxH, &layout))) {
            ComPtr<IDWriteTextLayout1> l1;
            if (SUCCEEDED(layout.As(&l1)))
                l1->SetCharacterSpacing(0, -0.05f * textSize, 0, DWRITE_TEXT_RANGE{0, static_cast<UINT32>(text.size())});
            const float top = H * 0.5f - boxH / 2 + textSize * 0.25f + dy;
            D2D1_GRADIENT_STOP stops[] = {{0.f, Rgba(0xFFFFFF, alpha)}, {1.f, Rgba(0xC3CBD6, alpha)}};
            ComPtr<ID2D1GradientStopCollection> sc;
            ComPtr<ID2D1LinearGradientBrush> b;
            if (SUCCEEDED(dc_->CreateGradientStopCollection(stops, 2, &sc)) &&
                SUCCEEDED(dc_->CreateLinearGradientBrush(
                    D2D1::LinearGradientBrushProperties(D2D1::Point2F(0, top + boxH * 0.3f), D2D1::Point2F(0, top + boxH * 0.7f)), sc.Get(), &b)))
                dc_->DrawTextLayout(D2D1::Point2F((W - boxW) / 2, top), layout.Get(), b.Get(), D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);
        }
    }

    // The status line, small and spaced out.
    const wchar_t* sub = !st.app ? L"OUVRE HYPHN SUR LE PC" : !st.phone ? L"IPHONE HORS LIGNE" : videoExpected ? L"L’IMAGE ARRIVE…" : nullptr;
    if (sub) {
        const float subSize = std::clamp(H * 0.019f, 10.f, 18.f);
        ComPtr<IDWriteTextFormat> sf;
        if (SUCCEEDED(dwrite_->CreateTextFormat(family ? L"Geist Mono" : L"Consolas", family, DWRITE_FONT_WEIGHT_MEDIUM, DWRITE_FONT_STYLE_NORMAL,
                                                DWRITE_FONT_STRETCH_NORMAL, subSize, L"fr-fr", &sf))) {
            sf->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_CENTER);
            ComPtr<IDWriteTextLayout> layout;
            UINT32 n = static_cast<UINT32>(wcslen(sub));
            if (SUCCEEDED(dwrite_->CreateTextLayout(sub, n, sf.Get(), W, subSize * 2, &layout))) {
                ComPtr<IDWriteTextLayout1> l1;
                if (SUCCEEDED(layout.As(&l1))) l1->SetCharacterSpacing(0, 0.22f * subSize, 0, DWRITE_TEXT_RANGE{0, n});
                ComPtr<ID2D1SolidColorBrush> b;
                if (SUCCEEDED(dc_->CreateSolidColorBrush(Rgba(0xF1F3F6, 0.55f), &b)))
                    dc_->DrawTextLayout(D2D1::Point2F(0, H * 0.5f + textSize * 1.25f), layout.Get(), b.Get());
            }
        }
    }
    hr = dc_->EndDraw();
    dc_->SetTarget(nullptr);
    return hr;
}

}  // namespace hyphn
