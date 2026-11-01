---
type: decision
date: 2026-11-01
statut: accepte
---
# ADR-0031 Liaison par câble USB (usbmux)

## Contexte
Evan, 2026-11-01 : la liaison Wi-Fi coupe parfois quand un appareil se met en veille, et la latence monte jusqu'à 119 ms. Il veut un **mode câble** : iPhone branché → liaison instantanée, sans coupure, sans QR, et plus rapide pour Cam et Drop. Le cahier mettait le câble en phase 3 (Drop v2, libimobiledevice) ; Evan l'avance. Contraintes : rien sur internet, pas de droits admin pour l'app PC ([[RULES]]), protocole et TLS épinglé inchangés ([[Core - Appairage QR]]).

Ce que la recherche montre (2026-11-01) :
- Sous Windows, le câble passe par **usbmux**, fourni par le service « Apple Mobile Device » d'**iTunes** ou de l'app **Apple Devices** (Microsoft Store). Il écoute sur `127.0.0.1:27015`. Vérifié sur le PC d'Evan : iTunes (Store) installé, port 27015 ouvert, la commande `ListDevices` répond (0 appareil, iPhone non branché).
- usbmux sait ouvrir une connexion TCP **du PC vers un port de l'iPhone** (`Connect`), jamais dans l'autre sens. Il prévient aussi quand un iPhone est branché ou débranché (`Listen` : `Attached` / `Detached`).
- Côté iPhone, une app ordinaire écoute sur `127.0.0.1` (comme la bibliothèque PeerTalk, utilisée par Duet Display sur l'App Store). Une écoute sur `127.0.0.1` ne demande pas l'accès au réseau local et n'est pas visible en Wi-Fi.
- Crate Rust **`idevice`** (jkcoxson, auteur de netmuxd ; utilisé par iloader) : client usbmux en Rust pur, fonction `usbmuxd` seule = tokio + futures. Il resservira pour la batterie par câble ([[ADR-0006 Sante batterie par cable]]).
- iOS garde ses règles : une app en arrière-plan est suspendue après ~30 s, câble ou pas ([[ADR-0023 Connexion gardee et reconnexion facile]]). Le câble supprime les coupures **du Wi-Fi** (veille de la carte, réseau perdu), pas celles d'iOS.

## Options
| Option | Pour | Contre |
|---|---|---|
| A. usbmux d'Apple (iTunes / Apple Devices) + crate `idevice` côté PC, l'iPhone écoute sur `127.0.0.1` | Pilote officiel déjà installé chez Evan ; aucun admin ; même TLS et mêmes messages qu'en Wi-Fi ; `idevice` resert pour la batterie | Il faut iTunes ou Apple Devices sur le PC ; le PC ouvre les connexions (sens inverse du Wi-Fi) |
| B. Comme A, mais notre propre petit client usbmux (≈ 200 lignes + crate `plist`) | Une dépendance de moins | On réécrit ce qui existe déjà (règle « chercher avant de créer ») ; à refaire pour la batterie |
| C. Partage de connexion de l'iPhone par USB (carte réseau « Apple Mobile Device Ethernet ») | Zéro code : c'est du réseau IP | Demande un forfait avec partage ; le PC passe par l'iPhone pour internet ; erreur 10060 déjà vue ([[STATE]]) |
| D. Livrer libimobiledevice (`iproxy.exe`) avec Hyphn | Outil connu | Binaires C à embarquer et lancer ; même pilote Apple requis ; rien de plus que A |
| E. Notre propre pilote USB (WinUSB, comme `rusbmux`) sans iTunes | Plus besoin d'iTunes | Pilote à installer (admin), conflit avec le pilote Apple, gros travail |

### Appairer sans QR : deux façons
| Sous-option | Pour | Contre |
|---|---|---|
| 1. iPhone non relié + câble → même code à 4 chiffres des deux côtés, « Oui, relier » sur l'iPhone | Plus de QR du tout ; le câble prouve qu'on tient les deux appareils, le code prouve que c'est le bon PC | Une app malveillante installée sur l'iPhone pourrait se faire passer pour un PC : le code à comparer l'empêche |
| 2. Câble seulement pour un iPhone déjà relié par QR | Rien ne change pour la sécurité | Le QR reste obligatoire une fois |

## Décision
**A + 1**, choisi par Evan le 2026-11-01.
- Le PC surveille usbmux. iPhone branché → il ouvre une connexion vers le port **47801** de l'iPhone, toutes les 2 s tant que l'app iPhone n'écoute pas.
- Sur le câble, les rôles TLS s'inversent (le PC appelle) : le PC est client TLS, l'iPhone serveur TLS. Les deux certificats ([[Core - Appairage QR]], E4) et l'épinglage restent les mêmes ; seul le sens change. Après la poignée de main, l'iPhone envoie le premier message comme en Wi-Fi (`Hello`, `PairRequest`, `VideoHello`, `DropHello`).
- Cam et Drop : l'iPhone ne peut pas appeler le PC par le câble, il lui demande d'ouvrir une connexion de plus (nouveau message `CableOpen`).
- **Le câble a la priorité** : une liaison par câble remplace la liaison Wi-Fi ; tant qu'elle vit, l'iPhone ne cherche plus en Wi-Fi. Débranché → usbmux le dit tout de suite, la liaison câble se ferme et l'iPhone repart en Wi-Fi tout seul (E7 de [[Core - Reconnexion]]).
- Corrige [[RULES]] (Sécurité, « Appairage par QR ») : le câble devient la deuxième façon d'appairer, avec le même code et le même « Oui » sur l'iPhone.

## Conséquences
- Spec [[Core - Liaison par cable]] et maquette [[Parcours - Liaison par cable]].
- PC : nouveau `cable.rs` (usbmux), `tls.rs` gagne une config client, `link.rs` accepte un flux venu du câble ; `idevice` dans `Cargo.toml` (fonctions `usbmuxd` et `ring`, sans celles par défaut).
- iPhone : écoute `NWListener` sur `127.0.0.1:47801` au premier plan (`Cable.swift`), `PinnedConnection` accepte une connexion déjà ouverte.
- Protocole : `CableOpen` ; `PairRequest` sans jeton accepté seulement par le câble.
- Si le PC n'a ni iTunes ni Apple Devices : le PC le dit une fois dans Réglages (« Installe Apple Devices depuis le Microsoft Store pour le câble »), le Wi-Fi marche comme avant.
- Bon choix si : branché → point vert sans QR en moins de 2 s ; Cam et Drop passent par le câble ; débranché → Wi-Fi en moins de 10 s ; latence Cam plus basse et plus stable qu'en Wi-Fi (mesurée, pas supposée).
- Non vérifié : faut-il avoir accepté « Faire confiance à cet ordinateur » pour joindre le port d'une app ? Si oui, l'iPhone le demande au premier branchement (code de l'iPhone), le PC affiche « Accepte sur l'iPhone ». Et le mode USB restreint d'iOS (iPhone verrouillé depuis plus d'1 h) coupe les données USB jusqu'au déverrouillage.
