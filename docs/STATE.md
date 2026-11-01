# État du projet

Mis à jour : 2026-11-01 (session « écran d'attente néon, miroir et tourner »). Réécrit à chaque `/session-end`.

## Phase
**1 — Socle**, depuis le 2026-10-31 ([[ADR-0020 Phase 1 sans attendre le rafraichissement]]). Cam v1 et Cam v2 (webcam Windows, OBS) commencées en avance ([[ADR-0022 Webcam Windows par DLL qui decode]]). Porte de la phase 1 : [[ROADMAP]].

## Fait (confirmé par Evan sur son iPhone 16 Pro Max et son PC)
- App iPhone `apps/ios/` (xtool sur le serveur, SideStore) : scan du QR du PC, code à 4 chiffres validé sur l'iPhone, Accueil, Cam, Réglages, Drop vide.
- App PC `apps/desktop/` : TLS 1.3 épinglé, appairage, reconnexion, infos de l'iPhone, Cam en direct (WebSocket local + WebCodecs).
- « Afficher » synchronisé PC ↔ iPhone, image clé à la demande, débit adaptatif, vrais réglages caméra.
- Barre Cam du PC : boutons **Miroir** et **Tourner** (90° par clic), appliqués par l'iPhone ([[ADR-0025 Tourner applique par l'iPhone]]).
- Webcam Windows « Hyphn » (DLL Media Foundation, `apps/desktop-vcam/`) : vue dans Discord, s'installe toute seule.
- Écran d'attente « néon » (maquette J) dans l'app et la webcam : enseigne suspendue, paquets sur la barre, 18 langues lettre par lettre, envoyé à l'endroit ([[ADR-0024 Ecran d'attente a l'endroit dans la webcam]], [[Cam - Webcam Windows et OBS]] E4). Maquettes : canevas claude.ai privé d'Evan https://claude.ai/artifact/DzCNVkaM92CWHfBmrMaCzh.
- Liaison gardée en arrière-plan, essais toutes les 5 s, « Reconnecter » des deux côtés ([[ADR-0023 Connexion gardee et reconnexion facile]]) ; l'iPhone coupe une liaison muette après 15 s sans Ping ([[Core - Reconnexion]] E6).
- Tests : `cargo test` dans `apps/desktop/src-tauri/` → 54 passent.

## Pas fait
- **Recharger le service caméra de Windows au lancement de Hyphn** (demande d'Evan) : options dans [[ADR-0026 Recharger le service camera de Windows]], à trancher.
- Drop ([[ADR-0020 Phase 1 sans attendre le rafraichissement]]).
- Mesures des portes : phase 1 (iPhone visible en moins de 3 s après le scan), phase 4 (latence, 30 min sans décrochage).
- Notification Windows de batterie faible ; vérifications réseau E11 ; batterie par câble ([[ADR-0006 Sante batterie par cable]]).
- Notes texte de `docs/maquettes/` à remettre à jour (V2, Cam sans effets, miroir et tourner, écran néon, Reconnecter).
- `CLAUDE.md` (Commandes) ne cite pas `tools/build-native.ps1` : à ajouter par Evan.
- Conteneur `hyphn-anisette` inutilisé : l'arrêter ou non. VISION « 2 s » contre porte « < 3 s » : à trancher.

## Non vérifié
- Reconnexion en moins de 20 s après un redémarrage de Hyphn sur le PC (chien de garde iPhone).
- Arrêt automatique du service caméra après une mise à jour (`reload_camera_service`, pas encore servi).
- Texte de l'écran d'attente dans la fenêtre Hyphn : absent sur une capture d'Evan, présent dans le test navigateur.
- Source « Hyphn (iPhone) » dans OBS ; webcam vue par OBS, Teams, navigateur ; installateur lancé pour de vrai.
- Coût batterie et CPU pendant le flux ; 1 h de stream (porte phase 5). Rafraîchissement SideStore automatique.

## Pièges à retenir
- Build iOS : pousser d'abord, puis `git -C src pull` sur le serveur ; `.ipa` zippé en Python, copié par `scp` dans `F:\Hyphn\out` ([[Serveur]]). Essai sans pousser : copier les sources dans `~/hyphn/xtool/try/ios` **sans supprimer** (fichiers de build à root).
- DLL natives : `powershell -NoProfile -File tools/build-native.ps1` ; `npm run build` le fait. L'app grave l'empreinte des DLL au build : DLL modifiée = installation refusée.
- `npm run build` échoue si Hyphn tourne (exe verrouillé) : la quitter par l'icône près de l'horloge, pas seulement la fenêtre. Claude n'a pas le droit de la fermer.
- Le service caméra de Windows garde la DLL déjà chargée : sans `reload_camera_service`, redémarrer « Windows Camera Frame Server » (`services.msc`) ou le PC.
- Journal de la webcam : `C:\ProgramData\Hyphn\vcam.log`.
- Port 8765 pris par une autre app d'Evan (« Drivn »), 9333 par un `ssh.exe` : choisir un autre port pour les tests.
- iPhone en USB : couper son partage de connexion (erreur 10060). Un seul VPN actif sur iOS.

## Prochaine étape
Session suivante : recharger le service caméra au lancement de Hyphn ([[ADR-0026 Recharger le service camera de Windows]]) — Evan choisit l'option, puis code et test (DLL modifiée → Discord montre la nouvelle sans geste manuel). Ensuite Drop v1 (spec `Drop - Photos vers le PC`, maquette, code).

Commande pour commencer : `/session-start Recharger le service caméra de Windows au lancement de Hyphn, puis Drop v1`.
