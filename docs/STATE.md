# État du projet

Mis à jour : 2026-11-16 (session « vraie app Windows et webcam pendant un jeu »). Réécrit à chaque `/session-end`.

## Phase
**1 — Socle**, depuis le 2026-10-31 ([[ADR-0020 Phase 1 sans attendre le rafraichissement]]). Cam v1, Cam v2 et Drop v1 commencés en avance. Porte de la phase 1 : [[ROADMAP]].

## Fait (confirmé par Evan sur son iPhone 16 Pro Max et son PC)
- App iPhone `apps/ios/` (xtool sur le serveur, SideStore) et app PC `apps/desktop/` : appairage QR + code à 4 chiffres, TLS 1.3 épinglé, reconnexion, infos de l'iPhone, liaison par câble USB ([[ADR-0031 Liaison par cable USB]]).
- Cam dans la fenêtre et dans la webcam Windows « Hyphn » (Discord) en HEVC jusqu'à la 4K60 ; l'app décode pour la webcam ([[ADR-0035 Webcam sans forcer le H.264]]). Mesures : 83 à 127 ms par câble ([[Latence et debit Cam]]).
- **Vraie app Windows** ([[ADR-0039 Setup Windows publie sur GitHub]]) : setup NSIS 0.1.1 construit sur le PC, installé par Evan dans `E:\Hyphn`, raccourci sur le bureau ; réglages et langues gardés d'une ouverture à l'autre.
- Langues du message de pause : plus de re-téléchargement quand Mozilla publie une version plus récente ; une langue décochée est supprimée (« Espace libéré »).
- Effets de la Cam dans la vraie app : panneau avec recherche, filtres, fond, émojis, masques 3D ; Snap essayé puis retiré ([[ADR-0038 Retrait des filtres Snap]]).

## Fait, pas encore confirmé par Evan
- Webcam pendant un jeu (0.1.1) : garde la dernière image jusqu'à 10 s au lieu de l'écran d'attente, refus d'EcoQoS, décodage en priorité haute, fenêtre non ralentie en arrière-plan (E4 de [[Cam - Webcam Windows et OBS]]).
- **Drop v1** ([[ADR-0029 Drop guide avec anti-doublon des la v1]], [[ADR-0030 Drop commence sur l'iPhone et le PC confirme]]).
- iPhone 0.9.1 (16) : objectif exact ([[ADR-0036 Objectif exact au lieu de la camera combinee]]) ; compilé, pas installé.
- Traduction du message de pause dans la webcam (nouvelle DLL dans le setup 0.1.1 : non regardé dans Discord).
- Tests : `cargo test` dans `apps/desktop/src-tauri/` → 102 passent (2026-11-16).

## Pas fait
- **Release GitHub v0.1.1** : à créer par Evan (tag `v0.1.1`, fichier `F:\Hyphn\out\Hyphn_0.1.1_x64-setup.exe`).
- Sessions du 2026-11-03 au 2026-11-05 (effets, Snap) sans journal : résumé seulement dans les commits et les ADR 0037-0038.
- Specs en brouillon à valider : [[Cam - Reglages avances]], [[Cam - Filtres et effets]], [[Cam - Ecrans d'attente]] ; E3 à E6 de [[Cam - Latence et fluidite]].
- Mesure en Wi-Fi ; but chiffré de latence (à fixer par Evan).
- Porte phase 1 : iPhone visible en moins de 3 s après le scan. Batterie par câble ([[ADR-0006 Sante batterie par cable]]) ; notification de batterie faible.
- Notes texte de `docs/maquettes/` en retard sur l'app. `CLAUDE.md` (Commandes) ne cite pas `tools/build-native.ps1` ni la commande du setup.
- Idées notées dans [[IDEES]] : setup construit par GitHub Actions, mise à jour automatique (Tauri updater), image de fond hors de `settings.json`.

## Non vérifié
- Discord pendant un jeu avec 0.1.1 (plus d'écran d'attente) ; si ça revient, lire `C:\ProgramData\Hyphn\vcam.log` (lignes « no new picture for … ms »).
- Pourquoi le dossier des langues et l'identité ont été effacés le 2026-11-15 à 17:13 (piste : désinstallation de 0.1.0 avec « Delete the application data »).
- OBS avec la nouvelle DLL ; webcam dans Teams et le navigateur ; coût batterie et CPU ; 1 h de stream (porte phase 5).

## Pièges à retenir
- **Claude tourne dans un paquet MSIX** : ses commandes voient une copie privée d'AppData. Lire les vraies données par `\\localhost\C$\Users\Evan\AppData\...` ; ne pas lancer Hyphn depuis Claude pour un vrai usage (fenêtre cachée, autre identité).
- Setup : `npm run build` dans `apps/desktop/` (DLL webcam puis setup) → `F:\safesweep-target\release\bundle\nsis\`, copié dans `F:\Hyphn\out\`. Monter la version dans `tauri.conf.json`, `package.json` et `Cargo.toml`.
- Hyphn qui tourne verrouille son `.exe` : `cargo build` échoue (`cargo test` passe). Evan la quitte par l'icône près de l'horloge ; Claude n'a pas le droit de la fermer.
- Build iOS : pousser d'abord, puis `git -C src pull` sur le serveur ([[Serveur]]).
- « Aller-retour » dans « Infos du flux » = ping du lien, pas le retard de l'image (voir « Total »).
- Journaux : `C:\ProgramData\Hyphn\vcam.log` (webcam) ; iPhone : Réglages › « Journal de la liaison ».

## Prochaine étape
1. Evan publie la Release v0.1.1 et joue avec Discord ouvert : écran d'attente ou pas ? Sinon, lire `vcam.log`.
2. Puis reprendre les specs Cam en brouillon (réglages avancés, filtres et effets) pour les valider, ou la porte de la phase 1 (moins de 3 s après le scan).

Commande pour commencer : `/session-start Vérifier la webcam pendant un jeu, puis valider les specs Cam en brouillon`.
