---
type: decision
date: 2026-11-02
statut: accepte
---
# ADR-0033 Traduction locale du message d'attente

## Contexte
Evan veut que le message de l'écran d'attente, tapé une fois, s'affiche traduit dans les 18 langues ([[Cam - Ecrans d'attente]], E1). Hyphn n'a ni compte ni cloud : la traduction doit tourner sur le PC, sans internet.

## Options
| Option | Pour | Contre |
|---|---|---|
| A. **Bergamot** (moteur de traduction locale de Firefox, open source), modèles téléchargés une fois par langue | Fait pour tourner sur un PC, rapide sur le processeur, qualité correcte ; une version C# existe (BergamotTranslatorSharp) | Paires de langues limitées (souvent via l'anglais) ; quelques dizaines de Mo par langue ; licences des modèles à vérifier |
| B. Petit modèle de langue local (LLM) | Toutes les langues d'un coup | Plusieurs centaines de Mo à quelques Go, lent sans bonne carte graphique |
| C. Pas de traduction libre : phrases prêtes traduites à la main, au choix | Zéro poids, qualité parfaite | Pas le message libre qu'Evan veut |

## Décision
**A** (choix d'Evan, 2026-11-02), avec **C** pour le message par défaut (déjà traduit à la main). Vérifié le 2026-11-02 :
- **Source** : les listes publiques de Mozilla (Remote Settings, collections `translations-models-v2` et `translations-wasm-v2`), les fichiers sur leur CDN. Chaque fichier est vérifié deux fois avec l'empreinte SHA-256 publiée (téléchargé, puis décompressé). Licence MPL-2.0 (moteur et modèles).
- **Langues** : les 17 existent, toujours via l'anglais (fr→en, puis en→X ; le chinois est `zh-Hans`). Environ 300 Mo en tout.
- **Où ça tourne** : le moteur WebAssembly de Firefox dans un worker de la fenêtre (`ui/translate-worker.js`, colle `ui/vendor/bergamot-translator.js` copiée de Firefox) ; Rust télécharge et range les fichiers (`src/translate.rs`). La fenêtre autorise le WebAssembly (`'wasm-unsafe-eval'`).
- **Mesure** : fr→en→de en 0,7 s sur le PC d'Evan (page d'essai, vrais modèles).
- Une langue sans modèle garde le texte d'Evan.
- **58 langues au choix** (demande d'Evan, 2026-11-02) : les 18 de départ cochées ; une langue décochée est supprimée du disque (place libérée affichée). Une carte en bas de l'écran montre l'installation et la traduction.

## Conséquences
- Téléchargement au premier message traduit, tout seul, avec la progression affichée dans le panneau : ce n'est pas du cloud (rien de l'utilisateur ne part), mais c'est un accès internet, dit dans l'info-bulle.
- La webcam Windows reçoit les 18 traductions avec le message (état de la DLL, séparées par un 0) : il faut la nouvelle DLL (`tools/build-native.ps1`).
- Les traductions sont gardées dans les réglages : pas de nouveau calcul à chaque lancement.
- Bon choix si les 18 langues s'affichent en moins de 5 s sur le PC d'Evan.

Liens : [[Decisions - Index]]
