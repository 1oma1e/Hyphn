// Dev check of hyphn_vcam.dll without installing it: loads the DLL, opens its
// camera source like an app would, reads frames and saves the last one as a
// BMP. Usage: grab.exe <dll> <out.bmp> [nv12|rgb] [width height] [frames]

#include <windows.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <wrl/client.h>

#include <cstdio>
#include <string>
#include <vector>

using Microsoft::WRL::ComPtr;

static const GUID CLSID_HyphnCam = {0x10fa7da4, 0xa7fe, 0x49e4, {0xb4, 0xe9, 0x1a, 0x77, 0xed, 0xcf, 0xeb, 0x6e}};

static void SaveBmp(const wchar_t* path, const std::vector<BYTE>& bgra, UINT32 w, UINT32 h) {
    BITMAPFILEHEADER f{};
    BITMAPINFOHEADER i{};
    i.biSize = sizeof i;
    i.biWidth = static_cast<LONG>(w);
    i.biHeight = -static_cast<LONG>(h);
    i.biPlanes = 1;
    i.biBitCount = 32;
    f.bfType = 0x4D42;
    f.bfOffBits = sizeof f + sizeof i;
    f.bfSize = f.bfOffBits + static_cast<DWORD>(bgra.size());
    FILE* fp = _wfopen(path, L"wb");
    if (!fp) return;
    fwrite(&f, sizeof f, 1, fp);
    fwrite(&i, sizeof i, 1, fp);
    fwrite(bgra.data(), 1, bgra.size(), fp);
    fclose(fp);
}

static BYTE Clip(int v) { return static_cast<BYTE>(v < 0 ? 0 : v > 255 ? 255 : v); }

int wmain(int argc, wchar_t** argv) {
    if (argc < 3) {
        fwprintf(stderr, L"grab <dll> <out.bmp> [nv12|rgb] [w h] [frames]\n");
        return 2;
    }
    bool nv12 = argc < 4 || std::wstring(argv[3]) != L"rgb";
    UINT32 W = argc > 5 ? _wtoi(argv[4]) : 1920, H = argc > 5 ? _wtoi(argv[5]) : 1080;
    int frames = argc > 6 ? _wtoi(argv[6]) : 45;
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    MFStartup(MF_VERSION);
    HMODULE dll = LoadLibraryW(argv[1]);
    if (!dll) { fwprintf(stderr, L"LoadLibrary failed %lu\n", GetLastError()); return 1; }
    auto get = reinterpret_cast<HRESULT(WINAPI*)(REFCLSID, REFIID, void**)>(GetProcAddress(dll, "DllGetClassObject"));
    ComPtr<IClassFactory> factory;
    HRESULT hr = get(CLSID_HyphnCam, IID_PPV_ARGS(&factory));
    ComPtr<IMFActivate> act;
    if (SUCCEEDED(hr)) hr = factory->CreateInstance(nullptr, IID_PPV_ARGS(&act));
    ComPtr<IMFMediaSource> source;
    if (SUCCEEDED(hr)) hr = act->ActivateObject(IID_PPV_ARGS(&source));
    ComPtr<IMFSourceReader> reader;
    if (SUCCEEDED(hr)) hr = MFCreateSourceReaderFromMediaSource(source.Get(), nullptr, &reader);
    if (FAILED(hr)) { fwprintf(stderr, L"open failed 0x%08X\n", hr); return 1; }
    // Pick the native type that matches.
    bool found = false;
    for (DWORD i = 0; !found; i++) {
        ComPtr<IMFMediaType> t;
        if (FAILED(reader->GetNativeMediaType(0, i, &t))) break;
        GUID sub{};
        UINT32 w = 0, h = 0;
        t->GetGUID(MF_MT_SUBTYPE, &sub);
        MFGetAttributeSize(t.Get(), MF_MT_FRAME_SIZE, &w, &h);
        if (w == W && h == H && (sub == MFVideoFormat_NV12) == nv12) {
            hr = reader->SetCurrentMediaType(0, nullptr, t.Get());
            found = SUCCEEDED(hr);
        }
    }
    if (!found) { fwprintf(stderr, L"type not found 0x%08X\n", hr); return 1; }
    std::vector<BYTE> last;
    int got = 0;
    ULONGLONG t0 = GetTickCount64();
    for (int n = 0; n < frames; n++) {
        DWORD flags = 0;
        LONGLONG ts = 0;
        ComPtr<IMFSample> s;
        hr = reader->ReadSample(0, 0, nullptr, &flags, &ts, &s);
        if (FAILED(hr)) { fwprintf(stderr, L"ReadSample 0x%08X\n", hr); break; }
        if (!s) continue;
        got++;
        ComPtr<IMFMediaBuffer> b;
        s->ConvertToContiguousBuffer(&b);
        BYTE* p = nullptr;
        DWORD len = 0;
        b->Lock(&p, nullptr, &len);
        last.assign(p, p + len);
        b->Unlock();
    }
    double secs = (GetTickCount64() - t0) / 1000.0;
    wprintf(L"frames %d in %.2f s (%.1f fps), last %zu bytes\n", got, secs, got / secs, last.size());
    if (last.empty()) return 1;
    std::vector<BYTE> bgra(static_cast<size_t>(W) * H * 4);
    if (nv12) {
        // BT.709 limited range to RGB, just to look at it.
        const BYTE* Y = last.data();
        const BYTE* UV = Y + static_cast<size_t>(W) * H;
        for (UINT32 y = 0; y < H; y++)
            for (UINT32 x = 0; x < W; x++) {
                int c = Y[y * W + x] - 16, d = UV[(y / 2) * W + (x & ~1u)] - 128, e = UV[(y / 2) * W + (x & ~1u) + 1] - 128;
                BYTE* o = &bgra[(static_cast<size_t>(y) * W + x) * 4];
                o[2] = Clip((298 * c + 459 * e + 128) >> 8);
                o[1] = Clip((298 * c - 55 * d - 136 * e + 128) >> 8);
                o[0] = Clip((298 * c + 541 * d + 128) >> 8);
                o[3] = 255;
            }
    } else {
        bgra = last;
    }
    SaveBmp(argv[2], bgra, W, H);
    reader.Reset();
    source->Shutdown();
    return 0;
}
