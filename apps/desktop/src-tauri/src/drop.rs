//! Drop rules that do not depend on the network: where a photo goes (sorted
//! by its real date) and what the photos folder already holds.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

pub const MONTHS: [&str; 12] = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/// Folder for a photo taken in `year`/`month` (1-12), following the « Rangement » setting.
/// Used by the real receive (phase 2).
#[allow(dead_code)]
pub fn target_dir(base: &Path, sort: &str, year: u32, month: u32) -> PathBuf {
    match sort {
        "flat" => base.to_path_buf(),
        "year" => base.join(year.to_string()),
        _ => base.join(year.to_string()).join(format!("{month:02}")),
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
