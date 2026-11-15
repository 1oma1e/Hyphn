---
type: decision
date: 2026-11-06
statut: accepte
---
# ADR-0039 Setup Windows publié sur GitHub

## Contexte
Evan lançait l'app PC avec `npm run dev` (compilation à chaque fois), puis avec un exe copié à la main. Il veut une vraie application (2026-11-06) : un setup sur GitHub qui installe tout, puis un exe qu'on lance d'un double-clic, qui garde les réglages et ne retélécharge pas les langues.

## Options
| Option | Pour | Contre |
|---|---|---|
| A. Setup construit sur le PC d'Evan (`npm run build`), déposé à la main dans une Release GitHub | Rapide ; la construction marche déjà sur ce PC (DLL webcam et OBS comprises) | Une étape à la main par version |
| B. Setup construit par GitHub Actions à chaque tag | Rien à faire à la main | Adapter `tools/build-native.ps1` aux machines de GitHub ; plus long |
| C. Exe copié à la main avec un raccourci | Aucun setup | Pas de menu Démarrer, pas de désinstallation, webcam installée à part |

## Décision
**A** (choix d'Evan, 2026-11-06). Evan dépose lui-même le fichier sur GitHub (pas d'outil `gh` installé).
- Le setup est celui de Tauri (NSIS, `perMachine`) avec les hooks de [[ADR-0022 Webcam Windows par DLL qui decode]] : l'app dans `C:\Program Files\Hyphn`, la webcam et OBS en un seul « Oui » admin, un raccourci Bureau et menu Démarrer.
- Réglages, appareils appairés et langues restent dans le dossier de l'utilisateur (`AppData\Roaming` et `AppData\Local\io.github.1oma1e.hyphn.desktop`) : une nouvelle version ou une réinstallation les garde.
- Une version = `version` monte dans `tauri.conf.json`, `Cargo.toml` et `package.json`, puis `npm run build` dans `apps/desktop/`. Le setup sort dans `CARGO_TARGET_DIR\release\bundle\nsis\Hyphn_<version>_x64-setup.exe`.
- Le même jour, les langues ne se retéléchargent plus : une langue entière sur le disque reste installée même si Mozilla publie une version plus récente, et une langue sans modèle chez Mozilla n'est plus redemandée à chaque lancement ([[ADR-0033 Traduction locale du message d'attente]]).

## Conséquences
- `CLAUDE.md` (Commandes) devrait citer `npm run build` pour le setup : à ajouter par Evan.
- B reste possible plus tard ([[IDEES]]), comme la mise à jour automatique depuis GitHub.
- Preuve : le setup s'installe, Hyphn s'ouvre par son raccourci, garde ses réglages après un redémarrage, et ne télécharge rien au deuxième lancement.
