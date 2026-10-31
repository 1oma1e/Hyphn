//! The Windows webcam and the OBS source (spec `Cam - Webcam Windows et OBS`).
//!
//! - `hyphn_vcam.dll` (apps/desktop-vcam) is the camera that Discord, OBS,
//!   Teams… see. Windows loads it in its Frame Server service (Local Service),
//!   so it lives in Program Files and is registered once as admin.
//! - The app creates the camera for this Windows session through the DLL
//!   (`HyphnVCamCreate`): it exists while Hyphn runs, nothing stays behind.
//! - The iPhone frames reach the DLL and the OBS plugin on a named pipe that
//!   only this user, the Frame Server and SYSTEM may open. The pipe carries the
//!   compressed stream; each reader decodes on the graphics card only while an
//!   app actually shows the camera.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::{mpsc, watch};

use crate::link::{keyed_sink, Hub};
use crate::proto;

pub const PIPE: &str = r"\\.\pipe\hyphn-vcam";
/// COM class of the camera source, registered in HKLM by `regsvr32`.
pub const CLSID: &str = "{10FA7DA4-A7FE-49E4-B4E9-1A77EDCFEB6E}";
pub const DLL: &str = "hyphn_vcam.dll";
pub const OBS_DLL: &str = "hyphn-obs.dll";

/// Pipe header, little-endian, 32 bytes (same layout in `hyphn_pipe.h`):
/// magic u32, kind u16, flags u16, len u32, width u32, height u32,
/// codec u8, key u8, reserved u16, pts_us i64.
pub const MAGIC: u32 = 0x3156_5948; // "HYV1"
pub const HEADER: usize = 32;
pub mod kind {
    /// App → reader: one Annex-B frame.
    pub const VIDEO: u16 = 1;
    /// App → reader: live, iPhone connected, languages, style, then the message.
    pub const STATE: u16 = 2;
    /// Reader → app: an app shows the camera, send frames. Flags bit 0: the
    /// reader can decode HEVC (else the iPhone switches to H.264).
    pub const HELLO: u16 = 16;
    /// Reader → app: the decoder needs a keyframe.
    pub const KEY: u16 = 17;
}
/// Longest payload a reader may send (its messages are tiny).
const MAX_IN: usize = 4096;
/// Frames waiting for one reader before it skips (and asks for a keyframe).
const QUEUE: usize = 8;

static NEXT: AtomicU64 = AtomicU64::new(0);

/// What the camera shows when there is no picture (ADR-0018).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct VcamState {
    pub live: bool,
    pub phone: bool,
    pub multi: bool,
    pub style: u8,
    pub message: String,
}

pub fn header(kind: u16, len: usize, width: u32, height: u32, codec: u8, key: bool, pts_us: i64) -> [u8; HEADER] {
    let mut h = [0u8; HEADER];
    h[0..4].copy_from_slice(&MAGIC.to_le_bytes());
    h[4..6].copy_from_slice(&kind.to_le_bytes());
    h[8..12].copy_from_slice(&(len as u32).to_le_bytes());
    h[12..16].copy_from_slice(&width.to_le_bytes());
    h[16..20].copy_from_slice(&height.to_le_bytes());
    h[20] = codec;
    h[21] = key as u8;
    h[24..32].copy_from_slice(&pts_us.to_le_bytes());
    h
}

pub fn video_bytes(f: &proto::VideoFrame) -> Vec<u8> {
    let mut out = Vec::with_capacity(HEADER + f.data.len());
    out.extend_from_slice(&header(kind::VIDEO, f.data.len(), f.width, f.height, f.codec as u8, f.keyframe, f.pts_us));
    out.extend_from_slice(&f.data);
    out
}

pub fn state_bytes(s: &VcamState) -> Vec<u8> {
    let msg: String = s.message.chars().take(60).collect();
    let mut body = vec![s.live as u8, s.phone as u8, s.multi as u8, s.style];
    body.extend_from_slice(msg.as_bytes());
    let mut out = header(kind::STATE, body.len(), 0, 0, 0, false, 0).to_vec();
    out.extend_from_slice(&body);
    out
}

/// Accepts readers (the DLL in the Frame Server, the OBS plugin) forever.
#[cfg(windows)]
pub async fn serve(hub: Arc<Hub>, state: watch::Receiver<VcamState>, readers: Arc<AtomicUsize>) {
    let mut first = true;
    loop {
        // `first_pipe_instance`: if another program already holds the name,
        // creating fails instead of joining it (no one can pose as Hyphn).
        let server = match sys::create_pipe(first) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("hyphn: webcam pipe: {e}");
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
        };
        first = false;
        if server.connect().await.is_err() {
            continue;
        }
        tokio::spawn(reader(hub.clone(), server, state.clone(), readers.clone()));
    }
}

#[cfg(windows)]
async fn reader(
    hub: Arc<Hub>,
    pipe: tokio::net::windows::named_pipe::NamedPipeServer,
    mut state: watch::Receiver<VcamState>,
    readers: Arc<AtomicUsize>,
) {
    let (mut rd, mut wr) = tokio::io::split(pipe);
    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(QUEUE);
    // Writer: the state first and whenever it changes, frames in between.
    let writer = tokio::spawn(async move {
        let first = state_bytes(&state.borrow_and_update());
        if wr.write_all(&first).await.is_err() {
            return;
        }
        loop {
            let out = tokio::select! {
                biased;
                c = state.changed() => match c {
                    Ok(()) => state_bytes(&state.borrow_and_update()),
                    Err(_) => break,
                },
                p = rx.recv() => match p {
                    Some(p) => p,
                    None => break,
                },
            };
            if wr.write_all(&out).await.is_err() {
                break;
            }
        }
    });
    let name = format!("vcam-{}", NEXT.fetch_add(1, Ordering::Relaxed));
    let mut active = false;
    let mut h = [0u8; HEADER];
    let mut body = vec![0u8; MAX_IN];
    while rd.read_exact(&mut h).await.is_ok() {
        let magic = u32::from_le_bytes(h[0..4].try_into().unwrap());
        let k = u16::from_le_bytes(h[4..6].try_into().unwrap());
        let flags = u16::from_le_bytes(h[6..8].try_into().unwrap());
        let len = u32::from_le_bytes(h[8..12].try_into().unwrap()) as usize;
        if magic != MAGIC || len > MAX_IN || rd.read_exact(&mut body[..len]).await.is_err() {
            break;
        }
        match k {
            kind::HELLO if !active => {
                active = true;
                readers.fetch_add(1, Ordering::Relaxed);
                hub.set_reader_needs_h264(&name, flags & 1 == 0);
                let t = tx.clone();
                hub.set_video_sink(&name, Some(keyed_sink(move |f| t.try_send(video_bytes(f)).is_ok())));
                hub.request_key();
            }
            kind::KEY => hub.request_key(),
            _ => {}
        }
    }
    hub.set_video_sink(&name, None);
    hub.set_reader_needs_h264(&name, false);
    if active {
        readers.fetch_sub(1, Ordering::Relaxed);
    }
    writer.abort();
}

/// SHA-256 of the DLLs this app was built with (build.rs), empty if none.
pub const VCAM_SHA256: &str = env!("HYPHN_VCAM_SHA256");
pub const OBS_SHA256: &str = env!("HYPHN_OBS_SHA256");


fn sha256_hex(path: &Path) -> Option<String> {
    use sha2::{Digest, Sha256};
    let bytes = std::fs::read(path).ok()?;
    Some(Sha256::digest(&bytes).iter().map(|x| format!("{x:02X}")).collect())
}

/// The DLLs next to the app are exactly the ones it was built with.
pub fn native_is_genuine(dir: &Path) -> bool {
    !VCAM_SHA256.is_empty() && sha256_hex(&dir.join(DLL)).as_deref() == Some(VCAM_SHA256)
}


/// Where the built DLLs are: next to the app once installed, `src-tauri/native`
/// while developing.
pub fn native_dir(resource_dir: Option<PathBuf>) -> Option<PathBuf> {
    let mut places: Vec<PathBuf> = resource_dir.into_iter().map(|d| d.join("native")).collect();
    if cfg!(debug_assertions) {
        places.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("native"));
    }
    places.into_iter().find(|d| d.join(DLL).is_file())
}

/// Where the camera DLL is registered, if it is (and the file is there).
#[cfg(windows)]
pub fn registered_dll() -> Option<PathBuf> {
    sys::registered_path(&format!(r"SOFTWARE\Classes\CLSID\{CLSID}\InprocServer32")).filter(|p| p.is_file())
}

pub fn obs_plugin_installed() -> bool {
    let base = std::env::var_os("ProgramData").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(r"C:\ProgramData"));
    // OBS loads %ProgramData%\obs-studio\plugins\<name>\bin\64bit\<name>.dll.
    base.join(r"obs-studio\plugins\hyphn-obs\bin\64bit").join(OBS_DLL).is_file()
}

pub fn obs_present() -> bool {
    let pf = std::env::var_os("ProgramFiles").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(r"C:\Program Files"));
    pf.join(r"obs-studio\bin\64bit\obs64.exe").is_file()
}

#[cfg(windows)]
pub use sys::{create_camera, remove_camera, run_elevated};

#[cfg(windows)]
mod sys {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;
    use std::path::{Path, PathBuf};
    use std::ptr::{null, null_mut};

    use tokio::net::windows::named_pipe::{NamedPipeServer, PipeMode, ServerOptions};
    use windows_sys::Win32::Foundation::{CloseHandle, LocalFree, HANDLE};
    use windows_sys::Win32::Security::Authorization::{
        ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
    };
    use windows_sys::Win32::Security::{GetTokenInformation, TokenUser, PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES, TOKEN_QUERY, TOKEN_USER};
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_DEFAULT_DIRS, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR};
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, GetExitCodeProcess, OpenProcessToken, WaitForSingleObject, INFINITE};
    use windows_sys::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE;

    use super::PIPE;

    fn wide(s: impl AsRef<std::ffi::OsStr>) -> Vec<u16> {
        s.as_ref().encode_wide().chain(Some(0)).collect()
    }

    /// SID of the user running Hyphn, as « S-1-5-21-… ».
    fn user_sid() -> std::io::Result<String> {
        unsafe {
            let mut token: HANDLE = null_mut();
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
                return Err(std::io::Error::last_os_error());
            }
            let mut len = 0u32;
            GetTokenInformation(token, TokenUser, null_mut(), 0, &mut len);
            // u64 storage: TOKEN_USER holds pointers and must be aligned.
            let mut buf = vec![0u64; (len as usize).div_ceil(8)];
            let ok = GetTokenInformation(token, TokenUser, buf.as_mut_ptr() as *mut c_void, len, &mut len);
            CloseHandle(token);
            if ok == 0 {
                return Err(std::io::Error::last_os_error());
            }
            let user = &*(buf.as_ptr() as *const TOKEN_USER);
            let mut s: *mut u16 = null_mut();
            if ConvertSidToStringSidW(user.User.Sid, &mut s) == 0 {
                return Err(std::io::Error::last_os_error());
            }
            let n = (0..).take_while(|&i| *s.add(i) != 0).count();
            let text = String::from_utf16_lossy(std::slice::from_raw_parts(s, n));
            LocalFree(s as *mut c_void);
            Ok(text)
        }
    }

    /// One pipe instance that only SYSTEM (Frame Server Monitor), Local
    /// Service (Frame Server) and this user (OBS) may open; remote clients
    /// are always refused. 0x12019b = read and write without
    /// FILE_CREATE_PIPE_INSTANCE: no service can add an instance of its own
    /// and catch the camera's connection.
    pub fn create_pipe(first: bool) -> std::io::Result<NamedPipeServer> {
        let sddl = wide(format!("D:P(A;;0x12019b;;;SY)(A;;0x12019b;;;LS)(A;;GA;;;{})", user_sid()?));
        unsafe {
            let mut sd: PSECURITY_DESCRIPTOR = null_mut();
            if ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.as_ptr(), SDDL_REVISION_1, &mut sd, null_mut()) == 0 {
                return Err(std::io::Error::last_os_error());
            }
            let mut sa = SECURITY_ATTRIBUTES {
                nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
                lpSecurityDescriptor: sd,
                bInheritHandle: 0,
            };
            let r = ServerOptions::new()
                .first_pipe_instance(first)
                .reject_remote_clients(true)
                .pipe_mode(PipeMode::Byte)
                .in_buffer_size(16 * 1024)
                .out_buffer_size(1024 * 1024)
                .create_with_security_attributes_raw(PIPE, &mut sa as *mut SECURITY_ATTRIBUTES as *mut c_void);
            LocalFree(sd);
            r
        }
    }

    pub fn registered_path(subkey: &str) -> Option<PathBuf> {
        let key = wide(subkey);
        let mut buf = vec![0u16; 1024];
        let mut size = (buf.len() * 2) as u32;
        let r = unsafe {
            RegGetValueW(HKEY_LOCAL_MACHINE, key.as_ptr(), null(), RRF_RT_REG_SZ, null_mut(), buf.as_mut_ptr() as *mut c_void, &mut size)
        };
        if r != 0 {
            return None;
        }
        let n = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        Some(PathBuf::from(String::from_utf16_lossy(&buf[..n])))
    }

    /// The loaded camera DLL (kept: the camera lives as long as Hyphn).
    static LIB: std::sync::Mutex<usize> = std::sync::Mutex::new(0);

    /// Creates the camera for this session through the DLL. The library stays
    /// loaded: the camera lives as long as Hyphn (MFVirtualCameraLifetime_Session).
    pub fn create_camera(dll: &Path) -> Result<(), String> {
        let path = wide(dll);
        let mut held = LIB.lock().unwrap_or_else(|e| e.into_inner());
        unsafe {
            let lib = LoadLibraryExW(path.as_ptr(), null_mut(), LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
            if lib.is_null() {
                return Err(format!("chargement de {} : {}", dll.display(), std::io::Error::last_os_error()));
            }
            *held = lib as usize;
            let Some(f) = GetProcAddress(lib, c"HyphnVCamCreate".as_ptr() as *const u8) else {
                return Err("HyphnVCamCreate absent de la DLL".into());
            };
            let create: unsafe extern "system" fn(*const u16) -> i32 = std::mem::transmute(f);
            let name = wide("Hyphn");
            let hr = create(name.as_ptr());
            if hr < 0 {
                return Err(format!("création de la webcam : 0x{:08X}", hr as u32));
            }
        }
        Ok(())
    }

    /// « Retirer »: the camera disappears before the DLL is unregistered.
    pub fn remove_camera() {
        let held = LIB.lock().unwrap_or_else(|e| e.into_inner());
        if *held == 0 {
            return;
        }
        unsafe {
            if let Some(f) = GetProcAddress(*held as _, c"HyphnVCamRemove".as_ptr() as *const u8) {
                let remove: unsafe extern "system" fn() -> i32 = std::mem::transmute(f);
                remove();
            }
        }
    }

    /// Relaunches this very exe as admin (one UAC prompt) with `params`, and
    /// waits for it (install.rs does the work). Ok(exit code).
    pub fn run_elevated(params: &str) -> Result<u32, String> {
        let verb = wide("runas");
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let file = wide(&exe);
        let params = wide(params);
        unsafe {
            let mut info: SHELLEXECUTEINFOW = std::mem::zeroed();
            info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
            info.fMask = SEE_MASK_NOCLOSEPROCESS;
            info.lpVerb = verb.as_ptr();
            info.lpFile = file.as_ptr();
            info.lpParameters = params.as_ptr();
            info.nShow = SW_HIDE;
            if ShellExecuteExW(&mut info) == 0 {
                return Err("installation annulée".into());
            }
            WaitForSingleObject(info.hProcess, INFINITE);
            let mut code = 1u32;
            GetExitCodeProcess(info.hProcess, &mut code);
            CloseHandle(info.hProcess);
            Ok(code)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn header_layout_matches_the_c_side() {
        let h = header(kind::VIDEO, 5, 1920, 1080, 1, true, -2);
        assert_eq!(&h[0..4], b"HYV1");
        assert_eq!(u16::from_le_bytes([h[4], h[5]]), 1);
        assert_eq!(u32::from_le_bytes(h[8..12].try_into().unwrap()), 5);
        assert_eq!(u32::from_le_bytes(h[12..16].try_into().unwrap()), 1920);
        assert_eq!((h[20], h[21]), (1, 1));
        assert_eq!(i64::from_le_bytes(h[24..32].try_into().unwrap()), -2);
    }

    #[test]
    fn state_message_is_cut_to_60_characters() {
        let s = VcamState { live: true, phone: true, multi: false, style: 2, message: "é".repeat(80) };
        let b = state_bytes(&s);
        assert_eq!(&b[HEADER..HEADER + 4], &[1, 1, 0, 2]);
        assert_eq!(String::from_utf8(b[HEADER + 4..].to_vec()).unwrap().chars().count(), 60);
        assert_eq!(u32::from_le_bytes(b[8..12].try_into().unwrap()) as usize, b.len() - HEADER);
    }
}
