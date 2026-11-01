//! The admin part of the webcam install (ADR-0022). Hyphn relaunches itself
//! as admin (one UAC prompt) with `--hyphn-install-vcam`, does this and exits
//! before any window: copy the DLLs, check their SHA-256 against the ones
//! built into the app (build.rs), register the camera class in HKLM, give the
//! OBS source to OBS. No script, nothing read from a folder the user could
//! change after the check.

use std::path::{Path, PathBuf};

use crate::vcam::{DLL, OBS_DLL};

pub const ARG: &str = "--hyphn-install-vcam";
const UNINSTALL: &str = "--uninstall";

/// Where things go. `system()` for real; tests use a temporary folder.
pub struct Roots {
    pub program_files: PathBuf,
    pub program_data: PathBuf,
}

impl Roots {
    pub fn system() -> Self {
        let env = |k: &str, d: &str| std::env::var_os(k).map(PathBuf::from).unwrap_or_else(|| PathBuf::from(d));
        Self { program_files: env("ProgramW6432", r"C:\Program Files"), program_data: env("ProgramData", r"C:\ProgramData") }
    }
    /// Its own folder: the app itself may live in Program Files\Hyphn (installer).
    pub fn webcam_dir(&self) -> PathBuf {
        self.program_files.join("Hyphn Webcam")
    }
    fn obs_exe(&self) -> PathBuf {
        self.program_files.join(r"obs-studio\bin\64bit\obs64.exe")
    }
    fn obs_plugin(&self) -> PathBuf {
        self.program_data.join(r"obs-studio\plugins\hyphn-obs")
    }
    fn logs(&self) -> PathBuf {
        self.program_data.join("Hyphn")
    }
}

/// Registers (Some(dll)) or unregisters (None) the camera class.
pub type Register<'a> = &'a dyn Fn(Option<&Path>) -> Result<(), String>;

fn sha256_hex(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let bytes = std::fs::read(path).map_err(|e| format!("lecture de {} : {e}", path.display()))?;
    Ok(Sha256::digest(&bytes).iter().map(|x| format!("{x:02X}")).collect())
}

/// A DLL in use (camera open in an app) cannot be overwritten, but it can be
/// renamed: the new one serves from the next opening.
fn retire(path: &Path) -> Option<PathBuf> {
    if !path.exists() {
        return None;
    }
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let old = PathBuf::from(format!("{}.old-{stamp}", path.display()));
    std::fs::rename(path, &old).ok().map(|_| old)
}

/// Removes the renamed DLLs that are no longer in use.
fn sweep(dir: &Path) {
    if let Ok(list) = std::fs::read_dir(dir) {
        for e in list.flatten() {
            if e.file_name().to_string_lossy().contains(".old-") {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
}

/// Copies next to the target, checks the hash, then swaps. Returns the old
/// file (renamed) so a later failure can put it back.
fn place(from: &Path, to: &Path, sha: &str) -> Result<Option<PathBuf>, String> {
    let tmp = PathBuf::from(format!("{}.new", to.display()));
    std::fs::copy(from, &tmp).map_err(|e| format!("copie de {} : {e}", from.display()))?;
    let got = sha256_hex(&tmp)?;
    if sha.is_empty() || got != sha {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("empreinte de {} : {got}, attendue {sha}", from.file_name().unwrap_or_default().to_string_lossy()));
    }
    let old = retire(to);
    if let Err(e) = std::fs::rename(&tmp, to) {
        if let Some(o) = &old {
            let _ = std::fs::rename(o, to);
        }
        return Err(format!("copie vers {} : {e}", to.display()));
    }
    Ok(old)
}

pub fn install(source: &Path, roots: &Roots, vcam_sha: &str, obs_sha: &str, register: Register) -> Result<(), String> {
    let dir = roots.webcam_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("dossier {} : {e}", dir.display()))?;
    sweep(&dir);
    let dll = dir.join(DLL);
    let old = place(&source.join(DLL), &dll, vcam_sha)?;
    if let Err(e) = register(Some(&dll)) {
        let _ = std::fs::remove_file(&dll);
        if let Some(o) = old {
            let _ = std::fs::rename(o, &dll);
        }
        return Err(format!("enregistrement : {e}"));
    }
    // Diagnostic log folder (vcam.log): only the camera service writes.
    let _ = std::fs::create_dir_all(roots.logs());
    if roots.obs_exe().is_file() && !obs_sha.is_empty() && source.join(OBS_DLL).is_file() {
        // OBS is a bonus: if it fails, the webcam stays installed.
        let bin = roots.obs_plugin().join(r"bin\64bit");
        if std::fs::create_dir_all(&bin).is_ok() {
            sweep(&bin);
            let _ = place(&source.join(OBS_DLL), &bin.join(OBS_DLL), obs_sha);
        }
    }
    Ok(())
}

pub fn uninstall(roots: &Roots, register: Register) -> Result<(), String> {
    register(None)?;
    for dir in [roots.webcam_dir(), roots.obs_plugin()] {
        for f in [dir.join(DLL), dir.join(r"bin\64bit").join(OBS_DLL)] {
            retire(&f);
        }
        sweep(&dir);
        sweep(&dir.join(r"bin\64bit"));
        // A DLL still open by an app keeps its folder until the next restart.
        let _ = std::fs::remove_dir_all(&dir);
    }
    let _ = std::fs::remove_dir_all(roots.logs());
    Ok(())
}

/// Arguments for the admin relaunch.
pub fn elevated_args(source: &Path, report: &Path, uninstall: bool) -> String {
    format!("{ARG} \"{}\" \"{}\"{}", source.display(), report.display(), if uninstall { " --uninstall" } else { "" })
}

/// When Hyphn was relaunched as admin for the install: does it and returns
/// the exit code (0 ok). None = a normal start.
pub fn elevated_main(args: &[String]) -> Option<i32> {
    if args.get(1).map(String::as_str) != Some(ARG) {
        return None;
    }
    let (Some(source), Some(report)) = (args.get(2), args.get(3)) else { return Some(2) };
    let roots = Roots::system();
    let undo = args.get(4).map(String::as_str) == Some(UNINSTALL);
    let r = if undo {
        uninstall(&roots, &sys::register)
    } else {
        install(Path::new(source), &roots, crate::vcam::VCAM_SHA256, crate::vcam::OBS_SHA256, &sys::register)
            .inspect(|_| {
                sys::protect_logs(&roots.logs());
                sys::reload_camera_service();
            })
    };
    Some(match r {
        Ok(()) => 0,
        Err(e) => {
            // Read back by the app, which shows it.
            let _ = std::fs::write(report, e);
            1
        }
    })
}

#[cfg(windows)]
mod sys {
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;
    use std::ptr::null_mut;

    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegDeleteTreeW, RegSetValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_WRITE, REG_OPTION_NON_VOLATILE, REG_SZ,
    };

    const KEY: &str = r"SOFTWARE\Classes\CLSID\{10FA7DA4-A7FE-49E4-B4E9-1A77EDCFEB6E}";

    fn wide(s: impl AsRef<std::ffi::OsStr>) -> Vec<u16> {
        s.as_ref().encode_wide().chain(Some(0)).collect()
    }

    fn set(key: &str, name: Option<&str>, value: &str) -> Result<(), String> {
        let k = wide(key);
        let mut h: HKEY = null_mut();
        unsafe {
            let r = RegCreateKeyExW(HKEY_LOCAL_MACHINE, k.as_ptr(), 0, null_mut(), REG_OPTION_NON_VOLATILE, KEY_WRITE, null_mut(), &mut h, null_mut());
            if r != 0 {
                return Err(format!("registre {key} : erreur {r}"));
            }
            let v = wide(value);
            let n = name.map(wide);
            let r = RegSetValueExW(h, n.as_ref().map_or(std::ptr::null(), |n| n.as_ptr()), 0, REG_SZ, v.as_ptr() as *const u8, (v.len() * 2) as u32);
            RegCloseKey(h);
            if r != 0 {
                return Err(format!("registre {key} : erreur {r}"));
            }
        }
        Ok(())
    }

    /// What DllRegisterServer does, in HKLM (the camera service must find it).
    pub fn register(dll: Option<&Path>) -> Result<(), String> {
        match dll {
            Some(dll) => {
                set(KEY, None, "Hyphn")?;
                set(&format!(r"{KEY}\InprocServer32"), None, &dll.display().to_string())?;
                set(&format!(r"{KEY}\InprocServer32"), Some("ThreadingModel"), "Both")
            }
            None => {
                let k = wide(KEY);
                let r = unsafe { RegDeleteTreeW(HKEY_LOCAL_MACHINE, k.as_ptr()) };
                if r == 0 || r == 2 { Ok(()) } else { Err(format!("registre : erreur {r}")) }
            }
        }
    }

    /// Log folder: SYSTEM and admins full, Local Service (camera) writes,
    /// users read.
    pub fn protect_logs(dir: &Path) {
        let root = std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into());
        let _ = std::process::Command::new(Path::new(&root).join(r"System32\icacls.exe"))
            .arg(dir)
            .args(["/inheritance:r", "/grant:r", "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F", "*S-1-5-19:(OI)(CI)M", "*S-1-5-32-545:(OI)(CI)RX"])
            .output();
    }

    /// The camera service (Frame Server) keeps the DLL it loaded until it
    /// stops: an update would show only after a restart of Windows. Stopping
    /// it is enough, Windows starts it again when an app opens a camera.
    pub fn reload_camera_service() {
        use windows_sys::Win32::System::Services::{
            CloseServiceHandle, ControlService, OpenSCManagerW, OpenServiceW, QueryServiceStatus, SC_MANAGER_CONNECT, SERVICE_CONTROL_STOP,
            SERVICE_QUERY_STATUS, SERVICE_STATUS, SERVICE_STOP, SERVICE_STOPPED,
        };
        let name = wide("FrameServer");
        unsafe {
            let scm = OpenSCManagerW(std::ptr::null(), std::ptr::null(), SC_MANAGER_CONNECT);
            if scm.is_null() {
                return;
            }
            let svc = OpenServiceW(scm, name.as_ptr(), SERVICE_STOP | SERVICE_QUERY_STATUS);
            if !svc.is_null() {
                let mut st: SERVICE_STATUS = std::mem::zeroed();
                if ControlService(svc, SERVICE_CONTROL_STOP, &mut st) != 0 {
                    // Up to 5 s, so the next camera opened gets the new DLL.
                    for _ in 0..50 {
                        if QueryServiceStatus(svc, &mut st) == 0 || st.dwCurrentState == SERVICE_STOPPED {
                            break;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                }
                CloseServiceHandle(svc);
            }
            CloseServiceHandle(scm);
        }
    }
}

#[cfg(not(windows))]
mod sys {
    use std::path::Path;
    pub fn register(_: Option<&Path>) -> Result<(), String> {
        Err("Windows seulement".into())
    }
    pub fn protect_logs(_: &Path) {}
    pub fn reload_camera_service() {}
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn setup() -> (tempfile::TempDir, PathBuf, Roots, String, String) {
        let t = tempfile::tempdir().unwrap();
        let src = t.path().join("native");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(src.join(DLL), b"camera").unwrap();
        std::fs::write(src.join(OBS_DLL), b"obs").unwrap();
        let roots = Roots { program_files: t.path().join("pf"), program_data: t.path().join("pd") };
        std::fs::create_dir_all(roots.obs_exe().parent().unwrap()).unwrap();
        std::fs::write(roots.obs_exe(), b"").unwrap();
        let vcam = sha256_hex(&src.join(DLL)).unwrap();
        let obs = sha256_hex(&src.join(OBS_DLL)).unwrap();
        (t, src, roots, vcam, obs)
    }

    #[test]
    fn installs_the_webcam_and_the_obs_source() {
        let (_t, src, roots, vcam, obs) = setup();
        let seen = RefCell::new(None);
        install(&src, &roots, &vcam, &obs, &|d| {
            *seen.borrow_mut() = d.map(Path::to_path_buf);
            Ok(())
        })
        .unwrap();
        let dll = roots.webcam_dir().join(DLL);
        assert_eq!(std::fs::read(&dll).unwrap(), b"camera");
        assert_eq!(seen.into_inner(), Some(dll));
        assert!(roots.obs_plugin().join(r"bin\64bit").join(OBS_DLL).is_file());
    }

    #[test]
    fn a_swapped_dll_is_never_registered() {
        let (_t, src, roots, _vcam, obs) = setup();
        let registered = RefCell::new(false);
        let e = install(&src, &roots, &"0".repeat(64), &obs, &|_| {
            *registered.borrow_mut() = true;
            Ok(())
        })
        .unwrap_err();
        assert!(e.contains("empreinte"), "{e}");
        assert!(!*registered.borrow());
        assert!(!roots.webcam_dir().join(DLL).exists());
    }

    #[test]
    fn a_failed_registration_puts_the_old_dll_back() {
        let (_t, src, roots, vcam, obs) = setup();
        install(&src, &roots, &vcam, &obs, &|_| Ok(())).unwrap();
        std::fs::write(src.join(DLL), b"camera v2").unwrap();
        let v2 = sha256_hex(&src.join(DLL)).unwrap();
        assert!(install(&src, &roots, &v2, &obs, &|_| Err("refusé".into())).is_err());
        assert_eq!(std::fs::read(roots.webcam_dir().join(DLL)).unwrap(), b"camera");
    }

    #[test]
    fn uninstall_removes_everything() {
        let (_t, src, roots, vcam, obs) = setup();
        install(&src, &roots, &vcam, &obs, &|_| Ok(())).unwrap();
        uninstall(&roots, &|d| {
            assert!(d.is_none());
            Ok(())
        })
        .unwrap();
        assert!(!roots.webcam_dir().exists());
        assert!(!roots.obs_plugin().exists());
    }

    #[test]
    fn only_the_install_argument_starts_the_admin_part() {
        assert_eq!(elevated_main(&["hyphn".into()]), None);
        assert_eq!(elevated_main(&["hyphn".into(), ARG.into()]), Some(2));
        assert!(elevated_args(Path::new(r"C:\a b"), Path::new(r"C:\r.log"), true).ends_with(r#""C:\a b" "C:\r.log" --uninstall"#));
    }
}
