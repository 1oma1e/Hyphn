import Foundation

/// Language of the visible texts: French when the iPhone prefers French, English otherwise.
enum Lang { static let fr = (Locale.preferredLanguages.first ?? "en").hasPrefix("fr") }

/// The English or the French text, by the iPhone's language.
func L(_ en: String, _ fr: String) -> String { Lang.fr ? fr : en }
