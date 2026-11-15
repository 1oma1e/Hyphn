//! The languages of the waiting message on disk (ADR-0033). Installs and
//! removals wait in a queue and run one at a time on a thread of their own:
//! they go on whatever the window does (another page, a reload). The state
//! shown is always read from the disk.

use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex};

use serde::Serialize;

use crate::translate;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Op {
    Install,
    Remove,
}

/// The language being handled now.
#[derive(Debug, Clone, Serialize)]
pub struct Current {
    pub op: Op,
    pub lang: String,
    /// 0 download (or removal), 1 check, 2 done.
    pub stage: u8,
    pub done: u64,
    pub total: u64,
    /// Bytes at the last status sent.
    #[serde(skip)]
    sent: u64,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct Status {
    /// Read from the disk.
    pub installed: Vec<String>,
    /// Languages Mozilla has a model for (empty before the first download):
    /// the window never asks for the others.
    pub known: Vec<String>,
    pub queue: Vec<(Op, String)>,
    pub current: Option<Current>,
    /// Since the queue was last empty: how many done, out of how many.
    pub batch_done: u32,
    pub batch_total: u32,
    /// Bytes freed by the removals of this batch.
    pub freed: u64,
    pub failed: Vec<String>,
}

struct Inner {
    status: Status,
    queue: VecDeque<(Op, String)>,
}

pub struct Langs {
    dir: PathBuf,
    inner: Mutex<Inner>,
    wake: Condvar,
}

impl Langs {
    /// Starts the worker; `changed` gets the status after every step.
    pub fn start(dir: PathBuf, changed: impl Fn(Status) + Send + 'static) -> Arc<Self> {
        let _ = std::fs::create_dir_all(&dir);
        translate::clean(&dir);
        let me = Arc::new(Langs {
            inner: Mutex::new(Inner { status: Status { installed: translate::installed(&dir), known: translate::known(&dir), ..Status::default() }, queue: VecDeque::new() }),
            wake: Condvar::new(),
            dir,
        });
        let w = me.clone();
        std::thread::spawn(move || w.run(changed));
        me
    }

    pub fn status(&self) -> Status {
        let mut i = self.inner.lock().unwrap();
        // Always the truth of the disk, in case anything changed meanwhile.
        if i.status.current.is_none() {
            i.status.installed = translate::installed(&self.dir);
            i.status.known = translate::known(&self.dir);
        }
        i.status.queue = i.queue.iter().cloned().collect();
        i.status.clone()
    }

    /// Queues installs or removals. A language already waiting for the other
    /// operation changes its mind; one already in that state is skipped.
    pub fn ask(&self, op: Op, langs: &[String]) {
        let mut i = self.inner.lock().unwrap();
        // A new batch: its counts start from zero.
        if i.queue.is_empty() && i.status.current.is_none() {
            i.status.batch_done = 0;
            i.status.batch_total = 0;
            i.status.freed = 0;
            i.status.failed.clear();
        }
        for l in langs {
            i.queue.retain(|(_, x)| x != l);
            let now = i.status.current.as_ref().is_some_and(|c| &c.lang == l && c.op == op);
            let there = i.status.installed.contains(l);
            if now || (op == Op::Install && there && i.status.current.as_ref().map_or(true, |c| &c.lang != l)) {
                continue;
            }
            if op == Op::Remove && !there && i.status.current.as_ref().map_or(true, |c| &c.lang != l) {
                continue;
            }
            i.queue.push_back((op, l.clone()));
            i.status.batch_total += 1;
            i.status.failed.retain(|x| x != l);
        }
        self.wake.notify_one();
    }

    fn run(&self, changed: impl Fn(Status)) {
        loop {
            let (op, lang) = {
                let mut i = self.inner.lock().unwrap();
                while i.queue.is_empty() {
                    i = self.wake.wait(i).unwrap();
                }
                let (op, lang) = i.queue.pop_front().unwrap();
                i.status.current = Some(Current { op, lang: lang.clone(), stage: 0, done: 0, total: 0, sent: 0 });
                (op, lang)
            };
            changed(self.status());
            let res = match op {
                Op::Install => translate::prepare(&self.dir, &[lang.clone()], |done, total| {
                    let mut i = self.inner.lock().unwrap();
                    let mut send = false;
                    if let Some(c) = i.status.current.as_mut() {
                        c.done = done;
                        c.total = total;
                        c.stage = if total > 0 && done >= total { 1 } else { 0 };
                        // About a hundred steps a language: enough for a smooth bar.
                        send = done == 0 || done >= total || done.saturating_sub(c.sent) * 100 >= total.max(1);
                        if send {
                            c.sent = done;
                        }
                    }
                    drop(i);
                    if send {
                        changed(self.status());
                    }
                })
                .map(|_| 0),
                Op::Remove => translate::remove(&self.dir, &lang),
            };
            {
                let mut i = self.inner.lock().unwrap();
                match res {
                    Ok(freed) => i.status.freed += freed,
                    Err(_) => i.status.failed.push(lang.clone()),
                }
                if let Some(c) = i.status.current.as_mut() {
                    c.stage = 2;
                }
                i.status.batch_done += 1;
                i.status.installed = translate::installed(&self.dir);
                i.status.known = translate::known(&self.dir);
                // Done but the disk says otherwise: failed, so the window does
                // not ask again and again.
                let there = i.status.installed.contains(&lang);
                let unknown = !i.status.known.contains(&lang);
                let wrong = match op {
                    Op::Install => !there && !unknown,
                    Op::Remove => there && lang != "en",
                };
                if wrong && !i.status.failed.contains(&lang) {
                    i.status.failed.push(lang.clone());
                }
            }
            changed(self.status());
            // The counts stay until the next batch: the window shows the summary.
            self.inner.lock().unwrap().status.current = None;
            changed(self.status());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removing_what_is_not_installed_does_nothing() {
        let dir = std::env::temp_dir().join("hyphn-langs-empty");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        // A download stopped with the app leaves a « .part »: cleaned at start.
        std::fs::write(dir.join("x.part"), b"1").unwrap();
        let l = Langs::start(dir.clone(), |_| {});
        assert!(!dir.join("x.part").exists());
        assert!(l.status().installed.is_empty());
        l.ask(Op::Remove, &["de".to_string(), "it".to_string()]);
        let st = l.status();
        assert!(st.queue.is_empty() && st.current.is_none());
        assert_eq!(st.batch_total, 0);
    }
}
