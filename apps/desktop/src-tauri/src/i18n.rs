//! Language of the texts the PC side writes (errors, tray menu, Drop labels):
//! English by default, French when chosen in Settings (ADR-0042). The window
//! does the same for its own texts.

use std::sync::atomic::{AtomicBool, Ordering};

static FRENCH: AtomicBool = AtomicBool::new(false);

/// Follows the « lang » setting: "fr" for French, anything else English.
pub fn set(lang: &str) {
    FRENCH.store(lang == "fr", Ordering::Relaxed);
}

pub fn french() -> bool {
    FRENCH.load(Ordering::Relaxed)
}

/// The English or the French text, by the chosen language.
pub fn tr(en: &'static str, fr: &'static str) -> &'static str {
    if french() { fr } else { en }
}

/// « : » with the space French puts before it.
pub fn colon() -> &'static str {
    tr(": ", " : ")
}

#[cfg(test)]
mod tests {
    // `set` is not called here: tests run in parallel and others read the
    // language (English by default).
    #[test]
    fn english_by_default() {
        assert!(!super::french());
        assert_eq!(super::tr("Quit", "Quitter"), "Quit");
    }
}
