//! Offline translation of the waiting message (ADR-0033). Firefox's Bergamot
//! engine runs in the window (WebAssembly, `ui/translate-worker.js`); this side
//! fetches the engine and the language models once from Mozilla's public
//! servers, checks both hashes Mozilla publishes, and keeps them on disk. Only
//! public files are downloaded: the message itself never leaves the PC.

use std::collections::{BTreeMap, BTreeSet};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const RECORDS: &str = "https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/";
const CDN: &str = "https://firefox-settings-attachments.cdn.mozilla.net/";
const MODELS: &str = "translations-models-v2";
const ENGINE: &str = "translations-wasm-v2";
/// One download or clean-up at a time: two would touch the same files.
static ONE: std::sync::Mutex<()> = std::sync::Mutex::new(());
/// The message is typed in French; other languages go through English.
pub const SOURCE: &str = "fr";
const PIVOT: &str = "en";

#[derive(Debug, Clone, Deserialize, Serialize)]
struct Records {
    data: Vec<Record>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct Record {
    name: String,
    version: String,
    #[serde(rename = "fileType", default)]
    file_type: String,
    #[serde(rename = "sourceLanguage", default)]
    source: String,
    #[serde(rename = "targetLanguage", default)]
    target: String,
    #[serde(rename = "decompressedHash")]
    decompressed_hash: String,
    #[serde(default)]
    filter_expression: String,
    attachment: Attachment,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct Attachment {
    hash: String,
    size: u64,
    location: String,
}

/// One file for the window: its kind (model, lex, vocab…), its name and where it is.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct File {
    pub kind: String,
    pub name: String,
    pub path: String,
}

/// What the window loads: the engine, then one model per pair ("fr-en", "en-de"…).
#[derive(Debug, Clone, Serialize)]
pub struct Plan {
    pub wasm: String,
    pub pairs: BTreeMap<String, Vec<File>>,
}

/// Mozilla's code for a language of the waiting screen.
fn code(lang: &str) -> &str {
    match lang {
        "zh" => "zh-Hans",
        l => l,
    }
}

/// The pairs needed to go from French to each language: fr→en, then en→X.
pub fn pairs_for(langs: &[String]) -> BTreeSet<(String, String)> {
    let mut out = BTreeSet::new();
    for l in langs {
        if l == SOURCE {
            continue;
        }
        out.insert((SOURCE.to_string(), PIVOT.to_string()));
        if l != PIVOT {
            out.insert((PIVOT.to_string(), code(l).to_string()));
        }
    }
    out
}

fn version(v: &str) -> (u32, u32) {
    let mut it = v.split('.').map(|x| x.parse().unwrap_or(0));
    (it.next().unwrap_or(0), it.next().unwrap_or(0))
}

/// Records Firefox on a PC would use: no filter, or « not Android ».
fn for_desktop(r: &Record) -> bool {
    r.filter_expression.is_empty() || r.filter_expression == "env.appinfo.OS != 'Android'"
}

/// A set of files a model can run with: the model and its vocabulary
/// (one shared file, or one per language).
fn whole_set(rs: &[Record]) -> bool {
    let has = |k: &str| rs.iter().any(|r| r.file_type == k);
    has("model") && (has("vocab") || (has("srcvocab") && has("trgvocab")))
}

/// The newest whole set of files for one pair, all of one version (the kinds
/// of files change between versions): a PC one first, else Android's, since
/// Mozilla sometimes lists a PC model without its vocabulary (English → Russian
/// 3.0, 2026-11-16). Empty when the pair has no whole set.
fn pick(records: &[Record], from: &str, to: &str) -> Vec<Record> {
    let mut sets: BTreeMap<(bool, (u32, u32)), BTreeMap<&str, &Record>> = BTreeMap::new();
    for r in records.iter().filter(|r| r.source == from && r.target == to) {
        sets.entry((for_desktop(r), version(&r.version))).or_default().entry(r.file_type.as_str()).or_insert(r);
    }
    sets.into_values()
        .rev()
        .map(|set| set.into_values().cloned().collect::<Vec<_>>())
        .find(|set| whole_set(set))
        .unwrap_or_default()
}

/// The files of one pair to use: a whole set already on disk, so a newer
/// version published by Mozilla never makes an installed language download
/// again; else the newest (to download).
fn choose(dir: &Path, records: &[Record], from: &str, to: &str) -> Vec<Record> {
    let on_disk: Vec<Record> = records.iter().filter(|r| local(dir, r).exists()).cloned().collect();
    let have = pick(&on_disk, from, to);
    if have.is_empty() { pick(records, from, to) } else { have }
}

/// The engine: the newest one on disk, else the newest published.
fn engine(dir: &Path, records: &[Record]) -> Option<Record> {
    let all: Vec<&Record> = records.iter().filter(|r| r.name == "bergamot-translator" && for_desktop(r)).collect();
    let newest = |on_disk: bool| {
        all.iter().filter(|r| !on_disk || local(dir, r).exists()).max_by_key(|r| version(&r.version)).map(|r| (*r).clone())
    };
    newest(true).or_else(|| newest(false))
}

/// The lists in hand plus Mozilla's new ones: older records stay known, so
/// the files they name on disk still count.
fn merge(old: Vec<Record>, new: Vec<Record>) -> Vec<Record> {
    let mut seen = BTreeSet::new();
    new.into_iter().chain(old).filter(|r| seen.insert((r.name.clone(), r.decompressed_hash.clone()))).collect()
}

fn sha256_hex(b: &[u8]) -> String {
    Sha256::digest(b).iter().map(|x| format!("{x:02x}")).collect()
}

/// A file is kept under its checked hash: a newer model never mixes with an older one.
fn local(dir: &Path, r: &Record) -> PathBuf {
    dir.join(format!("{}-{}", &r.decompressed_hash[..16], r.name))
}

/// A download; `on(bytes so far)` while it comes, for a smooth progress bar.
fn get(url: &str, limit: u64, mut on: impl FnMut(u64)) -> Result<Vec<u8>, String> {
    let agent = ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(10)).timeout_read(Duration::from_secs(60)).build();
    let resp = agent.get(url).call().map_err(|e| format!("téléchargement impossible ({e})"))?;
    let mut out = Vec::new();
    let mut rd = resp.into_reader().take(limit);
    let mut buf = vec![0u8; 256 << 10];
    loop {
        let n = rd.read(&mut buf).map_err(|e| format!("téléchargement coupé ({e})"))?;
        if n == 0 {
            break;
        }
        out.extend_from_slice(&buf[..n]);
        on(out.len() as u64);
    }
    Ok(out)
}

fn records(dir: &Path, collection: &str, fresh: bool) -> Result<Vec<Record>, String> {
    let cache = dir.join(format!("{collection}.json"));
    let cached = std::fs::read(&cache).ok().and_then(|b| serde_json::from_slice::<Records>(&b).ok());
    if !fresh {
        if let Some(r) = cached {
            return Ok(r.data);
        }
    }
    let body = get(&format!("{RECORDS}{collection}/records"), 32 << 20, |_| {})?;
    let r: Records = serde_json::from_slice(&body).map_err(|e| format!("liste de Mozilla illisible ({e})"))?;
    let all = Records { data: merge(cached.map(|c| c.data).unwrap_or_default(), r.data) };
    std::fs::write(&cache, serde_json::to_vec(&all).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(all.data)
}

/// Downloads one file, checks the published hash of the download and of the
/// unpacked file, then keeps it.
fn fetch(dir: &Path, r: &Record, on: impl FnMut(u64)) -> Result<(), String> {
    let packed = get(&format!("{CDN}{}", r.attachment.location), r.attachment.size + 1, on)?;
    if packed.len() as u64 != r.attachment.size || sha256_hex(&packed) != r.attachment.hash {
        return Err(format!("{} : fichier abîmé pendant le téléchargement", r.name));
    }
    let mut out = Vec::new();
    ruzstd::decoding::StreamingDecoder::new(packed.as_slice())
        .map_err(|e| e.to_string())?
        .read_to_end(&mut out)
        .map_err(|e| e.to_string())?;
    if sha256_hex(&out) != r.decompressed_hash {
        return Err(format!("{} : contenu différent de celui publié par Mozilla", r.name));
    }
    let path = local(dir, r);
    let tmp = path.with_extension("part");
    std::fs::write(&tmp, &out).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// What is needed for `langs`, from the lists in hand.
fn plan_from(dir: &Path, models: &[Record], engines: &[Record], langs: &[String]) -> Result<(Plan, Vec<Record>), String> {
    let wasm = engine(dir, engines).ok_or("moteur de traduction introuvable chez Mozilla")?;
    let mut need = vec![wasm.clone()];
    let mut pairs = BTreeMap::new();
    for (from, to) in pairs_for(langs) {
        let files = choose(dir, models, &from, &to);
        if !files.iter().any(|r| r.file_type == "model") {
            // A language without a model keeps the user's text (ADR-0033).
            continue;
        }
        let list = files
            .iter()
            .map(|r| File { kind: r.file_type.clone(), name: r.name.clone(), path: local(dir, r).display().to_string() })
            .collect();
        need.extend(files);
        pairs.insert(format!("{from}-{to}"), list);
    }
    let plan = Plan { wasm: local(dir, &wasm).display().to_string(), pairs };
    let missing = need.into_iter().filter(|r| !local(dir, r).exists()).collect();
    Ok((plan, missing))
}

/// Everything for translating into `langs`, downloaded the first time only.
/// `progress(done, total)` in bytes.
pub fn prepare(dir: &Path, langs: &[String], progress: impl Fn(u64, u64)) -> Result<Plan, String> {
    let _one = ONE.lock().unwrap_or_else(|e| e.into_inner());
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let (mut plan, mut missing) = plan_from(dir, &records(dir, MODELS, false)?, &records(dir, ENGINE, false)?, langs)?;
    if !missing.is_empty() {
        // Something to download: take Mozilla's current lists first.
        (plan, missing) = plan_from(dir, &records(dir, MODELS, true)?, &records(dir, ENGINE, true)?, langs)?;
    }
    let total: u64 = missing.iter().map(|r| r.attachment.size).sum();
    let mut done = 0;
    progress(done, total);
    for r in &missing {
        fetch(dir, r, |n| progress(done + n, total))?;
        done += r.attachment.size;
        progress(done, total);
    }
    Ok(plan)
}

/// The files for `langs` as they are on disk, nothing downloaded (the window
/// translates with what is installed).
pub fn plan(dir: &Path, langs: &[String]) -> Result<Plan, String> {
    let (plan, missing) = plan_from(dir, &records(dir, MODELS, false)?, &records(dir, ENGINE, false)?, langs)?;
    if missing.is_empty() {
        Ok(plan)
    } else {
        Err("langue pas encore installée".into())
    }
}

/// The language of the waiting screen behind one of Mozilla's codes.
fn lang_of(code: &str) -> String {
    match code {
        "zh-Hans" => "zh".into(),
        c => c.into(),
    }
}

/// Languages whose files are all on disk, read from the disk itself (the app
/// may have been closed in the middle of a download). No network.
pub fn installed(dir: &Path) -> Vec<String> {
    let (Ok(models), Ok(engines)) = (records(dir, MODELS, false), records(dir, ENGINE, false)) else {
        return vec![];
    };
    let whole = |rs: &[Record]| rs.iter().any(|r| r.file_type == "model") && rs.iter().all(|r| local(dir, r).exists());
    if !engine(dir, &engines).is_some_and(|w| local(dir, &w).exists()) || !whole(&choose(dir, &models, SOURCE, PIVOT)) {
        return vec![];
    }
    let targets: BTreeSet<&str> = models.iter().filter(|r| r.source == PIVOT).map(|r| r.target.as_str()).collect();
    std::iter::once(PIVOT.to_string())
        .chain(targets.into_iter().filter(|t| whole(&choose(dir, &models, PIVOT, t))).map(lang_of))
        .collect()
}

/// Languages Mozilla has a model for, from the list on disk (empty before the
/// first download): the others keep the typed text and are never fetched.
pub fn known(dir: &Path) -> Vec<String> {
    let Ok(models) = records(dir, MODELS, false) else {
        return vec![];
    };
    let targets: BTreeSet<&str> = models.iter().filter(|r| r.source == PIVOT).map(|r| r.target.as_str()).collect();
    let mut out: BTreeSet<String> = targets.into_iter().filter(|t| !pick(&models, PIVOT, t).is_empty()).map(lang_of).collect();
    if !pick(&models, SOURCE, PIVOT).is_empty() {
        out.insert(PIVOT.to_string());
    }
    out.into_iter().collect()
}

/// Uninstalls one language: its files leave the disk. English, the way to
/// every other language, goes (with the engine) only once it is the last one.
/// Returns the bytes freed.
pub fn remove(dir: &Path, lang: &str) -> Result<u64, String> {
    let _one = ONE.lock().unwrap_or_else(|e| e.into_inner());
    let (Ok(models), Ok(engines)) = (records(dir, MODELS, false), records(dir, ENGINE, false)) else {
        return Ok(0);
    };
    // Every version on disk goes, not only the one in use.
    let pair = |from: &str, to: &str| models.iter().filter(|r| r.source == from && r.target == to).cloned().collect::<Vec<_>>();
    let files = if lang == PIVOT {
        if installed(dir).len() > 1 {
            return Ok(0);
        }
        let mut f = pair(SOURCE, PIVOT);
        f.extend(engines.iter().filter(|r| r.name == "bergamot-translator").cloned());
        f
    } else {
        pair(PIVOT, code(lang))
    };
    let mut freed = 0;
    for r in files {
        let p = local(dir, &r);
        let len = std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
        if std::fs::remove_file(&p).is_ok() {
            freed += len;
        }
    }
    Ok(freed)
}

/// Leftovers of a download stopped with the app.
pub fn clean(dir: &Path) {
    let _one = ONE.lock().unwrap_or_else(|e| e.into_inner());
    for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        if e.path().extension().is_some_and(|x| x == "part") {
            let _ = std::fs::remove_file(e.path());
        }
    }
}

/// Only files of the translation folder can be read by the window.
pub fn read(dir: &Path, path: &str) -> Result<Vec<u8>, String> {
    let p = PathBuf::from(path);
    if p.parent() != Some(dir) || p.extension().is_some_and(|e| e == "part" || e == "json") {
        return Err("fichier hors du dossier de traduction".into());
    }
    std::fs::read(&p).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec(name: &str, kind: &str, v: &str, from: &str, to: &str, filter: &str) -> Record {
        Record {
            name: name.into(),
            version: v.into(),
            file_type: kind.into(),
            source: from.into(),
            target: to.into(),
            decompressed_hash: format!("{:0<64}", name.len()),
            filter_expression: filter.into(),
            attachment: Attachment { hash: String::new(), size: 10, location: String::new() },
        }
    }

    #[test]
    fn french_goes_through_english() {
        let langs: Vec<String> = ["fr", "en", "de", "zh"].iter().map(|s| s.to_string()).collect();
        let p: Vec<_> = pairs_for(&langs).into_iter().collect();
        assert_eq!(p, vec![("en".into(), "de".into()), ("en".into(), "zh-Hans".into()), ("fr".into(), "en".into())]);
    }

    #[test]
    fn newest_desktop_files_are_picked() {
        let r = vec![
            rec("model.ende.old", "model", "2.0", "en", "de", ""),
            rec("model.ende.new", "model", "3.0", "en", "de", ""),
            rec("model.ende.android", "model", "3.1", "en", "de", "env.appinfo.OS == 'Android'"),
            rec("vocab.ende", "vocab", "3.0", "en", "de", "env.appinfo.OS != 'Android'"),
        ];
        let names: Vec<_> = pick(&r, "en", "de").into_iter().map(|r| r.name).collect();
        assert_eq!(names, vec!["model.ende.new", "vocab.ende"]);
    }

    #[test]
    fn a_pc_model_without_vocabulary_takes_the_whole_android_set() {
        let android = "env.appinfo.OS == 'Android'";
        let pc = "env.appinfo.OS != 'Android'";
        let r = vec![
            rec("model.enru.3.0", "model", "3.0", "en", "ru", pc),
            rec("lex.enru.3.0", "lex", "3.0", "en", "ru", pc),
            rec("model.enru.3.1", "model", "3.1", "en", "ru", android),
            rec("lex.enru.3.1", "lex", "3.1", "en", "ru", android),
            rec("vocab.enru.3.1", "vocab", "3.1", "en", "ru", android),
        ];
        let names: Vec<_> = pick(&r, "en", "ru").into_iter().map(|r| r.name).collect();
        assert_eq!(names, vec!["lex.enru.3.1", "model.enru.3.1", "vocab.enru.3.1"]);
    }

    #[test]
    fn files_of_two_versions_are_never_mixed() {
        let r = vec![
            rec("model.enja.1", "model", "1.0", "en", "ja", ""),
            rec("vocab.enja.1", "vocab", "1.0", "en", "ja", ""),
            rec("model.enja.2", "model", "2.0", "en", "ja", ""),
            rec("srcvocab.enja.2", "srcvocab", "2.0", "en", "ja", ""),
            rec("trgvocab.enja.2", "trgvocab", "2.0", "en", "ja", ""),
        ];
        let names: Vec<_> = pick(&r, "en", "ja").into_iter().map(|r| r.name).collect();
        assert_eq!(names, vec!["model.enja.2", "srcvocab.enja.2", "trgvocab.enja.2"]);
        // Nothing whole: nothing picked, the language keeps the typed text.
        assert!(pick(&r[2..3], "en", "ja").is_empty());
    }

    #[test]
    fn installed_is_read_from_the_disk_and_remove_really_deletes() {
        let dir = std::env::temp_dir().join("hyphn-translate-remove");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mut r = vec![
            rec("bergamot-translator", "", "4.0", "", "", ""),
            rec("model.fren", "model", "3.0", "fr", "en", ""),
            rec("model.ende", "model", "3.0", "en", "de", ""),
            rec("vocab.ende", "vocab", "3.0", "en", "de", ""),
            rec("model.enzh", "model", "3.0", "en", "zh-Hans", ""),
            rec("vocab.enzh", "vocab", "3.0", "en", "zh-Hans", ""),
            rec("vocab.fren", "vocab", "3.0", "fr", "en", ""),
        ];
        for (i, x) in r.iter_mut().enumerate() {
            x.decompressed_hash = format!("{i:0>64}");
            std::fs::write(local(&dir, x), b"12345").unwrap();
        }
        let json = |d: &[Record]| serde_json::to_vec(&Records { data: d.to_vec() }).unwrap();
        std::fs::write(dir.join(format!("{ENGINE}.json")), json(&r[..1])).unwrap();
        std::fs::write(dir.join(format!("{MODELS}.json")), json(&r[1..])).unwrap();
        assert_eq!(installed(&dir), vec!["en", "de", "zh"]);
        // A file missing (app closed mid-download): that language is not installed.
        std::fs::remove_file(local(&dir, &r[3])).unwrap();
        assert_eq!(installed(&dir), vec!["en", "zh"]);
        // Removing Chinese deletes its file; English stays while it is needed.
        assert_eq!(remove(&dir, "zh").unwrap(), 10);
        assert!(!local(&dir, &r[4]).exists());
        assert_eq!(remove(&dir, "de").unwrap(), 5);
        assert_eq!(installed(&dir), vec!["en"]);
        // The last one: English and the engine go too.
        assert_eq!(remove(&dir, "en").unwrap(), 15);
        assert!(installed(&dir).is_empty());
        assert!(plan(&dir, &["de".to_string()]).is_err());
    }

    #[test]
    fn a_newer_version_at_mozilla_does_not_download_again() {
        let dir = std::env::temp_dir().join("hyphn-translate-newer");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mut old = vec![
            rec("bergamot-translator", "", "4.0", "", "", ""),
            rec("model.fren", "model", "3.0", "fr", "en", ""),
            rec("model.ende", "model", "3.0", "en", "de", ""),
            rec("vocab.ende", "vocab", "3.0", "en", "de", ""),
            rec("vocab.fren", "vocab", "3.0", "fr", "en", ""),
        ];
        for (i, x) in old.iter_mut().enumerate() {
            x.decompressed_hash = format!("{i:0>64}");
            std::fs::write(local(&dir, x), b"12345").unwrap();
        }
        // Mozilla's new list: German in a version 4 not on disk; the merge keeps version 3 known.
        let mut newer = vec![rec("model.ende", "model", "4.0", "en", "de", ""), rec("vocab.ende", "vocab", "4.0", "en", "de", "")];
        for (i, x) in newer.iter_mut().enumerate() {
            x.decompressed_hash = format!("{:0>64}", 90 + i);
        }
        let models = merge(old[1..].to_vec(), newer);
        let json = |d: &[Record]| serde_json::to_vec(&Records { data: d.to_vec() }).unwrap();
        std::fs::write(dir.join(format!("{ENGINE}.json")), json(&old[..1])).unwrap();
        std::fs::write(dir.join(format!("{MODELS}.json")), json(&models)).unwrap();
        assert_eq!(installed(&dir), vec!["en", "de"]);
        assert_eq!(known(&dir), vec!["de", "en"]);
        let (_, missing) = plan_from(&dir, &models, &old[..1], &["de".to_string()]).unwrap();
        assert!(missing.is_empty(), "nothing to download: {missing:?}");
        // Removing German deletes the version on disk.
        assert_eq!(remove(&dir, "de").unwrap(), 10);
        assert_eq!(installed(&dir), vec!["en"]);
    }

    /// Real download from Mozilla (≈ 50 MB): `cargo test mozilla -- --ignored`.
    /// Writes the plan to HYPHN_TR_PLAN for the UI test page.
    #[test]
    #[ignore]
    fn mozilla_files_download_and_check() {
        let dir = std::env::temp_dir().join("hyphn-translate-real");
        let langs: Vec<String> = ["fr", "en", "de"].iter().map(|s| s.to_string()).collect();
        let plan = prepare(&dir, &langs, |d, t| eprintln!("{d} / {t}")).unwrap();
        assert!(plan.pairs.contains_key("fr-en") && plan.pairs.contains_key("en-de"));
        if let Ok(out) = std::env::var("HYPHN_TR_PLAN") {
            std::fs::write(out, serde_json::to_vec(&plan).unwrap()).unwrap();
        }
    }

    #[test]
    fn the_window_reads_only_the_translation_folder() {
        let dir = std::env::temp_dir().join("hyphn-translate-test");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a-model.bin"), b"ok").unwrap();
        assert_eq!(read(&dir, &dir.join("a-model.bin").display().to_string()).unwrap(), b"ok");
        assert!(read(&dir, &dir.join("..").join("secret.txt").display().to_string()).is_err());
        assert!(read(&dir, &dir.join("translations-models-v2.json").display().to_string()).is_err());
    }
}
