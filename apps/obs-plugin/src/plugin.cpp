// hyphn-obs.dll: the « Hyphn » source in OBS (spec `Cam - Webcam Windows et
// OBS`, E7). Same pipe and same picture as the Windows webcam (feed.cpp), at
// the iPhone's own size, straight into OBS without the Frame Server.
//
// libobs is not needed to build: the few declarations below follow the OBS
// 32 headers (libobs/obs-source.h, obs.h, media-io/video-io.h), and obs.lib is
// made from obs.def. obs_register_source_s takes the size of our structure,
// so OBS accepts this shorter obs_source_info.

#include <windows.h>

#include <atomic>
#include <cstdint>
#include <thread>
#include <vector>

#include "feed.h"

extern "C" {
struct obs_source;
struct obs_data;
struct obs_module;

enum { OBS_SOURCE_TYPE_INPUT = 0 };
constexpr uint32_t OBS_SOURCE_VIDEO = 1 << 0;
constexpr uint32_t OBS_SOURCE_ASYNC = 1 << 2;
constexpr uint32_t OBS_SOURCE_DO_NOT_DUPLICATE = 1 << 7;
enum { VIDEO_FORMAT_NV12 = 2 };
enum { VIDEO_CS_709 = 2 };
enum { VIDEO_RANGE_PARTIAL = 1 };

// The first fields of struct obs_source_info (OBS 32).
struct obs_source_info {
    const char* id;
    int type;
    uint32_t output_flags;
    const char* (*get_name)(void* type_data);
    void* (*create)(obs_data* settings, obs_source* source);
    void (*destroy)(void* data);
    uint32_t (*get_width)(void* data);
    uint32_t (*get_height)(void* data);
    void (*get_defaults)(obs_data* settings);
    void* (*get_properties)(void* data);
    void (*update)(void* data, obs_data* settings);
    void (*activate)(void* data);
    void (*deactivate)(void* data);
    void (*show)(void* data);
    void (*hide)(void* data);
};

struct obs_source_frame2 {
    uint8_t* data[8];
    uint32_t linesize[8];
    uint32_t width;
    uint32_t height;
    uint64_t timestamp;
    int format;
    int range;
    float color_matrix[16];
    float color_range_min[3];
    float color_range_max[3];
    bool flip;
    uint8_t flags;
    uint8_t trc;
};

__declspec(dllimport) void obs_register_source_s(const obs_source_info* info, size_t size);
__declspec(dllimport) void obs_source_output_video2(obs_source* source, const obs_source_frame2* frame);
__declspec(dllimport) bool video_format_get_parameters_for_format(int cs, int range, int format, float matrix[16], float min_range[3],
                                                                  float max_range[3]);
__declspec(dllimport) uint64_t os_gettime_ns(void);
}

static HMODULE g_module = nullptr;
static obs_module* g_obs_module = nullptr;

namespace {

struct Source {
    obs_source* obs = nullptr;
    hyphn::Feed feed{g_module};
    std::thread thread;
    std::atomic<bool> stop{false};
    std::atomic<bool> shown{false};
    HANDLE stopEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    HANDLE showEvent = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    std::vector<BYTE> buf;

    // Decodes only while the source is visible somewhere in OBS (spec E3).
    void Run() {
        CoInitializeEx(nullptr, COINIT_MULTITHREADED);
        obs_source_frame2 f{};
        f.format = VIDEO_FORMAT_NV12;
        f.range = VIDEO_RANGE_PARTIAL;
        video_format_get_parameters_for_format(VIDEO_CS_709, VIDEO_RANGE_PARTIAL, VIDEO_FORMAT_NV12, f.color_matrix, f.color_range_min,
                                               f.color_range_max);
        bool feeding = false;
        while (!stop) {
            if (!shown) {
                if (feeding) feed.Stop();
                feeding = false;
                HANDLE idle[] = {stopEvent, showEvent};
                WaitForMultipleObjects(2, idle, FALSE, INFINITE);
                continue;
            }
            if (!feeding) {
                if (FAILED(feed.Start(1920, 1080))) hyphn::Log("obs: no graphics device");
                feeding = true;
            }
            // A new iPhone picture, or the next waiting screen frame (30 fps).
            HANDLE w[] = {stopEvent, showEvent, feed.FrameEvent()};
            if (WaitForMultipleObjects(3, w, FALSE, 33) == WAIT_OBJECT_0) break;
            // The iPhone picture at its own size, or the waiting screen in 1080p.
            UINT32 width = 1920, height = 1080;
            if (feed.HasLiveVideo()) {
                UINT32 vw = 0, vh = 0;
                feed.VideoSize(&vw, &vh);
                if (vw >= 2 && vh >= 2) {
                    width = vw & ~1u;
                    height = vh & ~1u;
                }
            }
            buf.resize(static_cast<size_t>(width) * height * 3 / 2);
            bool video = false;
            if (FAILED(feed.Fill(buf.data(), static_cast<LONG>(width), width, height, hyphn::Pixel::NV12, &video))) continue;
            f.data[0] = buf.data();
            f.data[1] = buf.data() + static_cast<size_t>(width) * height;
            f.linesize[0] = width;
            f.linesize[1] = width;
            f.width = width;
            f.height = height;
            f.timestamp = os_gettime_ns();
            obs_source_output_video2(obs, &f);
        }
        if (feeding) feed.Stop();
        CoUninitialize();
    }
};

const char* GetName(void*) { return "Hyphn (iPhone)"; }

void* Create(obs_data*, obs_source* obs) {
    auto* s = new Source();
    s->obs = obs;
    s->thread = std::thread([s] { s->Run(); });
    return s;
}

void Destroy(void* data) {
    auto* s = static_cast<Source*>(data);
    s->stop = true;
    SetEvent(s->stopEvent);
    if (s->thread.joinable()) s->thread.join();
    CloseHandle(s->stopEvent);
    CloseHandle(s->showEvent);
    delete s;
}

void Show(void* data) {
    auto* s = static_cast<Source*>(data);
    s->shown = true;
    SetEvent(s->showEvent);
}

void Hide(void* data) {
    auto* s = static_cast<Source*>(data);
    s->shown = false;
    SetEvent(s->showEvent);
}

}  // namespace

BOOL APIENTRY DllMain(HMODULE module, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) {
        g_module = module;
        DisableThreadLibraryCalls(module);
    }
    return TRUE;
}

// OBS_DECLARE_MODULE()
extern "C" __declspec(dllexport) void obs_module_set_pointer(obs_module* module) { g_obs_module = module; }
extern "C" __declspec(dllexport) obs_module* obs_current_module(void) { return g_obs_module; }
extern "C" __declspec(dllexport) uint32_t obs_module_ver(void) { return (32u << 24) | (0u << 16) | 1u; }
extern "C" __declspec(dllexport) const char* obs_module_name(void) { return "Hyphn"; }
extern "C" __declspec(dllexport) const char* obs_module_description(void) { return "iPhone camera from the Hyphn app"; }

extern "C" __declspec(dllexport) bool obs_module_load(void) {
    static obs_source_info info{};
    info.id = "hyphn_iphone";
    info.type = OBS_SOURCE_TYPE_INPUT;
    info.output_flags = OBS_SOURCE_VIDEO | OBS_SOURCE_ASYNC | OBS_SOURCE_DO_NOT_DUPLICATE;
    info.get_name = GetName;
    info.create = Create;
    info.destroy = Destroy;
    info.show = Show;
    info.hide = Hide;
    obs_register_source_s(&info, sizeof info);
    return true;
}
