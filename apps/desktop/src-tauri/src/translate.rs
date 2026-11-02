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

/// The newest file of each kind for one pair.
fn pick(records: &[Record], from: &str, to: &str) -> Vec<Record> {
    let mut best: BTreeMap<&str, &Record> = BTreeMap::new();
    for r in records.iter().filter(|r| r.source == from && r.target == to && for_desktop(r)) {
        match best.get(r.file_type.as_str()) {
            Some(b) if version(&b.version) >= version(&r.version) => {}
            _ => {
                best.insert(&r.file_type, r);
            }
        }
    }
    best.into_values().cloned().collect()
}

fn engine(records: &[Record]) -> Option<Record> {
    records
        .iter()
        .filter(|r| r.name == "bergamot-translator" && for_desktop(r))
        .max_by_key(|r| version(&r.version))
        .cloned()
}

fn sha256_hex(b: &[u8]) -> String {
    Sha256::digest(b).iter().map(|x| format!("{x:02x}")).collect()
}

/// A file is kept under its checked hash: a newer model never mixes with an older one.
fn local(dir: &Path, r: &Record) -> PathBuf {
    dir.join(format!("{}-{}", &r.decompressed_hash[..16], r.name))
}

fn get(url: &str, limit: u64) -> Result<Vec<u8>, String> {
    let agent = ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(10)).timeout_read(Duration::from_secs(60)).build();
    let resp = agent.get(url).call().map_err(|e| format!("téléchargement impossible ({e})"))?;
    let mut out = Vec::new();
    resp.into_reader().take(limit).read_to_end(&mut out).map_err(|e| e.to_string())?;
    Ok(out)
}

fn records(dir: &Path, collection: &str, fresh: bool) -> Result<Vec<Record>, String> {
    let cache = dir.join(format!("{collection}.json"));
    if !fresh {
        if let Some(r) = std::fs::read(&cache).ok().and_then(|b| serde_json::from_slice::<Records>(&b).ok()) {
            return Ok(r.data);
        }
    }
    let body = get(&format!("{RECORDS}{collection}/records"), 32 << 20)?;
    let r: Records = serde_json::from_slice(&body).map_err(|e| format!("liste de Mozilla illisible ({e})"))?;
    std::fs::write(&cache, &body).map_err(|e| e.to_string())?;
    Ok(r.data)
}

/// Downloads one file, checks the published hash of the download and of the
/// unpacked file, then keeps it.
fn fetch(dir: &Path, r: &Record) -> Result<(), String> {
    let packed = get(&format!("{CDN}{}", r.attachment.location), r.attachment.size + 1)?;
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
    let wasm = engine(engines).ok_or("moteur de traduction introuvable chez Mozilla")?;
    let mut need = vec![wasm.clone()];
    let mut pairs = BTreeMap::new();
    for (from, to) in pairs_for(langs) {
        let files = pick(models, &from, &to);
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
        fetch(dir, r)?;
        done += r.attachment.size;
        progress(done, total);
    }
    Ok(plan)
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
