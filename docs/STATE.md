# État du projet

Mis à jour : 2026-11-16 (mises à jour auto, dépôt public, licence, corrections). Réécrit à chaque `/session-end`.

## Phase
**1 — Socle**, depuis le 2026-10-31 ([[ADR-0020 Phase 1 sans attendre le rafraichissement]]). Cam v1, Cam v2 et Drop v1 commencés en avance. Porte de la phase 1 : [[ROADMAP]].

## Fait (confirmé par Evan sur son iPhone 16 Pro Max et son PC)
- App iPhone `apps/ios/` (xtool sur le serveur, SideStore) et app PC `apps/desktop/` : appairage QR + code à 4 chiffres, TLS 1.3 épinglé, reconnexion, infos de l'iPhone, liaison par câble USB ([[ADR-0031 Liaison par cable USB]]).
- Cam dans la fenêtre et dans la webcam Windows « Hyphn » (Discord) en HEVC jusqu'à la 4K60 ; l'app décode pour la webcam ([[ADR-0035 Webcam sans forcer le H.264]]). Mesures : 83 à 127 ms par câble ([[Latence et debit Cam]]).
- Vraie app Windows 0.1.1 installée dans `E:\Hyphn` ([[ADR-0039 Setup Windows publie sur GitHub]]) ; réglages et langues gardés.
- Effets de la Cam (recherche, filtres, fond, émojis, masques 3D) ; Snap retiré ([[ADR-0038 Retrait des filtres Snap]]).

## Fait, pas encore confirmé par Evan
- **0.2.0** ([[ADR-0040 Mises a jour auto et depot public]]) : mise à jour auto du PC (updater Tauri, setup signé, `latest.json`, carte « Hyphn x.y est disponible ») ; source SideStore `source.json` ; README anglais ; licence [[ADR-0041 Licence PolyForm Strict]]. Construite dans `F:\Hyphn\out\v0.2.0\` (sans l'aperçu déplaçable).
- Corrections du 2026-11-16 : traduction (lot de fichiers complet d'une seule version, le russe vient d'Android), phrase trop longue qui rétrécit (app et DLL), interrupteurs des Réglages, aperçu de pause déplaçable. Vus sur des pages d'essai seulement.
- Webcam pendant un jeu : dernière image gardée 10 s, refus d'EcoQoS, décodage en priorité haute (E4 de [[Cam - Webcam Windows et OBS]]).
- **Drop v1** ([[ADR-0029 Drop guide avec anti-doublon des la v1]], [[ADR-0030 Drop commence sur l'iPhone et le PC confirme]]).
- iPhone 0.9.1 (16), objectif exact ([[ADR-0036 Objectif exact au lieu de la camera combinee]]) : `.ipa` reconstruit le 2026-11-16, pas installé.
- Tests : `cargo test` → 104 passent ; `tools/build-native.ps1` → OK (2026-11-16).

## Pas fait
- **Par Evan, dans l'ordre** : pousser (2 commits d'avance) ; rendre le dépôt public (Settings › Danger Zone) ; reconstruire 0.2.0 (`tools/release.ps1`) pour l'aperçu déplaçable ; créer la Release `v0.2.0` avec les 3 fichiers ; sauvegarder `F:\Hyphn\keys\`. La 0.1.1 passe à 0.2.0 à la main une fois.
- Sessions du 2026-11-03 au 05 (effets, Snap) sans journal.
- Specs en brouillon : [[Cam - Reglages avances]], [[Cam - Filtres et effets]], [[Cam - Ecrans d'attente]] ; E3 à E6 de [[Cam - Latence et fluidite]].
- Mesure en Wi-Fi ; but chiffré de latence. Porte phase 1 : iPhone visible en moins de 3 s ; batterie par câble ([[ADR-0006 Sante batterie par cable]]).
- Notes de `docs/maquettes/` en retard sur l'app.

## Non vérifié
- Mise à jour réelle : PC (carte puis installation) et SideStore (« Update ») ; il faut une Release publique plus récente que celle installée.
- Libellés exacts de SideStore (Sources, Browse, FREE, My Apps) et de Raccourcis (Définir le VPN) donnés dans le tuto ; automatisation du rafraîchissement.
- Discord pendant un jeu ; si l'écran d'attente revient, lire `C:\ProgramData\Hyphn\vcam.log`.
- OBS avec la nouvelle DLL ; Teams et navigateur ; batterie et CPU ; 1 h de stream.

## Pièges à retenir
- **Claude tourne dans un paquet MSIX** : ses commandes voient une copie privée d'AppData. Lire les vraies données par `\\localhost\C$\Users\Evan\AppData\...` ; ne pas lancer Hyphn depuis Claude.
- Release : `tools/release.ps1 -Notes "..."` (monte d'abord la version dans `tauri.conf.json`, `package.json`, `Cargo.toml`) ; le `.ipa` attendu est `F:\Hyphn\out\Hyphn_<version iPhone>.ipa` ; ensuite commiter `source.json`.
- Clé de signature `F:\Hyphn\keys\hyphn-updater.key` : la perdre = plus aucune mise à jour pour les PC installés.
- Hyphn qui tourne verrouille son `.exe` de dev : `cargo build` échoue (`cargo test` passe). Claude n'a pas le droit de la fermer.
- Build iOS : pousser d'abord, puis `git -C src pull` sur le serveur ([[Serveur]]).
- Heredocs Python : `\v`, `\t` dans un chemin Windows deviennent des caractères de contrôle ; écrire par l'outil d'édition.

## Prochaine étape
1. Evan pousse, rend le dépôt public, reconstruit et publie la Release v0.2.0, l'installe, puis teste la traduction russe, l'aperçu déplaçable et Discord pendant un jeu.
2. Ensuite : valider les specs Cam en brouillon, ou la porte de la phase 1 (moins de 3 s après le scan).

Commande pour commencer : `/session-start Publier la 0.2.0 et vérifier les corrections dans la vraie app`.
