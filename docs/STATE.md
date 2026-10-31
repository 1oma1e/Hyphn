# État du projet

Mis à jour : 2026-11-01 (session « iPhone complet, webcam Windows, OBS »). Réécrit à chaque `/session-end`.

## Phase
**1 — Socle**, depuis le 2026-10-31 ([[ADR-0020 Phase 1 sans attendre le rafraichissement]]). Cam v1 et Cam v2 (webcam Windows, OBS) commencées en avance ([[ADR-0022 Webcam Windows par DLL qui decode]]). Porte de la phase 1 : [[ROADMAP]].

## Fait (confirmé par Evan sur son iPhone 16 Pro Max et son PC)
- App iPhone `apps/ios/` (xtool sur le serveur, SideStore) : scan du QR du PC, code à 4 chiffres validé sur l'iPhone, Accueil, Cam, Réglages, Drop vide. Logo = celui du PC.
- App PC `apps/desktop/` : TLS 1.3 épinglé, appairage, reconnexion, infos de l'iPhone, Cam en direct (WebSocket local + WebCodecs). Plus de simulation.
- QR court `HYPHN:1/…` (29×29), connexion avec étapes et « Annuler » ([[Core - Appairage QR]]).
- « Afficher » synchronisé PC ↔ iPhone (`CamState.by_user`), image clé à la demande (`KeyRequest`), débit adaptatif sur l'iPhone, vrais réglages caméra (exposition, mise au point, balance, lampe, stabilisation, miroir).
- Webcam Windows « Hyphn » (DLL Media Foundation, `apps/desktop-vcam/`) : vue dans Discord ; s'installe toute seule (installateur `perMachine` ou app relancée en admin, `install.rs`). Écran d'attente animé, envoyé en miroir.
- Liaison gardée quand on change d'app sur l'iPhone, essais toutes les 5 s, « Reconnecter » des deux côtés ([[ADR-0023 Connexion gardee et reconnexion facile]]).
- Tests : `cargo test` dans `apps/desktop/src-tauri/` → 54 passent.

## Pas fait
- Drop (prochaine session, [[ADR-0020 Phase 1 sans attendre le rafraichissement]]).
- Mesures de la porte de phase 1 (iPhone visible en moins de 3 s après le scan) et de la phase 4 (latence notée, 30 min sans décrochage).
- Notification Windows de batterie faible ; vérifications réseau E11 (seul « pas de réseau local ») ; lecture batterie par câble ([[ADR-0006 Sante batterie par cable]]).
- Notes texte de `docs/maquettes/` à remettre à jour (V2, Cam sans effets, bouton miroir, Reconnecter).
- `CLAUDE.md` (Commandes) ne cite pas `tools/build-native.ps1` : à ajouter par Evan.
- Décider d'arrêter ou non le conteneur `hyphn-anisette` (inutilisé). VISION « 2 s » contre porte « < 3 s » : à trancher.

## Non vérifié
- Source « Hyphn (iPhone) » dans OBS ; webcam vue par OBS, Teams, navigateur.
- Installateur `Hyphn_0.1.0_x64-setup.exe` lancé pour de vrai (crochets NSIS : webcam + OBS).
- Correction du « zoom » en HEVC dans la fenêtre (vraie taille imposée) ; le service caméra de Windows n'a pas le HEVC (extension du Store) → H.264 forcé quand la webcam sert.
- Coût batterie (30 s en arrière-plan, essais toutes les 5 s) et CPU du PC pendant le flux ; 1 h de stream (porte phase 5).
- Rafraîchissement SideStore automatique (raccourci lundi et jeudi 20 h).

## Pièges à retenir
- Build iOS : pousser d'abord, puis `git -C src pull` sur le serveur ; `.ipa` zippé en Python ([[Serveur]]). Essai sans pousser : `~/hyphn/xtool/try/ios`.
- DLL natives : `powershell -NoProfile -File tools/build-native.ps1` (MSVC sur F:, `/Brepro` pour des empreintes stables) ; `npm run build` le fait avant l'installateur. L'app grave l'empreinte des DLL au build (`build.rs`) : DLL modifiée = installation refusée.
- Journal de la webcam : `C:\ProgramData\Hyphn\vcam.log` (« HEVC decoder no » = H.264 forcé).
- Python et heredocs bash cassent les `\` et les `'` : fichiers de modifs écrits avec l'outil d'écriture.
- Port 9333 pris par un `ssh.exe` qui n'est pas à Claude : débogage WebView2 sur 9334 (config de dev hors du repo).
- iPhone en USB : couper son partage de connexion (erreur 10060). Un seul VPN actif sur iOS.

## Prochaine étape
Session suivante : Drop v1 (phase 2, [[ROADMAP]]) — spec `Drop - Photos vers le PC` d'abord, puis maquette, puis code. Avant : faire tester OBS (source « Hyphn (iPhone) ») et noter le résultat.

Commande pour commencer : `/session-start Drop v1 : spec puis envoi des photos de l'iPhone vers le PC`.
