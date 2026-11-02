// hyphn_vcam.dll: the « Hyphn » webcam that Windows 11 shows to every app
// (spec `Cam - Webcam Windows et OBS`, ADR-0022). A Media Foundation
// software camera source, after VCamSample by Simon Mourier (MIT):
// https://github.com/smourier/VCamSample. Loaded by the Frame Server
// service; pictures come from Feed (feed.cpp).

#include <windows.h>
#include <bcrypt.h>
#include <initguid.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mferror.h>
#include <mftransform.h>
#include <mfvirtualcamera.h>
#include <ks.h>
#include <ksproxy.h>
#include <ksmedia.h>
#include <propvarutil.h>
#include <wrl/client.h>

#include <atomic>
#include <deque>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "feed.h"

using Microsoft::WRL::ComPtr;
using hyphn::Feed;
using hyphn::Pixel;

// {10FA7DA4-A7FE-49E4-B4E9-1A77EDCFEB6E}, same as vcam.rs.
static const GUID CLSID_HyphnCam = {0x10fa7da4, 0xa7fe, 0x49e4, {0xb4, 0xe9, 0x1a, 0x77, 0xed, 0xcf, 0xeb, 0x6e}};
static const wchar_t kClsidString[] = L"{10FA7DA4-A7FE-49E4-B4E9-1A77EDCFEB6E}";

static HMODULE g_module = nullptr;
static std::atomic<long> g_objects{0};
static ComPtr<IMFVirtualCamera> g_camera;

// ---------------------------------------------------------------- helpers

#define HY_UNKNOWN_IMPL                                                     \
    STDMETHODIMP_(ULONG) AddRef() override { return ++refs_; }             \
    STDMETHODIMP_(ULONG) Release() override {                              \
        ULONG n = --refs_;                                                  \
        if (!n) delete this;                                                \
        return n;                                                           \
    }

// IMFAttributes, forwarded to a real attribute store.
#define HY_ATTRIBUTES_IMPL(a)                                                                                                        \
    STDMETHODIMP GetItem(REFGUID k, PROPVARIANT* v) override { return a->GetItem(k, v); }                                            \
    STDMETHODIMP GetItemType(REFGUID k, MF_ATTRIBUTE_TYPE* t) override { return a->GetItemType(k, t); }                               \
    STDMETHODIMP CompareItem(REFGUID k, REFPROPVARIANT v, BOOL* r) override { return a->CompareItem(k, v, r); }                      \
    STDMETHODIMP Compare(IMFAttributes* o, MF_ATTRIBUTES_MATCH_TYPE m, BOOL* r) override { return a->Compare(o, m, r); }              \
    STDMETHODIMP GetUINT32(REFGUID k, UINT32* v) override { return a->GetUINT32(k, v); }                                             \
    STDMETHODIMP GetUINT64(REFGUID k, UINT64* v) override { return a->GetUINT64(k, v); }                                             \
    STDMETHODIMP GetDouble(REFGUID k, double* v) override { return a->GetDouble(k, v); }                                             \
    STDMETHODIMP GetGUID(REFGUID k, GUID* v) override { return a->GetGUID(k, v); }                                                   \
    STDMETHODIMP GetStringLength(REFGUID k, UINT32* n) override { return a->GetStringLength(k, n); }                                 \
    STDMETHODIMP GetString(REFGUID k, LPWSTR s, UINT32 n, UINT32* l) override { return a->GetString(k, s, n, l); }                   \
    STDMETHODIMP GetAllocatedString(REFGUID k, LPWSTR* s, UINT32* l) override { return a->GetAllocatedString(k, s, l); }             \
    STDMETHODIMP GetBlobSize(REFGUID k, UINT32* n) override { return a->GetBlobSize(k, n); }                                         \
    STDMETHODIMP GetBlob(REFGUID k, UINT8* b, UINT32 n, UINT32* l) override { return a->GetBlob(k, b, n, l); }                       \
    STDMETHODIMP GetAllocatedBlob(REFGUID k, UINT8** b, UINT32* n) override { return a->GetAllocatedBlob(k, b, n); }                 \
    STDMETHODIMP GetUnknown(REFGUID k, REFIID i, LPVOID* p) override { return a->GetUnknown(k, i, p); }                              \
    STDMETHODIMP SetItem(REFGUID k, REFPROPVARIANT v) override { return a->SetItem(k, v); }                                          \
    STDMETHODIMP DeleteItem(REFGUID k) override { return a->DeleteItem(k); }                                                         \
    STDMETHODIMP DeleteAllItems() override { return a->DeleteAllItems(); }                                                           \
    STDMETHODIMP SetUINT32(REFGUID k, UINT32 v) override { return a->SetUINT32(k, v); }                                              \
    STDMETHODIMP SetUINT64(REFGUID k, UINT64 v) override { return a->SetUINT64(k, v); }                                              \
    STDMETHODIMP SetDouble(REFGUID k, double v) override { return a->SetDouble(k, v); }                                              \
    STDMETHODIMP SetGUID(REFGUID k, REFGUID v) override { return a->SetGUID(k, v); }                                                 \
    STDMETHODIMP SetString(REFGUID k, LPCWSTR v) override { return a->SetString(k, v); }                                             \
    STDMETHODIMP SetBlob(REFGUID k, const UINT8* b, UINT32 n) override { return a->SetBlob(k, b, n); }                               \
    STDMETHODIMP SetUnknown(REFGUID k, IUnknown* u) override { return a->SetUnknown(k, u); }                                         \
    STDMETHODIMP LockStore() override { return a->LockStore(); }                                                                     \
    STDMETHODIMP UnlockStore() override { return a->UnlockStore(); }                                                                 \
    STDMETHODIMP GetCount(UINT32* n) override { return a->GetCount(n); }                                                             \
    STDMETHODIMP GetItemByIndex(UINT32 i, GUID* k, PROPVARIANT* v) override { return a->GetItemByIndex(i, k, v); }                   \
    STDMETHODIMP CopyAllItems(IMFAttributes* d) override { return a->CopyAllItems(d); }

#define HY_KS_IMPL                                                                                                    \
    STDMETHODIMP_(NTSTATUS) KsProperty(PKSPROPERTY, ULONG, LPVOID, ULONG, ULONG* r) override {                    \
        if (r) *r = 0;                                                                                            \
        return HRESULT_FROM_WIN32(ERROR_SET_NOT_FOUND);                                                           \
    }                                                                                                             \
    STDMETHODIMP_(NTSTATUS) KsMethod(PKSMETHOD, ULONG, LPVOID, ULONG, ULONG* r) override {                        \
        if (r) *r = 0;                                                                                            \
        return HRESULT_FROM_WIN32(ERROR_SET_NOT_FOUND);                                                           \
    }                                                                                                             \
    STDMETHODIMP_(NTSTATUS) KsEvent(PKSEVENT, ULONG, LPVOID, ULONG, ULONG* r) override {                          \
        if (r) *r = 0;                                                                                            \
        return HRESULT_FROM_WIN32(ERROR_SET_NOT_FOUND);                                                           \
    }

struct Mode {
    UINT32 w, h, fps;
};
// What apps may pick. 1080p30 first: what most apps ask for.
static const Mode kModes[] = {{1920, 1080, 30}, {1920, 1080, 60}, {1280, 720, 30}, {1280, 720, 60},
                              {3840, 2160, 30}, {3840, 2160, 60}, {640, 360, 30}};

static HRESULT MakeType(const Mode& m, bool nv12, IMFMediaType** out) {
    ComPtr<IMFMediaType> t;
    HRESULT hr = MFCreateMediaType(&t);
    if (FAILED(hr)) return hr;
    t->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
    t->SetGUID(MF_MT_SUBTYPE, nv12 ? MFVideoFormat_NV12 : MFVideoFormat_RGB32);
    MFSetAttributeSize(t.Get(), MF_MT_FRAME_SIZE, m.w, m.h);
    MFSetAttributeRatio(t.Get(), MF_MT_FRAME_RATE, m.fps, 1);
    MFSetAttributeRatio(t.Get(), MF_MT_PIXEL_ASPECT_RATIO, 1, 1);
    t->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
    t->SetUINT32(MF_MT_ALL_SAMPLES_INDEPENDENT, TRUE);
    t->SetUINT32(MF_MT_DEFAULT_STRIDE, nv12 ? m.w : m.w * 4);
    t->SetUINT32(MF_MT_AVG_BITRATE, static_cast<UINT32>(static_cast<UINT64>(m.w) * m.h * (nv12 ? 12 : 32) * m.fps));
    *out = t.Detach();
    return S_OK;
}

// ---------------------------------------------------------------- stream

class Stream final : public IMFMediaStream2, public IKsControl, public IMFAttributes {
public:
    Stream() : feed_(g_module) {
        ++g_objects;
        MFCreateAttributes(&attrs_, 4);
        tokenEvent_ = CreateEventW(nullptr, FALSE, FALSE, nullptr);
        stopEvent_ = CreateEventW(nullptr, TRUE, FALSE, nullptr);
        timer_ = CreateWaitableTimerExW(nullptr, nullptr, CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS);
        if (!timer_) timer_ = CreateWaitableTimerW(nullptr, FALSE, nullptr);
    }

    HRESULT Initialize(IMFMediaSource* source, DWORD id) {
        source_ = source;
        id_ = id;
        attrs_->SetGUID(MF_DEVICESTREAM_STREAM_CATEGORY, PINNAME_VIDEO_CAPTURE);
        attrs_->SetUINT32(MF_DEVICESTREAM_STREAM_ID, id);
        attrs_->SetUINT32(MF_DEVICESTREAM_FRAMESERVER_SHARED, 1);
        attrs_->SetUINT32(MF_DEVICESTREAM_ATTRIBUTE_FRAMESOURCE_TYPES, MFFrameSourceTypes_Color);
        HRESULT hr = MFCreateEventQueue(&queue_);
        if (FAILED(hr)) return hr;
        std::vector<IMFMediaType*> types;
        for (const Mode& m : kModes) {
            for (bool nv12 : {true, false}) {
                IMFMediaType* t = nullptr;
                if (SUCCEEDED(MakeType(m, nv12, &t))) types.push_back(t);
            }
        }
        hr = MFCreateStreamDescriptor(id, static_cast<DWORD>(types.size()), types.data(), &descriptor_);
        if (SUCCEEDED(hr)) {
            ComPtr<IMFMediaTypeHandler> handler;
            hr = descriptor_->GetMediaTypeHandler(&handler);
            if (SUCCEEDED(hr)) hr = handler->SetCurrentMediaType(types[0]);
        }
        for (IMFMediaType* t : types) t->Release();
        return hr;
    }

    HRESULT SetAllocator(IUnknown* a) {
        std::lock_guard<std::mutex> l(lock_);
        allocator_.Reset();
        return a ? a->QueryInterface(IID_PPV_ARGS(&allocator_)) : E_POINTER;
    }

    HRESULT Start(IMFMediaType* type) {
        std::lock_guard<std::mutex> l(lock_);
        if (!queue_) return MF_E_SHUTDOWN;
        // The Frame Server gives its allocator; a plain reader (tests) does not.
        if (!allocator_ && FAILED(MFCreateVideoSampleAllocatorEx(IID_PPV_ARGS(&allocator_)))) return E_FAIL;
        if (type) {
            GUID sub{};
            type->GetGUID(MF_MT_SUBTYPE, &sub);
            nv12_ = sub == MFVideoFormat_NV12;
            MFGetAttributeSize(type, MF_MT_FRAME_SIZE, &w_, &h_);
            UINT32 n = 30, d = 1;
            MFGetAttributeRatio(type, MF_MT_FRAME_RATE, &n, &d);
            fps_ = d ? std::max(1u, n / d) : 30;
            HRESULT hr = allocator_->InitializeSampleAllocator(10, type);
            hyphn::Log("stream: start %ux%u@%u %s -> 0x%08X", w_, h_, fps_, nv12_ ? "NV12" : "RGB32", hr);
            if (FAILED(hr)) return hr;
        }
        {
            // Start and StopPump never overlap (the Frame Server may call both).
            std::lock_guard<std::mutex> run(runLock_);
            if (!running_) {
                HRESULT fh = feed_.Start(w_, h_);
                if (FAILED(fh)) hyphn::Log("stream: feed start 0x%08X (black frames)", fh);
                ResetEvent(stopEvent_);
                pump_ = std::thread([this] { Pump(); });
                running_ = true;
            }
        }
        state_ = MF_STREAM_STATE_RUNNING;
        return queue_->QueueEventParamVar(MEStreamStarted, GUID_NULL, S_OK, nullptr);
    }

    HRESULT Stop() {
        StopPump();
        std::lock_guard<std::mutex> l(lock_);
        if (!queue_) return MF_E_SHUTDOWN;
        if (allocator_) allocator_->UninitializeSampleAllocator();
        state_ = MF_STREAM_STATE_STOPPED;
        return queue_->QueueEventParamVar(MEStreamStopped, GUID_NULL, S_OK, nullptr);
    }

    void Shutdown() {
        StopPump();
        std::lock_guard<std::mutex> l(lock_);
        if (queue_) queue_->Shutdown();
        queue_.Reset();
        descriptor_.Reset();
        source_.Reset();
        allocator_.Reset();
    }

    MF_STREAM_STATE State() const { return state_; }

    // IUnknown
    STDMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        if (riid == IID_IUnknown || riid == __uuidof(IMFMediaEventGenerator) || riid == __uuidof(IMFMediaStream) ||
            riid == __uuidof(IMFMediaStream2))
            *ppv = static_cast<IMFMediaStream2*>(this);
        else if (riid == __uuidof(IKsControl))
            *ppv = static_cast<IKsControl*>(this);
        else if (riid == __uuidof(IMFAttributes))
            *ppv = static_cast<IMFAttributes*>(this);
        else {
            *ppv = nullptr;
            return E_NOINTERFACE;
        }
        AddRef();
        return S_OK;
    }
    HY_UNKNOWN_IMPL
    HY_ATTRIBUTES_IMPL(attrs_)
    HY_KS_IMPL

    // IMFMediaEventGenerator
    STDMETHODIMP BeginGetEvent(IMFAsyncCallback* cb, IUnknown* st) override {
        auto q = Queue();
        return q ? q->BeginGetEvent(cb, st) : MF_E_SHUTDOWN;
    }
    STDMETHODIMP EndGetEvent(IMFAsyncResult* r, IMFMediaEvent** e) override {
        auto q = Queue();
        return q ? q->EndGetEvent(r, e) : MF_E_SHUTDOWN;
    }
    STDMETHODIMP GetEvent(DWORD f, IMFMediaEvent** e) override {
        auto q = Queue();
        return q ? q->GetEvent(f, e) : MF_E_SHUTDOWN;
    }
    STDMETHODIMP QueueEvent(MediaEventType met, REFGUID ext, HRESULT hr, const PROPVARIANT* v) override {
        auto q = Queue();
        return q ? q->QueueEventParamVar(met, ext, hr, v) : MF_E_SHUTDOWN;
    }

    // IMFMediaStream
    STDMETHODIMP GetMediaSource(IMFMediaSource** s) override {
        if (!s) return E_POINTER;
        std::lock_guard<std::mutex> l(lock_);
        if (!source_) return MF_E_SHUTDOWN;
        return source_.CopyTo(s);
    }
    STDMETHODIMP GetStreamDescriptor(IMFStreamDescriptor** d) override {
        if (!d) return E_POINTER;
        std::lock_guard<std::mutex> l(lock_);
        if (!descriptor_) return MF_E_SHUTDOWN;
        return descriptor_.CopyTo(d);
    }
    // Answered by the pump thread: at once when a new iPhone picture is
    // decoded, otherwise at the frame rate (waiting screen).
    STDMETHODIMP RequestSample(IUnknown* token) override {
        std::lock_guard<std::mutex> l(tokenLock_);
        if (!running_.load()) {
            hyphn::Log("stream: request while stopped");
            return MF_E_INVALIDREQUEST;
        }
        if (token) token->AddRef();
        tokens_.push_back(token);
        SetEvent(tokenEvent_);
        return S_OK;
    }

    // IMFMediaStream2
    STDMETHODIMP SetStreamState(MF_STREAM_STATE v) override {
        if (v == state_) return S_OK;
        switch (v) {
        case MF_STREAM_STATE_PAUSED:
            if (state_ != MF_STREAM_STATE_RUNNING) return MF_E_INVALID_STATE_TRANSITION;
            state_ = v;
            return S_OK;
        case MF_STREAM_STATE_RUNNING: return Start(nullptr);
        case MF_STREAM_STATE_STOPPED: return Stop();
        default: return MF_E_INVALID_STATE_TRANSITION;
        }
    }
    STDMETHODIMP GetStreamState(MF_STREAM_STATE* v) override {
        if (!v) return E_POINTER;
        *v = state_;
        return S_OK;
    }

private:
    ~Stream() {
        StopPump();
        CloseHandle(tokenEvent_);
        CloseHandle(stopEvent_);
        CloseHandle(timer_);
        --g_objects;
    }

    ComPtr<IMFMediaEventQueue> Queue() {
        std::lock_guard<std::mutex> l(lock_);
        return queue_;
    }

    void StopPump() {
        std::lock_guard<std::mutex> run(runLock_);
        if (!running_.exchange(false)) return;
        SetEvent(stopEvent_);
        if (pump_.joinable()) pump_.join();
        feed_.Stop();
        std::lock_guard<std::mutex> l(tokenLock_);
        for (IUnknown* t : tokens_)
            if (t) t->Release();
        tokens_.clear();
    }

    void Pump() {
        CoInitializeEx(nullptr, COINIT_MULTITHREADED);
        LARGE_INTEGER freq, last{}, now;
        QueryPerformanceFrequency(&freq);
        for (;;) {
            bool asked = false;
            {
                std::lock_guard<std::mutex> l(tokenLock_);
                asked = !tokens_.empty();
            }
            if (!asked) {
                // Nobody waits for a picture (app minimized, camera paused):
                // sleep until a request comes, using no processor at all.
                HANDLE idle[] = {stopEvent_, tokenEvent_};
                if (WaitForMultipleObjects(2, idle, FALSE, INFINITE) == WAIT_OBJECT_0) break;
                continue;
            }
            const double interval = 1.0 / Snapshot().fps;
            QueryPerformanceCounter(&now);
            double since = static_cast<double>(now.QuadPart - last.QuadPart) / freq.QuadPart;
            // A plain wait is only precise to ~15.6 ms (30 fps would become 21):
            // a high resolution timer wakes at the right time.
            LARGE_INTEGER due;
            due.QuadPart = since >= interval ? -1 : -static_cast<LONGLONG>((interval - since) * 1e7);
            SetWaitableTimer(timer_, &due, 0, nullptr, nullptr, FALSE);
            HANDLE w[] = {stopEvent_, tokenEvent_, feed_.FrameEvent(), timer_};
            DWORD r = WaitForMultipleObjects(4, w, FALSE, INFINITE);
            if (r == WAIT_OBJECT_0) break;
            bool fresh = r == WAIT_OBJECT_0 + 2;
            QueryPerformanceCounter(&now);
            since = static_cast<double>(now.QuadPart - last.QuadPart) / freq.QuadPart;
            // Never faster than the rate the app picked (a 60 fps iPhone in a
            // 30 fps webcam), never slower than it (the waiting screen moves).
            if (since < interval * (fresh ? 0.9 : 1.0) - 0.001) continue;
            IUnknown* token = nullptr;
            {
                std::lock_guard<std::mutex> l(tokenLock_);
                if (tokens_.empty()) continue;
                token = tokens_.front();
                tokens_.pop_front();
            }
            if (Deliver(token)) last = now;
            else {
                // No free sample yet: keep the request for the next turn.
                std::lock_guard<std::mutex> l(tokenLock_);
                tokens_.push_front(token);
                token = nullptr;
                Sleep(2);
            }
            if (token) token->Release();
        }
        CoUninitialize();
    }

    struct Format {
        UINT32 w, h, fps;
        bool nv12;
    };
    Format Snapshot() {
        std::lock_guard<std::mutex> l(lock_);
        return {w_, h_, fps_, nv12_};
    }

    bool Deliver(IUnknown* token) {
        ComPtr<IMFVideoSampleAllocatorEx> alloc;
        ComPtr<IMFMediaEventQueue> queue;
        Format f;
        {
            // Format and allocator read together: a new type from the app
            // changes both at once.
            std::lock_guard<std::mutex> l(lock_);
            alloc = allocator_;
            queue = queue_;
            f = {w_, h_, fps_, nv12_};
        }
        if (!alloc || !queue) return true;
        ComPtr<IMFSample> sample;
        if (FAILED(alloc->AllocateSample(&sample))) return false;
        ComPtr<IMFMediaBuffer> buf;
        if (FAILED(sample->GetBufferByIndex(0, &buf))) return true;
        BYTE* scan0 = nullptr;
        LONG pitch = 0;
        BYTE* start = nullptr;
        DWORD len = 0;
        ComPtr<IMF2DBuffer2> b2;
        bool ok = false;
        const Pixel px = f.nv12 ? Pixel::NV12 : Pixel::BGRA;
        // Never write past the buffer: it must hold the whole picture.
        auto fits = [&](LONG p, DWORD size) {
            const UINT64 row = static_cast<UINT64>(p < 0 ? -static_cast<INT64>(p) : p);
            const UINT64 minRow = f.nv12 ? f.w : static_cast<UINT64>(f.w) * 4;
            return row >= minRow && row * (f.nv12 ? f.h * 3 / 2 : f.h) <= size;
        };
        if (SUCCEEDED(buf.As(&b2)) && SUCCEEDED(b2->Lock2DSize(MF2DBuffer_LockFlags_Write, &scan0, &pitch, &start, &len))) {
            if (fits(pitch, len)) ok = SUCCEEDED(feed_.Fill(scan0, pitch, f.w, f.h, px, nullptr));
            b2->Unlock2D();
        } else if (SUCCEEDED(buf->Lock(&scan0, nullptr, &len))) {
            pitch = static_cast<LONG>(f.nv12 ? f.w : f.w * 4);
            if (fits(pitch, len)) ok = SUCCEEDED(feed_.Fill(scan0, pitch, f.w, f.h, px, nullptr));
            buf->Unlock();
        }
        if (!ok) return true;
        sample->SetSampleTime(MFGetSystemTime());
        sample->SetSampleDuration(10'000'000 / f.fps);
        if (token) sample->SetUnknown(MFSampleExtension_Token, token);
        queue->QueueEventParamUnk(MEMediaSample, GUID_NULL, S_OK, sample.Get());
        return true;
    }

    std::atomic<ULONG> refs_{1};
    std::mutex lock_;
    ComPtr<IMFAttributes> attrs_;
    ComPtr<IMFMediaEventQueue> queue_;
    ComPtr<IMFStreamDescriptor> descriptor_;
    ComPtr<IMFMediaSource> source_;
    ComPtr<IMFVideoSampleAllocatorEx> allocator_;
    DWORD id_ = 0;
    MF_STREAM_STATE state_ = MF_STREAM_STATE_STOPPED;
    UINT32 w_ = 1920, h_ = 1080, fps_ = 30;
    bool nv12_ = true;
    Feed feed_;
    std::thread pump_;
    std::mutex tokenLock_;
    std::deque<IUnknown*> tokens_;
    std::mutex runLock_;
    std::atomic<bool> running_{false};
    HANDLE tokenEvent_ = nullptr;
    HANDLE stopEvent_ = nullptr;
    HANDLE timer_ = nullptr;
};

// ---------------------------------------------------------------- source

class Source final : public IMFMediaSourceEx, public IMFGetService, public IKsControl, public IMFSampleAllocatorControl, public IMFAttributes {
public:
    Source() {
        ++g_objects;
        MFCreateAttributes(&attrs_, 8);
    }

    HRESULT Initialize(IMFAttributes* from) {
        if (from) from->CopyAllItems(attrs_.Get());
        // Profiles so the Windows Camera app accepts the camera.
        ComPtr<IMFSensorProfileCollection> profiles;
        if (SUCCEEDED(MFCreateSensorProfileCollection(&profiles))) {
            ComPtr<IMFSensorProfile> p;
            if (SUCCEEDED(MFCreateSensorProfile(KSCAMERAPROFILE_Legacy, 0, nullptr, &p))) {
                p->AddProfileFilter(0, L"((RES==;FRT<=30,1;SUT==))");
                profiles->AddProfile(p.Get());
            }
            if (SUCCEEDED(MFCreateSensorProfile(KSCAMERAPROFILE_HighFrameRate, 0, nullptr, &p))) {
                p->AddProfileFilter(0, L"((RES==;FRT>=60,1;SUT==))");
                profiles->AddProfile(p.Get());
            }
            attrs_->SetUnknown(MF_DEVICEMFT_SENSORPROFILE_COLLECTION, profiles.Get());
        }
        stream_.Attach(new Stream());
        HRESULT hr = stream_->Initialize(this, 0);
        if (FAILED(hr)) return hr;
        ComPtr<IMFStreamDescriptor> sd;
        hr = stream_->GetStreamDescriptor(&sd);
        if (FAILED(hr)) return hr;
        IMFStreamDescriptor* list[] = {sd.Get()};
        hr = MFCreatePresentationDescriptor(1, list, &descriptor_);
        if (FAILED(hr)) return hr;
        // Selected by default, like a real camera's video stream.
        descriptor_->SelectStream(0);
        return MFCreateEventQueue(&queue_);
    }

    STDMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        if (riid == IID_IUnknown || riid == __uuidof(IMFMediaEventGenerator) || riid == __uuidof(IMFMediaSource) ||
            riid == __uuidof(IMFMediaSourceEx))
            *ppv = static_cast<IMFMediaSourceEx*>(this);
        else if (riid == __uuidof(IMFGetService))
            *ppv = static_cast<IMFGetService*>(this);
        else if (riid == __uuidof(IKsControl))
            *ppv = static_cast<IKsControl*>(this);
        else if (riid == __uuidof(IMFSampleAllocatorControl))
            *ppv = static_cast<IMFSampleAllocatorControl*>(this);
        else if (riid == __uuidof(IMFAttributes))
            *ppv = static_cast<IMFAttributes*>(this);
        else {
            *ppv = nullptr;
            return E_NOINTERFACE;
        }
        AddRef();
        return S_OK;
    }
    HY_UNKNOWN_IMPL
    HY_ATTRIBUTES_IMPL(attrs_)
    HY_KS_IMPL

    // IMFMediaEventGenerator
    STDMETHODIMP BeginGetEvent(IMFAsyncCallback* cb, IUnknown* st) override {
        auto q = Queue();
        return q ? q->BeginGetEvent(cb, st) : MF_E_SHUTDOWN;
    }
    STDMETHODIMP EndGetEvent(IMFAsyncResult* r, IMFMediaEvent** e) override {
        auto q = Queue();
        return q ? q->EndGetEvent(r, e) : MF_E_SHUTDOWN;
    }
    STDMETHODIMP GetEvent(DWORD f, IMFMediaEvent** e) override {
        auto q = Queue();
        return q ? q->GetEvent(f, e) : MF_E_SHUTDOWN;
    }
    STDMETHODIMP QueueEvent(MediaEventType met, REFGUID ext, HRESULT hr, const PROPVARIANT* v) override {
        auto q = Queue();
        return q ? q->QueueEventParamVar(met, ext, hr, v) : MF_E_SHUTDOWN;
    }

    // IMFMediaSource
    STDMETHODIMP CreatePresentationDescriptor(IMFPresentationDescriptor** pd) override {
        if (!pd) return E_POINTER;
        std::lock_guard<std::mutex> l(lock_);
        return descriptor_ ? descriptor_->Clone(pd) : MF_E_SHUTDOWN;
    }
    STDMETHODIMP GetCharacteristics(DWORD* c) override {
        if (!c) return E_POINTER;
        *c = MFMEDIASOURCE_IS_LIVE;
        return S_OK;
    }
    STDMETHODIMP Pause() override { return MF_E_INVALID_STATE_TRANSITION; }
    STDMETHODIMP Shutdown() override {
        std::lock_guard<std::mutex> l(lock_);
        if (!queue_) return MF_E_SHUTDOWN;
        queue_->Shutdown();
        queue_.Reset();
        if (stream_) stream_->Shutdown();
        descriptor_.Reset();
        return S_OK;
    }
    STDMETHODIMP Start(IMFPresentationDescriptor* pd, const GUID* fmt, const PROPVARIANT* pos) override {
        hyphn::Log("source: start");
        if (!pd || !pos) return E_POINTER;
        if (fmt && *fmt != GUID_NULL) return MF_E_UNSUPPORTED_TIME_FORMAT;
        std::lock_guard<std::mutex> l(lock_);
        if (!queue_ || !descriptor_) return MF_E_SHUTDOWN;
        DWORD count = 0;
        HRESULT hr = pd->GetStreamDescriptorCount(&count);
        if (FAILED(hr)) return hr;
        if (count != 1) return E_INVALIDARG;
        BOOL selected = FALSE;
        ComPtr<IMFStreamDescriptor> sd;
        hr = pd->GetStreamDescriptorByIndex(0, &selected, &sd);
        if (FAILED(hr)) return hr;
        bool running = stream_->State() != MF_STREAM_STATE_STOPPED;
        if (selected) {
            descriptor_->SelectStream(0);
            if (!running) {
                ComPtr<IUnknown> unk;
                stream_.As(&unk);
                queue_->QueueEventParamUnk(MENewStream, GUID_NULL, S_OK, unk.Get());
            }
            ComPtr<IMFMediaTypeHandler> handler;
            ComPtr<IMFMediaType> type;
            hr = sd->GetMediaTypeHandler(&handler);
            if (SUCCEEDED(hr)) hr = handler->GetCurrentMediaType(&type);
            if (SUCCEEDED(hr)) hr = stream_->Start(type.Get());
            if (FAILED(hr)) return hr;
        } else if (running) {
            descriptor_->DeselectStream(0);
            stream_->Stop();
        }
        PROPVARIANT time;
        InitPropVariantFromInt64(MFGetSystemTime(), &time);
        hr = queue_->QueueEventParamVar(MESourceStarted, GUID_NULL, S_OK, &time);
        PropVariantClear(&time);
        return hr;
    }
    STDMETHODIMP Stop() override {
        std::lock_guard<std::mutex> l(lock_);
        if (!queue_ || !descriptor_) return MF_E_SHUTDOWN;
        if (stream_) stream_->Stop();
        descriptor_->DeselectStream(0);
        PROPVARIANT time;
        InitPropVariantFromInt64(MFGetSystemTime(), &time);
        HRESULT hr = queue_->QueueEventParamVar(MESourceStopped, GUID_NULL, S_OK, &time);
        PropVariantClear(&time);
        return hr;
    }

    // IMFMediaSourceEx
    STDMETHODIMP GetSourceAttributes(IMFAttributes** a) override {
        if (!a) return E_POINTER;
        *a = static_cast<IMFAttributes*>(this);
        AddRef();
        return S_OK;
    }
    STDMETHODIMP GetStreamAttributes(DWORD id, IMFAttributes** a) override {
        if (!a) return E_POINTER;
        if (id != 0 || !stream_) return MF_E_INVALIDSTREAMNUMBER;
        return stream_->QueryInterface(IID_PPV_ARGS(a));
    }
    // CPU samples: the Feed reads its own graphics card picture back.
    STDMETHODIMP SetD3DManager(IUnknown*) override { return S_OK; }

    // IMFGetService
    STDMETHODIMP GetService(REFGUID, REFIID, LPVOID* p) override {
        if (p) *p = nullptr;
        return MF_E_UNSUPPORTED_SERVICE;
    }

    // IMFSampleAllocatorControl
    STDMETHODIMP SetDefaultAllocator(DWORD id, IUnknown* a) override {
        if (id != 0 || !stream_) return MF_E_INVALIDSTREAMNUMBER;
        return stream_->SetAllocator(a);
    }
    STDMETHODIMP GetAllocatorUsage(DWORD id, DWORD* in, MFSampleAllocatorUsage* usage) override {
        if (!in || !usage) return E_POINTER;
        *in = id;
        *usage = MFSampleAllocatorUsage_UsesProvidedAllocator;
        return S_OK;
    }

private:
    ~Source() {
        if (stream_) stream_->Shutdown();
        --g_objects;
    }
    ComPtr<IMFMediaEventQueue> Queue() {
        std::lock_guard<std::mutex> l(lock_);
        return queue_;
    }

    std::atomic<ULONG> refs_{1};
    std::mutex lock_;
    ComPtr<IMFAttributes> attrs_;
    ComPtr<IMFMediaEventQueue> queue_;
    ComPtr<IMFPresentationDescriptor> descriptor_;
    ComPtr<Stream> stream_;
};

// ---------------------------------------------------------------- activator

class Activator final : public IMFActivate {
public:
    Activator() {
        ++g_objects;
        MFCreateAttributes(&attrs_, 4);
    }
    HRESULT Initialize() {
        attrs_->SetUINT32(MF_VIRTUALCAMERA_PROVIDE_ASSOCIATED_CAMERA_SOURCES, 1);
        attrs_->SetGUID(MFT_TRANSFORM_CLSID_Attribute, CLSID_HyphnCam);
        source_.Attach(new Source());
        return source_->Initialize(attrs_.Get());
    }
    STDMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        if (riid == IID_IUnknown || riid == __uuidof(IMFAttributes) || riid == __uuidof(IMFActivate)) {
            *ppv = static_cast<IMFActivate*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    HY_UNKNOWN_IMPL
    HY_ATTRIBUTES_IMPL(attrs_)
    STDMETHODIMP ActivateObject(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        *ppv = nullptr;
        if (!source_) return MF_E_SHUTDOWN;
        return source_->QueryInterface(riid, ppv);
    }
    STDMETHODIMP ShutdownObject() override { return S_OK; }
    STDMETHODIMP DetachObject() override {
        source_.Reset();
        return S_OK;
    }

private:
    ~Activator() { --g_objects; }
    std::atomic<ULONG> refs_{1};
    ComPtr<IMFAttributes> attrs_;
    ComPtr<Source> source_;
};

class Factory final : public IClassFactory {
public:
    STDMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        if (riid == IID_IUnknown || riid == IID_IClassFactory) {
            *ppv = static_cast<IClassFactory*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    STDMETHODIMP_(ULONG) AddRef() override { return 2; }
    STDMETHODIMP_(ULONG) Release() override { return 1; }
    STDMETHODIMP CreateInstance(IUnknown* outer, REFIID riid, void** ppv) override {
        if (!ppv) return E_POINTER;
        *ppv = nullptr;
        if (outer) return CLASS_E_NOAGGREGATION;
        ComPtr<Activator> a;
        a.Attach(new (std::nothrow) Activator());
        if (!a) return E_OUTOFMEMORY;
        HRESULT hr = a->Initialize();
        if (FAILED(hr)) return hr;
        return a->QueryInterface(riid, ppv);
    }
    STDMETHODIMP LockServer(BOOL lock) override {
        lock ? ++g_objects : --g_objects;
        return S_OK;
    }
};

static Factory g_factory;

// ---------------------------------------------------------------- exports

BOOL APIENTRY DllMain(HMODULE module, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) {
        g_module = module;
        DisableThreadLibraryCalls(module);
    }
    return TRUE;
}

STDAPI DllCanUnloadNow() { return g_objects == 0 && !g_camera ? S_OK : S_FALSE; }

// The camera service keeps this DLL loaded until it stops (ADR-0026): tell the
// app which one it holds. SHA-256 of our own file, read once at the first use
// (the file is still the loaded one then; an update renames it away), written
// to %ProgramData%\Hyphn\loaded-<pid>.txt where only the services may write.
static void RecordLoaded() {
    wchar_t path[MAX_PATH];
    DWORD n = GetModuleFileNameW(g_module, path, MAX_PATH);
    if (!n || n == MAX_PATH) return;
    HANDLE f = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING, 0, nullptr);
    if (f == INVALID_HANDLE_VALUE) return;
    LARGE_INTEGER size{};
    std::vector<BYTE> data;
    DWORD got = 0;
    if (GetFileSizeEx(f, &size) && size.QuadPart > 0 && size.QuadPart < (64 << 20)) {
        data.resize(static_cast<size_t>(size.QuadPart));
        if (!ReadFile(f, data.data(), static_cast<DWORD>(data.size()), &got, nullptr)) got = 0;
    }
    CloseHandle(f);
    BYTE digest[32];
    if (got != data.size() || got == 0 ||
        !BCRYPT_SUCCESS(BCryptHash(BCRYPT_SHA256_ALG_HANDLE, nullptr, 0, data.data(), got, digest, sizeof digest)))
        return;
    char hex[65];
    for (int i = 0; i < 32; i++) sprintf_s(hex + i * 2, 3, "%02X", digest[i]);
    hyphn::Log("dll: loaded %s", hex);
    char dir[MAX_PATH];
    if (!GetEnvironmentVariableA("ProgramData", dir, MAX_PATH)) strcpy_s(dir, "C:\\ProgramData");
    std::string out = std::string(dir) + "\\Hyphn\\loaded-" + std::to_string(GetCurrentProcessId()) + ".txt";
    HANDLE o = CreateFileA(out.c_str(), GENERIC_WRITE, FILE_SHARE_READ, nullptr, CREATE_ALWAYS, 0, nullptr);
    if (o == INVALID_HANDLE_VALUE) return;
    DWORD w;
    WriteFile(o, hex, 64, &w, nullptr);
    CloseHandle(o);
}

STDAPI DllGetClassObject(REFCLSID clsid, REFIID riid, LPVOID* ppv) {
    if (!ppv) return E_POINTER;
    *ppv = nullptr;
    if (clsid != CLSID_HyphnCam) return CLASS_E_CLASSNOTAVAILABLE;
    static std::once_flag recorded;
    std::call_once(recorded, RecordLoaded);
    return g_factory.QueryInterface(riid, ppv);
}

// HKLM, not HKCU: the Frame Server service must find the class (VCamSample).
STDAPI DllRegisterServer() {
    wchar_t path[MAX_PATH];
    if (!GetModuleFileNameW(g_module, path, MAX_PATH)) return HRESULT_FROM_WIN32(GetLastError());
    std::wstring key = std::wstring(L"Software\\Classes\\CLSID\\") + kClsidString;
    HKEY k = nullptr;
    LSTATUS s = RegCreateKeyExW(HKEY_LOCAL_MACHINE, key.c_str(), 0, nullptr, 0, KEY_WRITE, nullptr, &k, nullptr);
    if (s) return HRESULT_FROM_WIN32(s);
    const wchar_t name[] = L"Hyphn";
    RegSetValueExW(k, nullptr, 0, REG_SZ, reinterpret_cast<const BYTE*>(name), sizeof name);
    RegCloseKey(k);
    s = RegCreateKeyExW(HKEY_LOCAL_MACHINE, (key + L"\\InprocServer32").c_str(), 0, nullptr, 0, KEY_WRITE, nullptr, &k, nullptr);
    if (s) return HRESULT_FROM_WIN32(s);
    RegSetValueExW(k, nullptr, 0, REG_SZ, reinterpret_cast<const BYTE*>(path), static_cast<DWORD>((wcslen(path) + 1) * sizeof(wchar_t)));
    const wchar_t model[] = L"Both";
    RegSetValueExW(k, L"ThreadingModel", 0, REG_SZ, reinterpret_cast<const BYTE*>(model), sizeof model);
    RegCloseKey(k);
    return S_OK;
}

STDAPI DllUnregisterServer() {
    std::wstring key = std::wstring(L"Software\\Classes\\CLSID\\") + kClsidString;
    LSTATUS s = RegDeleteTreeW(HKEY_LOCAL_MACHINE, key.c_str());
    return s == ERROR_SUCCESS || s == ERROR_FILE_NOT_FOUND ? S_OK : HRESULT_FROM_WIN32(s);
}

// Called by the Hyphn app: the camera exists for this user while the app
// runs (MFVirtualCameraLifetime_Session), nothing is left behind.
extern "C" HRESULT WINAPI HyphnVCamCreate(LPCWSTR name) {
    if (g_camera) return S_OK;
    // The calling thread may end: keep the multithreaded apartment alive for
    // the camera object whatever happens to that thread.
    static CO_MTA_USAGE_COOKIE mta = nullptr;
    if (!mta) CoIncrementMTAUsage(&mta);
    HRESULT co = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    HRESULT hr = MFStartup(MF_VERSION, MFSTARTUP_NOSOCKET);
    if (FAILED(hr)) return hr;
    ComPtr<IMFVirtualCamera> cam;
    hr = MFCreateVirtualCamera(MFVirtualCameraType_SoftwareCameraSource, MFVirtualCameraLifetime_Session, MFVirtualCameraAccess_CurrentUser,
                               name && *name ? name : L"Hyphn", kClsidString, nullptr, 0, &cam);
    if (SUCCEEDED(hr)) hr = cam->Start(nullptr);
    if (SUCCEEDED(hr)) g_camera = cam;
    (void)co;
    return hr;
}

// « Retirer » in the app: the camera disappears at once, before the DLL is
// unregistered.
extern "C" HRESULT WINAPI HyphnVCamRemove() {
    if (!g_camera) return S_OK;
    HRESULT hr = g_camera->Remove();
    g_camera.Reset();
    return hr;
}

// ---------------------------------------------------------------- decoder for the app

// ADR-0035: the camera service cannot see the HEVC decoder (a Store app), so
// the Hyphn app decodes for the webcam with this same code and sends decoded
// NV12 pictures on the pipe. Any thread may call these; each joins the
// multithreaded apartment once.
static void JoinMta() {
    thread_local bool joined = SUCCEEDED(CoInitializeEx(nullptr, COINIT_MULTITHREADED));
    (void)joined;
}

extern "C" void* WINAPI HyphnDecoderOpen() {
    JoinMta();
    auto* f = new (std::nothrow) hyphn::Feed(g_module);
    if (!f) return nullptr;
    if (FAILED(f->StartLocal())) {
        delete f;
        return nullptr;
    }
    return f;
}

extern "C" BOOL WINAPI HyphnDecoderHevc(void* d) { return d && static_cast<hyphn::Feed*>(d)->HevcOk(); }

// TRUE: the decoder needs a keyframe.
extern "C" BOOL WINAPI HyphnDecoderPush(void* d, UINT8 codec, UINT32 w, UINT32 h, BOOL key, INT64 pts, const BYTE* p, UINT32 len) {
    if (!d || !p) return FALSE;
    JoinMta();
    return static_cast<hyphn::Feed*>(d)->Decode(codec, w, h, key != FALSE, pts, p, len);
}

// TRUE: a new picture came out of the decoder within `ms`.
extern "C" BOOL WINAPI HyphnDecoderWait(void* d, DWORD ms) {
    return d && WaitForSingleObject(static_cast<hyphn::Feed*>(d)->FrameEvent(), ms) == WAIT_OBJECT_0;
}

// The latest picture as NV12, w x h, rows packed (w * h * 3 / 2 bytes).
// TRUE: it is the iPhone picture (FALSE: nothing recent, `dst` holds no picture to send).
extern "C" BOOL WINAPI HyphnDecoderFill(void* d, BYTE* dst, UINT32 w, UINT32 h) {
    if (!d || !dst) return FALSE;
    JoinMta();
    bool video = false;
    return SUCCEEDED(static_cast<hyphn::Feed*>(d)->Fill(dst, static_cast<LONG>(w), w, h, hyphn::Pixel::NV12, &video)) && video;
}

extern "C" void WINAPI HyphnDecoderClose(void* d) {
    JoinMta();
    delete static_cast<hyphn::Feed*>(d);
}
