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
#include <iterator>

#include "hyphn_pipe.h"
#include "resource.h"

namespace hyphn {

namespace {

constexpr ULONGLONG kStaleMs = 1500;  // no picture for this long: waiting screen
constexpr uint32_t kMaxPayload = 16u << 20;

// Same list and order as LANGS in apps/desktop/ui/app.js. `whole`: joined
// letters (Arabic, Hindi) are shown at once, not letter by letter.
struct Lang {
    const wchar_t* text;
    const wchar_t* locale;
    bool whole;
};
const Lang kLangs[] = {
    {L"Je reviens bientôt", L"fr-fr", false}, {L"Be right back", L"en-us", false},
    {L"Vuelvo enseguida", L"es-es", false},   {L"Bin gleich zurück", L"de-de", false},
    {L"Torno subito", L"it-it", false},       {L"Volto já", L"pt-pt", false},
    {L"Ben zo terug", L"nl-nl", false},       {L"Zaraz wracam", L"pl-pl", false},
    {L"Hemen dönüyorum", L"tr-tr", false},    {L"Скоро вернусь", L"ru-ru", false},
    {L"Скоро повернуся", L"uk-ua", false},    {L"سأعود قريبًا", L"ar-sa", true},
    {L"थोड़ी देर में वापस", L"hi-in", true},  {L"马上回来", L"zh-cn", false},
    {L"すぐ戻ります", L"ja-jp", false},       {L"곧 돌아올게요", L"ko-kr", false},
    {L"Quay lại ngay", L"vi-vn", false},      {L"Segera kembali", L"id-id", false},
};
constexpr int kLangCount = static_cast<int>(std::size(kLangs));
constexpr double kLangSeconds = 2.6;
constexpr double kPi = 3.14159265358979;

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

// The waiting screen: same design as the app (ui/app.css, .wait2): a neon
// Hyphn sign hanging on two wires, light rays and dust (Animé only), packets
// running along the bar both ways, the message letter by letter in Geist.
// Sizes follow the mock-up drawn at 1280×720 (`s` = 1 there).
HRESULT Feed::DrawWait(const WaitState& st, bool /*videoExpected*/) {
    LARGE_INTEGER now;
    QueryPerformanceCounter(&now);
    const double t = static_cast<double>(now.QuadPart - qpcStart_.QuadPart) / qpcFreq_.QuadPart;
    const float W = static_cast<float>(outW_), H = static_cast<float>(outH_);
    const float s = H / 720.f, cx = W / 2;
    const bool animated = st.style == 0;
    dc_->SetTarget(waitBitmap_.Get());
    dc_->BeginDraw();
    dc_->SetTransform(D2D1::Matrix3x2F::Identity());
    dc_->Clear(Rgba(0x05070A));

    auto stops = [&](std::initializer_list<D2D1_GRADIENT_STOP> list) {
        ComPtr<ID2D1GradientStopCollection> sc;
        dc_->CreateGradientStopCollection(list.begin(), static_cast<UINT32>(list.size()), &sc);
        return sc;
    };
    auto linear = [&](D2D1_POINT_2F a, D2D1_POINT_2F b, std::initializer_list<D2D1_GRADIENT_STOP> list) {
        ComPtr<ID2D1LinearGradientBrush> br;
        if (auto sc = stops(list)) dc_->CreateLinearGradientBrush(D2D1::LinearGradientBrushProperties(a, b), sc.Get(), &br);
        return br;
    };
    auto radial = [&](float x, float y, float rx, float ry, std::initializer_list<D2D1_GRADIENT_STOP> list) {
        ComPtr<ID2D1RadialGradientBrush> br;
        if (auto sc = stops(list)) dc_->CreateRadialGradientBrush(D2D1::RadialGradientBrushProperties(D2D1::Point2F(x, y), {}, rx, ry), sc.Get(), &br);
        if (br) dc_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(x, y), rx, ry), br.Get());
    };
    auto solid = [&](uint32_t rgb, float a) {
        ComPtr<ID2D1SolidColorBrush> br;
        dc_->CreateSolidColorBrush(Rgba(rgb, a), &br);
        return br;
    };
    auto frac = [](double x) { return x - std::floor(x); };

    // Ground: a touch lighter at the top and the bottom.
    if (auto bg = linear({0, 0}, {0, H}, {{0.f, Rgba(0x07090D)}, {0.55f, Rgba(0x05070A)}, {1.f, Rgba(0x0A0C10)}}))
        dc_->FillRectangle(D2D1::RectF(0, 0, W, H), bg.Get());

    ComPtr<ID2D1Factory> factory;
    dc_->GetFactory(&factory);
    if (animated) {
        // Rays from a lamp above the screen, swaying slowly (conic gradient in CSS).
        const float sway = static_cast<float>(4 * std::sin(t * 2 * kPi / 14 - kPi / 2));
        const float glow = static_cast<float>(0.9 + 0.1 * std::sin(t * 2 * kPi / 14 - kPi / 2));
        const D2D1_POINT_2F apex = D2D1::Point2F(cx, -122 * s);
        struct Ray { float deg, half; uint32_t rgb; float a; };
        const Ray rays[] = {{168, 6, 0xFFAA8C, 0.10f}, {180, 6, 0xFFC8AA, 0.07f}, {191, 5, 0xB9F25A, 0.05f}, {201, 6, 0xFFAA8C, 0.09f}};
        const float len = H * 1.5f;
        for (const Ray& r : rays) {
            // Three nested wedges: bright in the middle, soft on the sides.
            for (int k = 1; k <= 3; ++k) {
                const float half = r.half * k / 3.f;
                auto dir = [&](float deg) {
                    const double a = (deg + sway) * kPi / 180;
                    return D2D1::Point2F(apex.x + len * static_cast<float>(std::sin(a)), apex.y - len * static_cast<float>(std::cos(a)));
                };
                ComPtr<ID2D1PathGeometry> g;
                ComPtr<ID2D1GeometrySink> sink;
                if (!factory || FAILED(factory->CreatePathGeometry(&g)) || FAILED(g->Open(&sink))) continue;
                sink->BeginFigure(apex, D2D1_FIGURE_BEGIN_FILLED);
                sink->AddLine(dir(r.deg - half));
                sink->AddLine(dir(r.deg + half));
                sink->EndFigure(D2D1_FIGURE_END_CLOSED);
                sink->Close();
                const float a = r.a / 3 * glow;
                if (auto br = linear(apex, D2D1::Point2F(apex.x, apex.y + len), {{0.f, Rgba(r.rgb, a)}, {0.75f, Rgba(r.rgb, a * 0.4f)}, {1.f, Rgba(r.rgb, 0.f)}}))
                    dc_->FillGeometry(g.Get(), br.Get());
            }
        }
        radial(cx, 120 * s, 450 * s, 320 * s, {{0.f, Rgba(0xFF8C6E, 0.16f)}, {1.f, Rgba(0xFF8C6E, 0.f)}});

        // Dust drifting up through the light.
        struct Mote { float x, y, r; double off; };
        const Mote dust[] = {{0.33f, 0.58f, 1.5f, 0}, {0.44f, 0.53f, 1.f, 3}, {0.55f, 0.64f, 2.f, 6}, {0.64f, 0.56f, 1.f, 9},
                             {0.39f, 0.42f, 2.5f, 4.5}, {0.59f, 0.44f, 1.5f, 7.5}, {0.50f, 0.69f, 1.f, 1.5}};
        for (const Mote& m : dust) {
            const double p = frac((t + m.off) / 12);
            const float a = static_cast<float>(std::min({1.0, p / 0.15, (1 - p) / 0.15}));
            const float x = W * m.x + static_cast<float>(p) * 60 * s, y = H * m.y - static_cast<float>(p) * 220 * s;
            if (auto br = solid(0xFFE9DE, a)) dc_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(x, y), m.r * s, m.r * s), br.Get());
        }
    }

    // Light under the sign, and the line of the floor.
    radial(cx, 390 * s, 310 * s, 60 * s, {{0.f, Rgba(0xFF9678, 0.22f)}, {0.6f, Rgba(0xB9F25A, 0.06f)}, {1.f, Rgba(0xB9F25A, 0.f)}});
    if (auto br = linear({0, 0}, {W, 0}, {{0.f, Rgba(0xFFC8B4, 0.f)}, {0.5f, Rgba(0xFFC8B4, 0.25f)}, {1.f, Rgba(0xFFC8B4, 0.f)}}))
        dc_->FillRectangle(D2D1::RectF(0, 390 * s, W, 390 * s + std::max(1.f, s)), br.Get());

    // The sign, swinging a little on its wires; it flickers now and then.
    const float swing = animated ? static_cast<float>(-1.2 * std::cos(t * 2 * kPi / 7)) : 0.f;
    float hum = 1.f;
    if (animated) {
        const double p = frac(t / 6);
        if (p >= 0.47 && p < 0.48) hum = static_cast<float>(1 - (p - 0.47) / 0.01 * 0.45);
        else if (p >= 0.48 && p < 0.49) hum = static_cast<float>(0.55 + (p - 0.48) / 0.01 * 0.45);
        else if (p >= 0.49 && p < 0.51) hum = static_cast<float>(1 - (p - 0.49) / 0.02 * 0.3);
        else if (p >= 0.51 && p < 0.52) hum = static_cast<float>(0.7 + (p - 0.51) / 0.01 * 0.3);
    }
    dc_->SetTransform(D2D1::Matrix3x2F::Rotation(swing, D2D1::Point2F(cx, 0)));
    for (float wx : {-86 * s, 86 * s})
        if (auto br = linear({0, 0}, {0, 186 * s}, {{0.f, Rgba(0xF1F3F6, 0.f)}, {1.f, Rgba(0xF1F3F6, 0.35f)}}))
            dc_->FillRectangle(D2D1::RectF(cx + wx, 0, cx + wx + std::max(1.f, s), 186 * s), br.Get());

    const float ty = 214 * s;
    // Neon glow faked with wider, fainter strokes under the tube.
    struct Halo { float extra, a; };
    const Halo halos[] = {{44, 0.07f}, {24, 0.14f}, {12, 0.28f}, {5, 0.5f}};
    auto ring = [&](float x, uint32_t core, uint32_t glow) {
        const D2D1_ELLIPSE e = D2D1::Ellipse(D2D1::Point2F(x, ty), 25.5f * s, 25.5f * s);
        for (const Halo& h : halos)
            if (auto br = solid(glow, h.a * hum)) dc_->DrawEllipse(e, br.Get(), (5 + h.extra) * s);
        if (auto br = solid(core, hum)) dc_->DrawEllipse(e, br.Get(), 5 * s);
    };
    const float barL = cx - 116 * s, barR = cx + 116 * s, barH = 9 * s;
    for (const Halo& h : halos) {
        const float e = h.extra * s / 2;
        if (auto br = solid(0xFFFFFF, h.a * 0.8f * hum))
            dc_->FillRoundedRectangle(D2D1::RoundedRect(D2D1::RectF(barL - e, ty - barH / 2 - e, barR + e, ty + barH / 2 + e), barH / 2 + e, barH / 2 + e), br.Get());
    }
    if (auto br = solid(0xFFFFFF, hum))
        dc_->FillRoundedRectangle(D2D1::RoundedRect(D2D1::RectF(barL, ty - barH / 2, barR, ty + barH / 2), barH / 2, barH / 2), br.Get());
    ring(cx - 142 * s, 0xFFD9CF, 0xFF7A66);
    ring(cx + 142 * s, 0xD9F3FF, 0x5AC8FA);

    // Packets between the PC and the iPhone: coral and lime one way, cyan the other.
    struct Packet { bool toLeft; float w; uint32_t rgb, glow; double dur, off; };
    const Packet packets[] = {{false, 22, 0xFF7A66, 0xFF7A66, 1.9, 0}, {false, 12, 0xFF9A88, 0xFF7A66, 1.4, 0.8},
                              {false, 8, 0xB9F25A, 0xB9F25A, 2.6, 1.7},  {true, 26, 0x5AC8FA, 0x5AC8FA, 2.2, 0.4},
                              {true, 10, 0x9BE1FF, 0x5AC8FA, 1.6, 1.1},  {true, 16, 0x5AC8FA, 0x5AC8FA, 3.0, 2.2}};
    for (const Packet& p : packets) {
        const double ph = frac((t + p.off) / p.dur);
        const float e = static_cast<float>(Smooth(ph));
        const float x = p.toLeft ? barR - e * (barR - barL) : barL + e * (barR - barL);
        const float a = static_cast<float>(std::min({1.0, ph / 0.12, (1 - ph) / 0.2})) * hum;
        const float k = ph < 0.12 ? static_cast<float>(0.4 + ph / 0.12 * 0.85) : ph < 0.8 ? static_cast<float>(1.25 - (ph - 0.12) / 0.68 * 0.25)
                                                                                         : static_cast<float>(1 - (ph - 0.8) / 0.2 * 0.6);
        const float hw = p.w * s * k / 2, hh = 2.5f * s;
        if (auto br = solid(p.glow, a * 0.35f))
            dc_->FillRoundedRectangle(D2D1::RoundedRect(D2D1::RectF(x - hw - 5 * s, ty - hh - 4 * s, x + hw + 5 * s, ty + hh + 4 * s), 6 * s, 6 * s), br.Get());
        if (auto br = solid(p.rgb, a)) dc_->FillRoundedRectangle(D2D1::RoundedRect(D2D1::RectF(x - hw, ty - hh, x + hw, ty + hh), hh, hh), br.Get());
    }
    dc_->SetTransform(D2D1::Matrix3x2F::Identity());

    // The message: thin Geist, centred under the floor line.
    IDWriteFontCollection* family = fonts_ ? fonts_.Get() : nullptr;
    const float size = std::min(92 * s, W * 0.074f);
    const float textY = 495 * s;
    auto format = [&](const wchar_t* locale) {
        ComPtr<IDWriteTextFormat> f;
        if (SUCCEEDED(dwrite_->CreateTextFormat(family ? L"Geist" : L"Segoe UI", family, DWRITE_FONT_WEIGHT_EXTRA_LIGHT, DWRITE_FONT_STYLE_NORMAL,
                                                DWRITE_FONT_STRETCH_NORMAL, size, locale, &f))) {
            f->SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP);
            f->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_CENTER);
        }
        return f;
    };
    auto layoutOf = [&](IDWriteTextFormat* f, const wchar_t* text, UINT32 n, float boxW) {
        ComPtr<IDWriteTextLayout> l;
        if (SUCCEEDED(dwrite_->CreateTextLayout(text, n, f, boxW, size * 1.6f, &l))) {
            ComPtr<IDWriteTextLayout1> l1;
            if (SUCCEEDED(l.As(&l1))) l1->SetCharacterSpacing(0, -0.04f * size, 0, DWRITE_TEXT_RANGE{0, n});
        }
        return l;
    };

    if (!(st.multi && st.message == kLangs[0].text)) {
        // A message of the user's own: still, wrapped if long.
        if (auto f = format(L"fr-fr")) {
            f->SetWordWrapping(DWRITE_WORD_WRAPPING_WRAP);
            f->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_CENTER);
            ComPtr<IDWriteTextLayout> l;
            const float boxW = W * 0.92f;
            if (SUCCEEDED(dwrite_->CreateTextLayout(st.message.c_str(), static_cast<UINT32>(st.message.size()), f.Get(), boxW, size * 2.4f, &l)))
                if (auto br = solid(0xF1F3F6, 1.f)) dc_->DrawTextLayout(D2D1::Point2F((W - boxW) / 2, textY - size * 1.2f), l.Get(), br.Get());
        }
    } else {
        // Each letter comes up out of the blur 30 ms after the one before and
        // leaves the same way; the line before may still be leaving.
        // The languages follow the Windows clock (Unix time, like Date.now()
        // in the app): Discord shows the same one as the Hyphn window.
        FILETIME ft;
        GetSystemTimePreciseAsFileTime(&ft);
        const uint64_t unix100ns = ((static_cast<uint64_t>(ft.dwHighDateTime) << 32) | ft.dwLowDateTime) - 116444736000000000ull;
        const uint64_t cycle100ns = static_cast<uint64_t>(kLangCount * kLangSeconds * 1e7 + 0.5);
        const double tl = static_cast<double>(unix100ns % cycle100ns) / 1e7;
        const int cur = static_cast<int>(tl / kLangSeconds);
        const double ph = tl - cur * kLangSeconds;
        for (int back = 1; back >= 0; --back) {
            const Lang& lang = kLangs[((cur - back) % kLangCount + kLangCount) % kLangCount];
            const double local = ph + back * kLangSeconds;
            auto f = format(lang.locale);
            if (!f) continue;
            const UINT32 n = static_cast<UINT32>(wcslen(lang.text));
            auto full = layoutOf(f.Get(), lang.text, n, 100000.f);
            if (!full) continue;
            // Per letter: [start, length] in the text and its advance.
            std::vector<DWRITE_CLUSTER_METRICS> clusters(n);
            UINT32 count = 0;
            if (lang.whole || FAILED(full->GetClusterMetrics(clusters.data(), n, &count))) {
                DWRITE_TEXT_METRICS m{};
                full->GetMetrics(&m);
                clusters.assign(1, DWRITE_CLUSTER_METRICS{});
                clusters[0].width = m.widthIncludingTrailingWhitespace;
                clusters[0].length = static_cast<UINT16>(n);
                count = 1;
            }
            float lineW = 0;
            for (UINT32 i = 0; i < count; ++i) lineW += clusters[i].width;
            float x = cx - lineW / 2;
            UINT32 pos = 0;
            for (UINT32 i = 0; i < count; ++i) {
                const DWRITE_CLUSTER_METRICS& c = clusters[i];
                const double q = local - i * 0.03;
                float a = 0, dy = 0;
                if (q > 0 && q < 0.936) {
                    const double e = 1 - std::pow(1 - q / 0.936, 3);
                    a = static_cast<float>(e);
                    dy = static_cast<float>((1 - e) * 19 * s);
                } else if (q >= 0.936 && q < 2.106) {
                    a = 1;
                } else if (q >= 2.106 && q < 2.527) {
                    const double e = (q - 2.106) / 0.421;
                    a = static_cast<float>(1 - e);
                    dy = static_cast<float>(-e * 11 * s);
                }
                if (a > 0.003f) {
                    auto one = layoutOf(f.Get(), lang.text + pos, c.length, c.width + size);
                    if (one)
                        if (auto br = solid(0xF1F3F6, a)) dc_->DrawTextLayout(D2D1::Point2F(x, textY - size * 0.8f + dy), one.Get(), br.Get(), D2D1_DRAW_TEXT_OPTIONS_ENABLE_COLOR_FONT);
                }
                x += c.width;
                pos += c.length;
            }
        }
    }
    HRESULT hr = dc_->EndDraw();
    dc_->SetTarget(nullptr);
    return hr;
}

}  // namespace hyphn
