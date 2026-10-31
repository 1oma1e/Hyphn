# Roadmap

Une phase à la fois, chacune avec une porte de sortie **mesurable**. On passe à la suivante seulement avec la preuve et l'accord écrit d'Evan. Android seulement quand toute la partie iPhone est finie. Source : [[CAHIER]] section 8, corrigée par les ADR.

**Phase actuelle : 1 — Socle** (depuis le 2026-10-31, [[ADR-0020 Phase 1 sans attendre le rafraichissement]]). Cam v1 et Cam v2 (webcam Windows, OBS) commencées en avance ([[ADR-0022 Webcam Windows par DLL qui decode]]).

## Phase 0 — Fondations (close le 2026-10-31)
Porte d'origine : un « Hello » SwiftUI qui se rafraîchit **tout seul** pendant 14 jours ([[ADR-0007 Porte de la phase 0]]). Oubliée par Evan : on avisera si le rafraîchissement rate ([[ADR-0020 Phase 1 sans attendre le rafraichissement]]).

- [x] Recherche : Claude Code, concurrents, points à tester ([[Points a tester]]) — 2026-10-29
- [x] Règles, docs, skills, hooks, reviewer — 2026-10-29
- [x] Maquettes texte + Mermaid ([[Maquettes - Index]]) — 2026-10-29
- [x] Maquettes visuelles V2, validées par Evan ([[ADR-0016 Design visuel V2]]) — 2026-10-31 ; notes texte à remettre à jour
- [x] Hors porte : app PC complète avec iPhone simulé ([[ADR-0019 App PC en premier avec iPhone simule]]) ; preuve : `cargo test` 27 OK + parcours d'appairage capturé — 2026-10-31
- [ ] Nom validé par Evan ([[ADR-0004 Nom Hyphn]])
- [x] Serveur : état relevé en lecture seule (OS, architecture, disque, RAM, Docker) ([[Serveur]]) — 2026-10-30
- [x] Serveur : `anisette-v3-server` en Docker, réseau local seulement, `--restart always` ; preuve : réponse de `curl http://<ip-serveur>:6969` — 2026-10-30
- [x] Apple ID secondaire dédié créé par Evan (jamais dans le repo) — 2026-10-30
- [x] Serveur : xtool 1.24.0 + Swift 6.4.1 en Docker ([[Serveur]]) ; SDK iOS 27.2 tiré de `Xcode.xip` (téléchargé par Evan) ; preuve : `xtool --help` et `xtool sdk status` OK — 2026-10-30
- [x] iPhone : mode développeur, code de verrouillage, LocalDevVPN (App Store) — 2026-10-30
- [x] PC : iloader installe SideStore une fois, avec l'Apple ID secondaire ; anisette `mac-ani.jkcoxson.com` ([[ADR-0012 Anisette Mac publique]]) ; preuve : « Refresh All » réussi (confirmé par Evan) — 2026-10-30
- [x] « Hello » SwiftUI construit par xtool, installé par SideStore ; preuve : capture de l'app ouverte (confirmé par Evan, sans capture) — 2026-10-31
- [x] Raccourci « Refresh All » (avec LocalDevVPN connecté) : `Refresh SideStore` (Connect VPN → Refresh All Apps → Disconnect), automatisation lundi et jeudi à 20 h ; test à la main OK (confirmé par Evan) — 2026-10-31
- ~~Plan B testé une fois : AltServer-Linux + netmuxd~~ : abandonné ([[ADR-0014 Pas de plan B AltServer]]) — 2026-10-31
- ~~Premier rafraîchissement automatique, puis 14 jours notés~~ : plus obligatoire ([[ADR-0020 Phase 1 sans attendre le rafraichissement]]) ; [[Journal des rafraichissements]]

## Phase 1 — Socle
Bonjour, appairage QR (validé sur l'iPhone seulement), TLS épinglé, infos de l'iPhone (batterie, thermique), app iPhone (Accueil, Réglages ; Drop vide). Mesure de la consommation au repos (budget). Lecture batterie par câble ([[ADR-0006 Sante batterie par cable]]). Ajout du hook `Stop` « build et tests verts ».
Porte : l'iPhone apparaît sur le PC **en moins de 3 s** après le scan, et sans re-scan au lancement suivant.

## Phase 2 — Drop v1
Photothèque, envoi vers le PC, progression et temps restant, tri Année/Mois. Essai de l'envoi en arrière-plan ([[ADR-0005 Drop par HTTPS et blocs]]).
Porte : **10 Go** transférés sans erreur, hash vérifiés.

## Phase 3 — Drop v2
Câble (libimobiledevice), PC → iPhone, reprise après coupure, doublons, sauvegarde auto.
Porte : coupure Wi-Fi en plein transfert, **reprise sans rien renvoyer**.

## Phase 4 — Cam v1
Commencée en avance pendant la phase 1 ([[Cam - Flux v1]]).
1080p30 HEVC vers une fenêtre sur le PC, mesure de latence.
Porte : latence de bout en bout mesurée et notée, **30 min** sans décrochage.

## Phase 5 — Cam v2
Commencée en avance ([[ADR-0022 Webcam Windows par DLL qui decode]], [[Cam - Webcam Windows et OBS]]).
Webcam virtuelle Windows, plugin OBS, tous les réglages, 4K60, adaptation thermique.
Porte : Discord et OBS voient la caméra, **1 h** de stream sans arrêt thermique.

## Phase 6 — Finition
Budget batterie respecté, tests, UX, doc utilisateur.
Porte : tous les budgets de [[RULES]] (section Énergie) tenus.

## Phase 7 — Android (Samsung)
App Kotlin sur le même protocole et la même app PC.
Porte : mêmes portes que les phases 1 à 5.

## Plus tard
Partage d'écran iPhone (extension ReplayKit) : quand xtool construit les extensions de façon fiable (voir [[Points a tester]]), sinon avec Xcode sur le Mac d'Evan, en dernier ([[ADR-0009 Serveur et Mac]]). Idées classées : [[IDEES]].

Liens : [[STATE]], [[00-Accueil]]
