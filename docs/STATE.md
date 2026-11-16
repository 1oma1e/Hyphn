# État du projet

Mis à jour : 2026-11-16 (anglais par défaut, tuto anglais, Release 0.3.0). Réécrit à chaque `/session-end`.

## Phase
**1 — Socle**, depuis le 2026-10-31 ([[ADR-0020 Phase 1 sans attendre le rafraichissement]]). Cam v1, Cam v2 et Drop v1 commencés en avance. Porte de la phase 1 : [[ROADMAP]].

## Fait (confirmé par Evan sur son iPhone 16 Pro Max et son PC)
- App iPhone `apps/ios/` (xtool sur le serveur, SideStore) et app PC `apps/desktop/` : appairage QR + code à 4 chiffres, TLS 1.3 épinglé, reconnexion, infos de l'iPhone, liaison par câble USB ([[ADR-0031 Liaison par cable USB]]).
- Cam dans la fenêtre et dans la webcam Windows « Hyphn » (Discord) en HEVC jusqu'à la 4K60 ([[ADR-0035 Webcam sans forcer le H.264]]). Mesures : 83 à 127 ms par câble ([[Latence et debit Cam]]).
- Effets de la Cam (recherche, filtres, fond, émojis, masques 3D) ; Snap retiré ([[ADR-0038 Retrait des filtres Snap]]).
- Dépôt public sur GitHub, Release **v0.3.0** publiée par Evan (setup PC 0.3.0 signé, `.ipa` 0.10.0, `latest.json`) ; `source.json` à jour.

## Fait, pas encore confirmé par Evan
- **Anglais par défaut** ([[ADR-0042 Anglais par defaut et choix de la langue]]) : PC en anglais, Settings › Language › Français ; Rust (erreurs, menu de la barre des tâches) suit le réglage ; iPhone selon sa langue ; message de pause par défaut « Be right back ». Vu dans un navigateur avec un faux iPhone seulement.
- README : tuto d'installation complet en anglais (+ rafraîchissement automatique). Version Discord donnée dans le chat.
- Profil GitHub (`D:\Projects\1oma1e`, poussé) : carte Hyphn reliée au dépôt, badge de version.
- Mise à jour auto du PC et source SideStore ([[ADR-0040 Mises a jour auto et depot public]]), licence [[ADR-0041 Licence PolyForm Strict]].
- Corrections du 2026-11-16 (traduction russe, phrase longue qui rétrécit, interrupteurs, aperçu de pause déplaçable) et webcam pendant un jeu (E4 de [[Cam - Webcam Windows et OBS]]).
- **Drop v1** ([[ADR-0029 Drop guide avec anti-doublon des la v1]], [[ADR-0030 Drop commence sur l'iPhone et le PC confirme]]).
- Tests : `cargo test` → 105 passent ; `tools/build-native.ps1` → OK ; app iPhone 0.10.0 compilée sur le serveur (2026-11-16).

## Pas fait
- Specs en brouillon : [[Cam - Reglages avances]], [[Cam - Filtres et effets]], [[Cam - Ecrans d'attente]] ; E3 à E6 de [[Cam - Latence et fluidite]].
- Message de pause personnel traduit toujours depuis le français ([[IDEES]]).
- Mesure en Wi-Fi ; but chiffré de latence. Porte phase 1 : iPhone visible en moins de 3 s ; batterie par câble ([[ADR-0006 Sante batterie par cable]]).
- Sessions du 2026-11-03 au 05 (effets, Snap) sans journal. Notes de `docs/maquettes/` en retard sur l'app.

## Non vérifié
- Mise à jour réelle 0.2.0 → 0.3.0 sur le PC (carte › Install) et dans SideStore (My Apps › Update).
- La vraie fenêtre Hyphn en anglais et en français (textes qui débordent), l'app iPhone en anglais sur l'iPhone.
- Libellés anglais exacts d'iloader, SideStore et Raccourcis dans le tuto ; automatisation du rafraîchissement.
- Discord pendant un jeu (si l'écran d'attente revient : `C:\ProgramData\Hyphn\vcam.log`) ; OBS avec la nouvelle DLL ; Teams ; batterie et CPU ; 1 h de stream.

## Pièges à retenir
- **Claude tourne dans un paquet MSIX** : ses commandes voient une copie privée d'AppData. Lire les vraies données par `\\localhost\C$\Users\Evan\AppData\...` ; ne pas lancer Hyphn depuis Claude.
- Release : monter la version (`tauri.conf.json`, `package.json`, `Cargo.toml`, et `apps/ios/Info.plist`), pousser, construire le `.ipa` sur le serveur ([[Serveur]]) et le copier en `F:\Hyphn\out\Hyphn_<version iPhone>.ipa`, puis `tools/release.ps1 -Notes "..."` (Hyphn fermée). Evan crée la Release GitHub ; **ensuite seulement** commiter et pousser `source.json`.
- Clé de signature `F:\Hyphn\keys\hyphn-updater.key` : la perdre = plus aucune mise à jour pour les PC installés.
- Essai de build iOS dans `~/hyphn/xtool/try/ios` : les fichiers de build appartiennent à root (Docker) ; copier les sources par-dessus, sans `rm -rf`.
- Un nouveau texte visible arrive en anglais et en français (`t()` + `ui/fr.js`, `i18n::tr`, `L()` sur l'iPhone).
- Python sous Windows écrit des fins de ligne CRLF : git les remet en LF, sans souci.

## Prochaine étape
1. Evan installe la 0.3.0 (carte sur le PC, Update dans SideStore), passe le PC en français, regarde que rien ne déborde et teste Discord pendant un jeu.
2. Ensuite : valider les specs Cam en brouillon, ou la porte de la phase 1 (moins de 3 s après le scan).

Commande pour commencer : `/session-start Tester la 0.3.0 en anglais et en français sur le PC et l'iPhone`.
