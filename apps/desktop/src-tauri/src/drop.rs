//! Drop rules that do not depend on the network (spec `Drop - Photos vers le
//! PC`): where a photo goes (sorted by its real date), how a file is received
//! and checked, and what the photos folder already holds. The connection
//! itself is in `link`.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const MONTHS: [&str; 12] = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/// Folder for a photo taken in `year`/`month` (1-12), following the « Rangement » setting.
pub fn target_dir(base: &Path, sort: &str, year: u32, month: u32) -> PathBuf {
    match sort {
        "flat" => base.to_path_buf(),
        "year" => base.join(year.to_string()),
        _ => base.join(year.to_string()).join(format!("{month:02}")),
    }
}

/// The name sent by the iPhone, made safe for Windows: its last part only (no
/// folder, no `..`), no reserved character, never empty.
pub fn safe_name(name: &str) -> String {
    let last = name.rsplit(['/', '\\']).next().unwrap_or("");
    let clean: String = last
        .chars()
        .map(|c| if c.is_control() || "<>:\"|?*".contains(c) { '_' } else { c })
        .collect();
    let clean = clean.trim().trim_end_matches('.').trim_start_matches('.').to_string();
    if clean.is_empty() { "fichier".into() } else { clean }
}

/// `IMG_1.HEIC`, else `IMG_1 (1).HEIC`, `IMG_1 (2).HEIC`… in `dir`.
fn free_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s, format!(".{e}")),
        _ => (name, String::new()),
    };
    (1..)
        .map(|i| dir.join(format!("{stem} ({i}){ext}")))
        .find(|p| !p.exists())
        .unwrap()
}

/// One file being received: written to `<name>.part`, hashed as it comes,
/// renamed into place only if the iPhone's SHA-256 is the same (E5).
pub struct Incoming {
    part: PathBuf,
    dir: PathBuf,
    name: String,
    file: fs::File,
    hasher: Sha256,
    size: u64,
    got: u64,
    taken_unix: i64,
    /// Photos identifier of the item, empty for a file.
    pub asset_id: String,
}

impl Incoming {
    pub fn start(base: &Path, sort: &str, f: &crate::proto::DropFile) -> Result<Self, String> {
        let month = f.month.clamp(1, 12);
        // Files from the Files app have no date taken: their own folder (E9).
        let dir = if f.is_file { base.join("Fichiers") } else { target_dir(base, sort, f.year, month) };
        fs::create_dir_all(&dir).map_err(|e| format!("Dossier {} : {e}", dir.display()))?;
        let name = safe_name(&f.name);
        let part = free_path(&dir, &format!("{name}.part"));
        let file = fs::File::create(&part).map_err(|e| format!("Écriture de {name} : {e}"))?;
        Ok(Self {
            part,
            dir,
            name,
            file,
            hasher: Sha256::new(),
            size: f.size,
            got: 0,
            taken_unix: f.taken_unix,
            asset_id: f.asset_id.clone(),
        })
    }

    pub fn chunk(&mut self, data: &[u8]) -> Result<(), String> {
        self.got += data.len() as u64;
        if self.got > self.size {
            return Err(format!("{} : plus long qu’annoncé", self.name));
        }
        self.hasher.update(data);
        self.file.write_all(data).map_err(|e| format!("Écriture de {} : {e}", self.name))
    }

    /// Bytes written so far.
    pub fn received(&self) -> u64 {
        self.got
    }

    /// Checks size and hash, then puts the file in its place. On any error
    /// the `.part` is removed.
    pub fn finish(mut self, sha256: &[u8]) -> Result<PathBuf, String> {
        let check = (|| {
            self.file.flush().map_err(|e| e.to_string())?;
            if self.got != self.size {
                return Err(format!("{} : {} octets reçus sur {}", self.name, self.got, self.size));
            }
            if self.hasher.clone().finalize().as_slice() != sha256 {
                return Err(format!("{} : empreinte différente", self.name));
            }
            Ok(())
        })();
        let Incoming { part, dir, name, file, taken_unix, .. } = self;
        if taken_unix > 0 {
            // The file date is the date the photo was taken.
            let _ = file.set_modified(std::time::UNIX_EPOCH + std::time::Duration::from_secs(taken_unix as u64));
        }
        drop(file);
        if let Err(e) = check {
            let _ = fs::remove_file(&part);
            return Err(e);
        }
        let to = free_path(&dir, &name);
        fs::rename(&part, &to).map_err(|e| {
            let _ = fs::remove_file(&part);
            format!("Rangement de {name} : {e}")
        })?;
        Ok(to)
    }

    /// « Annuler » or a lost link: nothing half-written stays.
    pub fn abort(self) {
        let Incoming { part, file, .. } = self;
        drop(file);
        let _ = fs::remove_file(part);
    }
}

/// What this PC already received (spec `Drop - Photos vers le PC`, E6), kept
/// in `drop_index.json`: an item is not sent twice, a content is not stored twice.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct DropIndex {
    /// Photos identifiers of the items received whole.
    pub assets: BTreeSet<String>,
    /// SHA-256 (hex) of each file put in place, with its path.
    pub files: BTreeMap<String, String>,
}

/// Standard base64 with padding (the thumbnails shown in the window).
pub fn base64(b: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(b.len().div_ceil(3) * 4);
    for c in b.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            out.push(if i <= c.len() { A[(n >> (18 - 6 * i) & 63) as usize] as char } else { '=' });
        }
    }
    out
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

impl DropIndex {
    /// The ones not received yet, in the same order.
    pub fn missing(&self, ids: &[String]) -> Vec<String> {
        ids.iter().filter(|id| !self.assets.contains(*id)).cloned().collect()
    }

    /// This content is already in the folder (and the file is still there).
    pub fn duplicate(&self, sha256: &[u8]) -> Option<PathBuf> {
        self.files.get(&hex(sha256)).map(PathBuf::from).filter(|p| p.is_file())
    }

    pub fn add_file(&mut self, sha256: &[u8], path: &Path) {
        self.files.insert(hex(sha256), path.display().to_string());
    }

    pub fn add_asset(&mut self, id: &str) {
        if !id.is_empty() {
            self.assets.insert(id.to_string());
        }
    }
}

/// « Laisser Hyphn choisir » (ADR-0029): the fixed drive with the most free
/// space; `X:\Hyphn\Photos` when it is not the Windows drive, else
/// `Images\Hyphn`. `drives`: root and free bytes of each fixed drive.
pub fn pick_dir(drives: &[(PathBuf, u64)], system: &Path, pictures: &Path) -> PathBuf {
    let best = drives.iter().max_by_key(|(_, free)| *free).map(|(root, _)| root);
    match best {
        Some(root) if !same_drive(root, system) => root.join("Hyphn").join("Photos"),
        _ => pictures.join("Hyphn"),
    }
}

fn same_drive(a: &Path, b: &Path) -> bool {
    let first = |p: &Path| p.components().next().map(|c| c.as_os_str().to_string_lossy().to_uppercase());
    first(a) == first(b)
}

/// The folder Hyphn picks on this PC, with its free space.
pub fn suggest_dir(pictures: &Path) -> (PathBuf, Option<u64>) {
    let system = std::env::var_os("SystemDrive").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("C:"));
    let drives: Vec<(PathBuf, u64)> = sys::fixed_drives().into_iter().filter_map(|d| Some((d.clone(), sys::free_space(&d)?))).collect();
    let dir = pick_dir(&drives, &system, pictures);
    let free = free_space(&dir);
    (dir, free)
}

/// Free bytes on the disk that holds `dir` (its first existing parent).
pub fn free_space(dir: &Path) -> Option<u64> {
    let mut d = dir;
    while !d.exists() {
        d = d.parent()?;
    }
    sys::free_space(d)
}

/// The plan fits on the disk (E4), with 1 GB kept free for Windows.
pub fn check_space(dir: &Path, bytes: u64) -> Result<(), String> {
    const KEEP: u64 = 1_000_000_000;
    let Some(free) = free_space(dir) else { return Ok(()) };
    let need = bytes + KEEP;
    if free >= need {
        return Ok(());
    }
    let drive = dir.components().next().map(|c| c.as_os_str().to_string_lossy().into_owned()).unwrap_or_default();
    Err(format!("Il manque {} sur {drive}", gb(need - free)))
}

/// « 2,1 Go », « 340 Mo » (decimal units, as in the window).
pub fn gb(bytes: u64) -> String {
    if bytes >= 1_000_000_000 {
        format!("{:.1} Go", bytes as f64 / 1e9).replace('.', ",")
    } else {
        format!("{} Mo", (bytes / 1_000_000).max(1))
    }
}

#[cfg(windows)]
mod sys {
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;

    pub fn free_space(dir: &Path) -> Option<u64> {
        use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
        let w: Vec<u16> = dir.as_os_str().encode_wide().chain(Some(0)).collect();
        let mut free = 0u64;
        let ok = unsafe { GetDiskFreeSpaceExW(w.as_ptr(), &mut free, std::ptr::null_mut(), std::ptr::null_mut()) };
        (ok != 0).then_some(free)
    }

    /// `C:\`, `D:\`… for the fixed drives (no USB stick, no network drive).
    pub fn fixed_drives() -> Vec<std::path::PathBuf> {
        use windows_sys::Win32::Storage::FileSystem::{GetDriveTypeW, GetLogicalDrives};
        const DRIVE_FIXED: u32 = 3;
        let mask = unsafe { GetLogicalDrives() };
        (0..26u8)
            .filter(|i| mask & (1 << i) != 0)
            .map(|i| format!("{}:\\", (b'A' + i) as char))
            .filter(|root| {
                let w: Vec<u16> = std::ffi::OsStr::new(root).encode_wide().chain(Some(0)).collect();
                unsafe { GetDriveTypeW(w.as_ptr()) == DRIVE_FIXED }
            })
            .map(std::path::PathBuf::from)
            .collect()
    }
}

#[cfg(not(windows))]
mod sys {
    pub fn free_space(_: &std::path::Path) -> Option<u64> {
        None
    }

    pub fn fixed_drives() -> Vec<std::path::PathBuf> {
        Vec::new()
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct MonthSummary {
    pub label: String,
    pub files: u64,
    pub bytes: u64,
}

/// The last `limit` year/month folders of `base`, newest first.
pub fn summary(base: &Path, limit: usize) -> Vec<MonthSummary> {
    let mut found = Vec::new();
    for (year, ydir) in numbered_dirs(base) {
        for (month, mdir) in numbered_dirs(&ydir) {
            if (1..=12).contains(&month) {
                let (files, bytes) = count(&mdir);
                found.push((year, month, files, bytes));
            }
        }
    }
    found.sort_by_key(|f| std::cmp::Reverse((f.0, f.1)));
    found
        .into_iter()
        .take(limit)
        .map(|(y, m, files, bytes)| MonthSummary {
            label: format!("{y} › {}", MONTHS[(m - 1) as usize]),
            files,
            bytes,
        })
        .collect()
}

fn numbered_dirs(dir: &Path) -> Vec<(u32, PathBuf)> {
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new() };
    entries
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| Some((e.file_name().to_str()?.parse().ok()?, e.path())))
        .collect()
}

fn count(dir: &Path) -> (u64, u64) {
    let Ok(entries) = fs::read_dir(dir) else { return (0, 0) };
    entries
        .flatten()
        .filter_map(|e| e.metadata().ok())
        .filter(|m| m.is_file())
        .fold((0, 0), |(n, b), m| (n + 1, b + m.len()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sort_modes() {
        let base = Path::new("D:/Photos");
        assert_eq!(target_dir(base, "year_month", 2026, 10), base.join("2026").join("10"));
        assert_eq!(target_dir(base, "year", 2026, 10), base.join("2026"));
        assert_eq!(target_dir(base, "flat", 2026, 10), base.to_path_buf());
    }

    fn file(name: &str, data: &[u8]) -> crate::proto::DropFile {
        crate::proto::DropFile {
            name: name.into(),
            size: data.len() as u64,
            taken_unix: 1_790_000_000,
            year: 2026,
            month: 10,
            ..Default::default()
        }
    }

    #[test]
    fn files_from_the_files_app_go_to_their_own_folder() {
        let dir = tempfile::tempdir().unwrap();
        let f = crate::proto::DropFile { is_file: true, ..file("devis.pdf", b"pdf") };
        let mut f = Incoming::start(dir.path(), "year_month", &f).unwrap();
        f.chunk(b"pdf").unwrap();
        assert_eq!(f.finish(&Sha256::digest(b"pdf")).unwrap(), dir.path().join("Fichiers").join("devis.pdf"));
    }

    #[test]
    fn base64_as_the_browser_reads_it() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
        assert_eq!(base64(&[0xFF, 0xD8, 0x01]), "/9gB");
    }

    #[test]
    fn the_index_knows_items_and_contents() {
        let dir = tempfile::tempdir().unwrap();
        let mut ix = DropIndex::default();
        ix.add_asset("A/L0/001");
        let ids = vec!["A/L0/001".to_string(), "B/L0/001".to_string()];
        assert_eq!(ix.missing(&ids), vec!["B/L0/001".to_string()]);
        let p = dir.path().join("x.heic");
        fs::write(&p, b"x").unwrap();
        let sha = Sha256::digest(b"x");
        assert!(ix.duplicate(&sha).is_none());
        ix.add_file(&sha, &p);
        assert_eq!(ix.duplicate(&sha), Some(p.clone()));
        // Deleted by hand: it may come again.
        fs::remove_file(&p).unwrap();
        assert!(ix.duplicate(&sha).is_none());
    }

    #[test]
    fn hyphn_picks_the_roomiest_drive() {
        let pics = Path::new(r"C:\Users\Evan\Pictures");
        let c = (PathBuf::from(r"C:\"), 20u64 << 30);
        let f = (PathBuf::from(r"F:\"), 500u64 << 30);
        assert_eq!(pick_dir(&[c.clone(), f], Path::new("C:"), pics), PathBuf::from(r"F:\").join("Hyphn").join("Photos"));
        assert_eq!(pick_dir(&[c], Path::new("C:"), pics), pics.join("Hyphn"));
        assert_eq!(pick_dir(&[], Path::new("C:"), pics), pics.join("Hyphn"));
    }

    #[test]
    fn a_checked_file_lands_in_its_month() {
        let dir = tempfile::tempdir().unwrap();
        let data = b"heic bytes";
        let mut f = Incoming::start(dir.path(), "year_month", &file("IMG_1.HEIC", data)).unwrap();
        f.chunk(&data[..4]).unwrap();
        f.chunk(&data[4..]).unwrap();
        let to = f.finish(&Sha256::digest(data)).unwrap();
        assert_eq!(to, dir.path().join("2026").join("10").join("IMG_1.HEIC"));
        assert_eq!(fs::read(&to).unwrap(), data);
        // Sent again: kept beside it, never overwritten.
        let mut g = Incoming::start(dir.path(), "year_month", &file("IMG_1.HEIC", data)).unwrap();
        g.chunk(data).unwrap();
        assert_eq!(g.finish(&Sha256::digest(data)).unwrap().file_name().unwrap(), "IMG_1 (1).HEIC");
    }

    #[test]
    fn a_wrong_hash_or_size_leaves_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let month = dir.path().join("2026").join("10");
        let mut f = Incoming::start(dir.path(), "year_month", &file("a.mov", b"12345")).unwrap();
        f.chunk(b"12345").unwrap();
        assert!(f.finish(&[0u8; 32]).unwrap_err().contains("empreinte"));
        let mut g = Incoming::start(dir.path(), "year_month", &file("a.mov", b"12345")).unwrap();
        g.chunk(b"123").unwrap();
        assert!(g.finish(&Sha256::digest(b"123")).is_err());
        let mut h = Incoming::start(dir.path(), "year_month", &file("a.mov", b"12")).unwrap();
        assert!(h.chunk(b"123").is_err());
        h.abort();
        assert_eq!(fs::read_dir(&month).unwrap().count(), 0);
    }

    #[test]
    fn names_from_the_iphone_cannot_leave_the_folder() {
        assert_eq!(safe_name("IMG_0001.HEIC"), "IMG_0001.HEIC");
        assert_eq!(safe_name("../../Windows/evil.dll"), "evil.dll");
        assert_eq!(safe_name("..\\x\\a:b?.jpg"), "a_b_.jpg");
        assert_eq!(safe_name(".."), "fichier");
        assert_eq!(safe_name(""), "fichier");
    }

    #[test]
    fn a_plan_bigger_than_the_disk_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        assert!(check_space(dir.path(), 1).is_ok());
        if free_space(dir.path()).is_some() {
            assert!(check_space(dir.path(), u64::MAX / 2).unwrap_err().starts_with("Il manque"));
        }
        assert_eq!(gb(2_100_000_000), "2,1 Go");
        assert_eq!(gb(5_000_000), "5 Mo");
    }

    #[test]
    fn summary_reads_year_month_folders() {
        let dir = tempfile::tempdir().unwrap();
        let oct = target_dir(dir.path(), "year_month", 2026, 10);
        let sep = target_dir(dir.path(), "year_month", 2026, 9);
        fs::create_dir_all(&oct).unwrap();
        fs::create_dir_all(&sep).unwrap();
        fs::write(oct.join("a.heic"), [0u8; 10]).unwrap();
        fs::write(oct.join("b.heic"), [0u8; 5]).unwrap();
        fs::create_dir_all(dir.path().join("notes")).unwrap();
        let s = summary(dir.path(), 3);
        assert_eq!(s.len(), 2);
        assert_eq!(s[0], MonthSummary { label: "2026 › Octobre".into(), files: 2, bytes: 15 });
        assert_eq!(s[1].label, "2026 › Septembre");
    }
}
