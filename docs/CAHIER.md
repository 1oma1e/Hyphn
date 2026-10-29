# Cahier de conception — App iPhone ↔ PC (Cam + Transfert)

29 Oct 2026 · @Evan

> Export Markdown du document d'origine, enregistré tel quel le 2026-10-29. Ce fichier est la source de départ : il n'est plus modifié. Les évolutions vont dans les autres docs (VISION, ROADMAP, ARCHITECTURE, RULES) et dans les ADR de `decisions/`.

## 1. Vision et nom

Une app iPhone + une app PC qui se connectent en scannant un QR code. Elles font trois choses mieux qu'iVCam : webcam virtuelle haute qualité en Wi-Fi, transfert de photos, vidéos et fichiers propre et trié (Wi-Fi ou câble), et suivi de l'appareil (batterie, température, stockage). Priorité iPhone, Samsung à la toute fin.

Ce qui doit nous rendre meilleurs qu'iVCam, Camo et EpocCam :

- Appairage en 2 secondes par QR code, sans compte, 100 % local et chiffré
- Qualité qui s'adapte toute seule à la chauffe et au Wi-Fi au lieu de planter
- Télémétrie en direct côté PC : débit, latence, batterie et température de l'iPhone
- Plugin OBS natif en plus de la webcam virtuelle, sans filigrane ni abonnement
- Transfert avec vraie progression : taille, vitesse, temps restant, reprise après coupure

### Idées de noms

| Nom | Idée | Noms des modules |
|---|---|---|
| Hyphn (favori) | Le trait d'union entre ton iPhone et ton PC | Hyphn Cam · Hyphn Drop · Hyphn Pulse |
| Ferry | Le bac qui fait passer vidéo et fichiers d'une rive à l'autre | Ferry Cam · Ferry Drop |
| Lynx | Lien + l'animal aux yeux perçants (la caméra) | Lynx Cam · Lynx Drop |
| Ponto | Le pont entre deux appareils | Ponto Cam · Ponto Drop |
| Tandem | Deux appareils qui roulent ensemble | Tandem Cam · Tandem Drop |
| Orbit | Le téléphone en orbite autour du PC | Orbit Cam · Orbit Drop |

Aucune disponibilité vérifiée. Claude Code doit checker l'App Store, GitHub, les noms de domaine et l'EUIPO avant de valider (c'est dans le prompt de la section 10).

## 2. Ce qu'iOS permet vraiment

iOS enferme chaque app dans un « bac à sable ». Certaines demandes sont donc impossibles telles quelles. Ce tableau fixe ce qu'on promet et ce qu'on contourne.

| Demande | Possible ? | Comment / contournement |
|---|---|---|
| Caméra en 4K60 HEVC, choix de l'objectif, réglages manuels | Oui | App native : AVFoundation + encodeur matériel VideoToolbox |
| Caméra qui tourne écran verrouillé ou app en fond | Non | iOS coupe la caméra en arrière-plan (forum Apple). L'app reste au premier plan avec un mode « écran noir » et la luminosité au minimum |
| Toutes les photos et vidéos en qualité originale (HEIC, ProRAW, ProRes, Live Photos) | Oui | PhotoKit avec accès complet. Les originaux stockés sur iCloud sont téléchargés d'abord |
| Photos (dossier DCIM) par câble sans ouvrir l'app | Oui | Côté PC avec libimobiledevice (service AFC, limité au dossier Media) |
| Fichiers de l'app Fichiers | Oui, au choix | L'utilisateur choisit les fichiers (sélecteur de documents) |
| Brouillons TikTok et données des autres apps | Non | Elles sont enfermées dans leur bac à sable. Même par câble, seules les apps qui activent le partage de fichiers sont lisibles. Contournement : dans TikTok, enregistrer le brouillon sur l'appareil, il arrive dans Photos |
| Batterie (niveau, en charge), mode économie, température, stockage | Oui | API publiques iOS |
| Santé de la batterie et nombre de cycles | Par câble seulement | Diagnostics libimobiledevice côté PC (à tester sur iOS 26) |
| Sauvegarde auto à heure fixe | En partie | iOS choisit le moment (souvent en charge + Wi-Fi). Pour être plus précis : une automatisation Raccourcis qui lance l'app |
| Partage d'écran de l'iPhone | Plus tard | Demande une extension ReplayKit, que xtool ne sait pas encore construire |
| Contrôle de l'iPhone depuis le PC | Non | Abandonné |

## 3. Installer sans payer : SideStore + ton serveur Linux 24/7

On compile sur le serveur Linux avec xtool (pas besoin de Mac), on installe avec SideStore, et SideStore re-signe l'app tout seul tous les 7 jours. Tes données, réglages et connexions sont gardés, puisque c'est une mise à jour par-dessus l'app.

### Le rôle de chaque pièce

- **xtool** (sur le serveur) : construit l'app iOS depuis Linux et peut l'installer par câble. Il sait construire un paquet SwiftPM en app iOS, puis la signer et l'installer. Il faut quand même récupérer le SDK iOS depuis le fichier Xcode.xip d'Apple (HN, créateur de xtool).
- **SideStore** (sur l'iPhone) : installe et rafraîchit les apps directement depuis l'iPhone grâce à un VPN local, LocalDevVPN, disponible sur l'App Store. Un ordinateur n'est nécessaire qu'une fois, pour l'installation avec iloader (guide).
- **Automatisation Raccourcis** : un raccourci quotidien « Refresh All », comme ça tu n'y penses jamais (tuto).
- **Serveur anisette perso** (Docker sur le serveur) : SideStore et AltStore ont besoin d'un serveur « anisette » pour parler à Apple. Les serveurs publics tombent parfois, et le sideloading tombe avec eux (Korben). En héberger un chez toi supprime ce point faible.
- **Plan B** : AltServer-Linux + netmuxd sur le serveur, pour un rafraîchissement AltStore en Wi-Fi (exemple de setup).

### Règles à respecter

- Toujours signer avec le même Apple ID (un Apple ID secondaire dédié). Sinon l'app perd l'accès à ses données du Keychain.
- Limite de 3 apps actives, SideStore compris. Il reste donc 2 places.
- Mode développeur activé et code de verrouillage obligatoire pour le profil VPN.
- Si le rafraîchissement rate pendant 7 jours, l'app ne s'ouvre plus mais rien n'est perdu : un rafraîchissement suffit.
- Usage perso uniquement. Ces outils sont dans une zone grise des conditions d'Apple.

## 4. Module Cam : webcam virtuelle haute qualité en Wi-Fi

L'iPhone filme, encode en HEVC avec la puce dédiée et envoie le flux en Wi-Fi. Le PC décode avec le GPU et le publie comme une vraie webcam. Objectif : 4K60 quand l'iPhone et le Wi-Fi suivent, et une baisse automatique au lieu d'un plantage quand il chauffe.

### Le chemin d'une image

1. **Capture** : AVCaptureSession avec le format choisi (objectif, 4K/1080p, 30/60 fps). Pas de traitement d'image sur le CPU.
2. **Encodage** : VideoToolbox HEVC (ou H.264 en secours) en mode temps réel, sur la puce dédiée, ce qui chauffe beaucoup moins que le CPU.
3. **Transport** : v1 en TCP + TLS (simple et suffisant en réseau local), v2 en UDP via SRT ou QUIC pour baisser la latence et mieux encaisser les pertes.
4. **Décodage PC** : décodeur matériel du GPU (NVIDIA, Intel ou AMD) via FFmpeg ou Media Foundation.
5. **Sortie** :
   - Webcam virtuelle Windows 11 avec MFCreateVirtualCamera. Il faut Windows build 22000 minimum, et Windows ajoute « Windows Virtual Camera » au nom (doc Microsoft). Point de départ : VCamSample.
   - Plugin OBS natif : la meilleure qualité pour streamer, sans conversion intermédiaire.
   - Linux plus tard : v4l2loopback.

### Réglages « full settings »

Objectif (ultra grand-angle, grand-angle, télé), résolution, fps, codec, débit, mise au point, exposition, ISO, balance des blancs, zoom, stabilisation, miroir, lampe, HDR, micro de l'iPhone, profils enregistrés.

### Ordres de grandeur de débit (à mesurer)

| Mode | Débit HEVC visé | Réseau conseillé |
|---|---|---|
| 1080p30 | 8-12 Mb/s | Wi-Fi 5 GHz |
| 1080p60 | 12-20 Mb/s | Wi-Fi 5 GHz |
| 4K30 | 25-40 Mb/s | Wi-Fi 6, PC en Ethernet |
| 4K60 | 40-60 Mb/s | Wi-Fi 6, PC en Ethernet, routeur proche |

### Anti-chauffe et anti-batterie

- Pas d'aperçu sur l'iPhone pendant le stream, plus un mode écran noir et la luminosité au minimum. L'écran est l'un des plus gros consommateurs.
- Adaptation automatique selon ProcessInfo.thermalState et la pression système de la caméra. Apple conseille de réduire CPU, GPU et fps quand ça chauffe (guide Apple) :
  - nominal ou fair : réglages demandés
  - serious : 60 → 30 fps et débit -30 %
  - critical : 1080p30 et alerte sur le PC
- Mode éco auto quand le mode économie d'énergie de l'iPhone est activé.
- HDR coupé par défaut (il coûte cher en calcul).
- Conseils matériels affichés dans l'app : retirer la coque, support ventilé, charge par câble plutôt que MagSafe, limite de charge à 80 % dans les réglages Batterie.
- La télémétrie (température, batterie, fps réels, latence) s'affiche sur le PC, pas sur l'iPhone.

## 5. Module Transfert : Wi-Fi ou câble, trié et propre

Deux chemins mènent au même écran PC : par Wi-Fi via l'app iPhone (accès à toute la photothèque), ou par câble via le PC seul (plus rapide, sans ouvrir l'app). On voit tout trié, avec taille, vitesse et temps restant.

### Les chemins

- **Wi-Fi (via l'app)** : PhotoKit liste toutes les photos et vidéos. On récupère les originaux (HEIC, ProRAW DNG, ProRes, la paire photo + vidéo des Live Photos, original vs modifié). Si iCloud est en « stockage optimisé », l'original est téléchargé d'iCloud avant l'envoi (à afficher dans la progression).
- **Câble (via le PC)** : libimobiledevice lit le dossier DCIM et les infos de l'appareil sans ouvrir l'app.
- **PC → iPhone** : au choix, dans Photos ou dans le dossier de l'app. Ce dossier est visible dans l'app Fichiers si on active UIFileSharingEnabled + LSSupportsOpeningDocumentsInPlace, et lisible depuis le PC par câble.
- **Fichiers** : l'utilisateur les choisit dans l'app Fichiers.

### Tri côté PC

- Dossiers Année/Mois d'après la date EXIF réelle (pas la date de copie)
- Filtres : photos, vidéos, captures d'écran, selfies, ProRAW, ProRes, Live Photos, rafales
- Doublons détectés par empreinte (hash) + identifiant PhotoKit : rien n'est copié deux fois
- Albums de l'iPhone gardés en option

### Progression propre

- Taille totale, fichier en cours, nombre restant
- Vitesse lissée (moyenne glissante) et temps restant = reste à envoyer / vitesse moyenne
- Pause, reprise et reprise après coupure : envoi en blocs de 4 à 8 Mo avec position de reprise
- Vérification d'intégrité à la fin (xxHash ou SHA-256)
- Historique des transferts

### Sauvegarde automatique

Tâche de fond iOS (BGProcessingTask) quand l'iPhone est en charge et sur le Wi-Fi maison. iOS choisit l'heure exacte, donc on ajoute une automatisation Raccourcis (par exemple « en charge après 23 h ») qui déclenche la sauvegarde. Destination : le PC, ou le serveur Linux s'il est allumé 24/7.

### Brouillons TikTok

Impossible à récupérer directement (voir section 2). L'app affichera un petit guide : enregistrer le brouillon sur l'appareil dans TikTok, et il sera transféré avec les vidéos.

## 6. Module Appareil et règles d'énergie

Le PC affiche en permanence l'état de l'iPhone. L'app iPhone suit une règle de base : elle ne consomme rien quand elle ne fait rien.

### Données affichées

| Donnée | Source |
|---|---|
| Batterie (%, en charge ou non) | App iPhone, API UIDevice |
| Mode économie d'énergie | App iPhone, API ProcessInfo |
| État thermique (nominal → critical) | App iPhone, thermalState |
| Stockage libre / total | App iPhone |
| Modèle, version d'iOS | App iPhone ou câble |
| Réseau (Wi-Fi ou câble, débit, latence mesurée) | Mesuré par l'app |
| Santé batterie, cycles | Câble uniquement, diagnostics libimobiledevice (à tester) |

### Règles d'énergie (obligatoires dans le code)

1. Aucune boucle de polling. Tout fonctionne sur événements (notifications batterie et thermique).
2. Bonjour actif seulement quand l'app est ouverte. Les sockets se ferment après 30 s d'inactivité.
3. Encodage et décodage matériels uniquement, jamais de traitement d'image sur le CPU.
4. Envois groupés : de gros blocs plutôt que des milliers de petits messages.
5. Mode économie d'iOS respecté : qualité réduite automatiquement.
6. Budget mesuré : en phase 1, on mesure la consommation (% de batterie par heure, température) pour chaque mode, on fixe un budget, et chaque version est comparée à ce budget.
7. Garde-fou : sous 15 % sans charge, alerte sur le PC et passage en qualité réduite.

## 7. Architecture, stack et organisation

Trois machines, un protocole commun et versionné. L'iPhone et le PC parlent directement en local. Le serveur Linux construit, signe et sert d'infrastructure (anisette, sauvegarde), mais n'est jamais indispensable pour streamer.

```
          QR code (IP, port, empreinte du certificat, jeton unique)
   iPhone ◄───────────────────────────────────────────────── PC Windows 11
   App Swift / SwiftUI                                    App Rust + Tauri
   ├─ Core : Bonjour, appairage, TLS ── contrôle TCP+TLS ──► ├─ Core : découverte, appairage
   ├─ Cam : AVFoundation + HEVC ─────── média UDP/SRT ──► ├─ Cam : décodage GPU
   │                                                      │   ├─ Webcam virtuelle (C++, MF)
   │                                                      │   └─ Plugin OBS
   ├─ Drop : PhotoKit, fichiers ─────── blocs TLS ───────► ├─ Drop : tri, doublons, historique
   └─ Pulse : batterie, thermique ─────── événements ───────► └─ Pulse : tableau de bord
                                                               │ câble USB
                                                               └─ libimobiledevice (DCIM, infos)

   Serveur Linux 24/7 (Docker) : xtool (build + signature) · anisette · AltServer plan B · sauvegarde
```

### Stack

| Partie | Choix | Pourquoi |
|---|---|---|
| App iPhone | Swift 6, SwiftUI, AVFoundation, VideoToolbox, PhotoKit, Network.framework | Natif = pleine qualité caméra et meilleure efficacité énergétique |
| Build iPhone | xtool (SwiftPM) sur le serveur Linux | Pas de Mac, builds rapides |
| App PC | Rust + Tauri (interface), FFmpeg pour le décodage GPU | Léger, rapide, bon pour le réseau |
| Webcam virtuelle | DLL C++ Media Foundation (basée sur VCamSample) | Seule API officielle sous Windows 11 |
| Protocole | Protobuf versionné dans protocol/ | Le même contrat pour iPhone, PC et plus tard Android |
| Appairage | QR code + certificat épinglé (à la LocalSend / KDE Connect) | Pas de compte, pas de cloud |
| Infra | Docker Compose sur le serveur | Tout se relance tout seul |

Hypothèse : le PC est sous Windows 11. Si ce n'est pas le cas, la webcam virtuelle change (macOS : Camera Extension, Linux : v4l2loopback).

### Organisation du repo (monorepo)

```
hyphn/
├─ CLAUDE.md                 # court : commandes, conventions, pièges
├─ .claude/                  # skills (session-start, session-end), hooks, agents
├─ docs/
│  ├─ STATE.md               # où on en est, prochaine étape (lu à chaque session)
│  ├─ VISION.md · ROADMAP.md · ARCHITECTURE.md · RULES.md
│  ├─ decisions/             # ADR-0001-xxx.md, une décision par fichier
│  ├─ research/              # concurrents, API, mesures
│  └─ sessions/              # journal AAAA-MM-JJ.md
├─ protocol/                 # .proto + doc du protocole
├─ apps/ios/                 # SwiftPM + xtool.yml
├─ apps/desktop/             # Rust + Tauri
├─ apps/desktop-vcam/        # DLL C++ webcam virtuelle
├─ apps/obs-plugin/
├─ infra/                    # docker-compose : anisette, altserver, build
└─ apps/android/             # à la toute fin
```

## 8. Roadmap par phases

On avance phase par phase, et chacune a une porte de sortie mesurable. Pas de code avant que la phase 0 soit validée. Samsung arrive seulement quand toute la partie iPhone est terminée.

| Phase | Contenu | Porte de sortie (on passe à la suite quand…) |
|---|---|---|
| 0. Fondations | Recherche, règles, docs, maquettes Obsidian, nom choisi, xtool + SideStore + anisette sur le serveur | Un « Hello » SwiftUI tourne sur l'iPhone et se rafraîchit tout seul pendant 2 semaines |
| 1. Socle | Bonjour, appairage QR, TLS épinglé, écran Pulse (batterie, thermique) | L'iPhone apparaît sur le PC en moins de 3 s après le scan, sans re-scan au lancement suivant |
| 2. Drop v1 | Parcours de la photothèque, envoi vers le PC, progression et temps restant, tri Année/Mois | 10 Go transférés sans erreur, hash vérifiés |
| 3. Drop v2 | Câble (libimobiledevice), PC → iPhone, reprise après coupure, doublons, sauvegarde auto | Coupure Wi-Fi en plein transfert, reprise sans rien renvoyer |
| 4. Cam v1 | 1080p30 HEVC → fenêtre sur le PC, mesure de latence | Latence de bout en bout mesurée et notée, 30 min sans décrochage |
| 5. Cam v2 | Webcam virtuelle Windows, plugin OBS, tous les réglages, 4K60, adaptation thermique | Discord et OBS voient la caméra, 1 h de stream sans arrêt thermique |
| 6. Finition | Budget batterie respecté, tests, UX, doc utilisateur | Tous les budgets de la section 6 tenus |
| 7. Samsung | App Android (Kotlin) branchée sur le même protocole et la même app PC | Mêmes portes que les phases 1 à 5 |
| Plus tard | Partage d'écran iPhone (extension ReplayKit) | Quand xtool sait construire les extensions, ou avec un Mac |

## 9. Méthode de travail avec Claude Code

On travaille par sessions courtes et cadrées. Chaque session part de docs/STATE.md et se termine par sa mise à jour. L'ordre est toujours le même : doc → maquette → code. Les docs Claude Code conseillent de garder CLAUDE.md court et de mettre les procédures dans des skills et les règles sans exception dans des hooks (best practices Claude Code).

### Rituel de début de session (/session-start)

1. Lire docs/STATE.md, le dernier journal dans docs/sessions/, puis ROADMAP.md et RULES.md.
2. Vérifier la cohérence : est-ce qu'une doc contredit une autre, le code ou une décision (ADR) ? Si oui, on le signale et on corrige avant tout.
3. Annoncer l'objectif de la session en une phrase et la vérification qui prouvera qu'il est atteint.

### Rituel de fin de session (/session-end)

1. Mettre à jour STATE.md (fait, pas fait, prochaine étape exacte).
2. Écrire docs/sessions/AAAA-MM-JJ.md : décisions, problèmes, ce qu'on a appris.
3. Ajouter un ADR pour chaque décision technique, et compléter RULES.md si une nouvelle règle est apparue.
4. Relancer le contrôle de cohérence, puis faire un commit.

### Ce qui va où

| Type d'info | Où | Pourquoi |
|---|---|---|
| Commandes de build et de test, conventions, pièges | CLAUDE.md (moins de 200 lignes) | Chargé à chaque session, donc il doit rester court |
| Procédures (rituels, release, ajout d'un module) | .claude/skills/ | Lues seulement quand c'est utile |
| Règles sans exception (ne jamais lire .env, build vert avant de finir) | Hooks + règles deny dans .claude/settings.json | Appliquées à tous les coups |
| Lecture automatique de STATE.md | Hook SessionStart | Garanti à chaque démarrage |
| Maquettes, écrans, parcours | Vault Obsidian (dossier du projet), lié depuis docs/ | Vue d'ensemble visuelle |
| Relecture de code | Sous-agent reviewer en lecture seule + /code-review | Un œil neuf qui n'a pas écrit le code |

### Bonnes habitudes

- Un prompt = un objectif + des fichiers cités + une vérification concrète.
- Pas de « IMPORTANT » en majuscules : si une règle est ignorée, elle devient un hook.
- /clear entre deux tâches sans rapport. Après 2 corrections ratées, /clear et un meilleur prompt.
- Chaque fonctionnalité a une preuve : un test, une mesure ou une capture.

## 10. Prompt Claude Code de démarrage

Le prompt de démarrage de la session de préparation (29 Oct 2026) n'est pas recopié ici : il a été exécuté, son résultat est dans `docs/sessions/2026-10-29.md`.

## Sources (liens du document d'origine)

- xtool — GitHub
- xtool — discussion HN (SDK depuis Xcode.xip)
- SideStore : installation avec iloader + LocalDevVPN
- SideStore : rafraîchissement auto par Raccourcis
- Korben — AltStore Classic et serveurs anisette
- AltServer-Linux + netmuxd — exemple de setup
- Microsoft — MFCreateVirtualCamera
- VCamSample — webcam virtuelle Windows 11
- Apple — réagir aux changements thermiques
- Forum Apple — caméra interdite en arrière-plan
- libimobiledevice
- afcclient — accès AFC / house_arrest
- Claude Code — Best practices
- iVCam — App Store

> Les URL n'ont pas survécu au copier-coller. Les liens vérifiés sont dans `docs/research/SOURCES.md`.
