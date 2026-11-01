---
type: spec
phase: 1
statut: validee
---
# Core — Liaison par câble

## But
Quand Evan branche son iPhone au PC, Hyphn passe par le câble tout seul : liaison instantanée, sans coupure du Wi-Fi, sans QR, et Cam et Drop plus rapides. Débranché, tout repart en Wi-Fi sans geste. Choix techniques : [[ADR-0031 Liaison par cable USB]].

## Hors périmètre
- Liaison quand l'app iPhone est fermée ou suspendue par iOS (après ~30 s en arrière-plan) : comme en Wi-Fi ([[Core - Reconnexion]], E6).
- Lire les photos (DCIM) ou la batterie par câble sans ouvrir l'app : plus tard ([[ADR-0006 Sante batterie par cable]], [[Parcours - Transfert]]).
- Recharger l'iPhone plus vite, plusieurs iPhone branchés en même temps (un seul iPhone en phase 1).
- PC sans iTunes ni Apple Devices : pas de câble, le Wi-Fi marche (E10).

## Parcours
[[Parcours - Liaison par cable]].

## Exigences
- **E1 — Détection.** L'app PC s'abonne à usbmux (`127.0.0.1:27015`, message `Listen`). Elle sait sans attendre quand un iPhone est branché (`Attached`, USB seulement) ou débranché (`Detached`). Aucun polling d'usbmux.
- **E2 — Écoute sur l'iPhone.** L'app iPhone écoute sur `127.0.0.1:47801` (`NWListener`) quand elle est au premier plan, et pendant la tâche de fond qui suit ([[ADR-0023 Connexion gardee et reconnexion facile]]). Elle arrête en même temps que la liaison Wi-Fi s'arrêterait. Pas d'écoute sur le Wi-Fi, donc pas de demande « réseau local » pour le câble.
- **E3 — Connexion.** iPhone branché et pas encore de liaison par câble → le PC ouvre une connexion usbmux vers le port 47801, puis réessaie toutes les 2 s tant que l'iPhone est branché (l'app peut être fermée). TCP sans délai (`nodelay`) des deux côtés.
- **E4 — Vérification.** TLS 1.3 mutuel avec les certificats de l'appairage ; sur le câble, le PC est client TLS et l'iPhone serveur. iPhone déjà relié : chacun compare l'empreinte de l'autre à celle gardée, différente → coupure et même message qu'en Wi-Fi ([[Core - Reconnexion]], E4). Puis l'iPhone envoie `Hello`, le PC répond `Welcome` : même session qu'en Wi-Fi.
- **E5 — Appairage par câble.** iPhone pas encore relié (écran « Scanner le QR ») et branché : l'iPhone accepte le certificat du PC sans empreinte connue et envoie `PairRequest` **sans jeton**. Le PC n'accepte un `PairRequest` sans jeton **que** sur une connexion qu'il a ouverte par usbmux. Ensuite, comme le QR : même code à 4 chiffres des deux côtés, seul l'iPhone répond « Oui, relier » / « Non » ([[Core - Appairage QR]], E6), 2 min sans réponse = « Non ». Après « Non », le PC ne redemande pas tant que l'iPhone reste branché.
- **E6 — Priorité au câble.** Une liaison par câble remplace la liaison Wi-Fi du même iPhone (la session Wi-Fi est fermée ; la vidéo de Cam repasse par le câble ; un Drop déjà en cours finit en Wi-Fi, le suivant passe par le câble). Tant que la liaison câble vit, l'iPhone ne cherche pas en Wi-Fi et le PC refuse un `Hello` Wi-Fi de cet iPhone.
- **E7 — Cam et Drop.** Sur le câble, l'iPhone envoie `CableOpen` sur la session ; le PC ouvre une connexion usbmux de plus, et l'iPhone la donne à la demande qui attend (Cam : `VideoHello`, Drop : `DropHello`). Rien en 5 s → échec, comme une connexion Wi-Fi refusée. Les règles des 30 s d'inactivité restent ([[RULES]], Énergie 2).
- **E8 — Débranchement.** `Detached` → le PC ferme tout de suite la session et les connexions de cet iPhone. L'iPhone voit la fermeture et repart aussitôt en Wi-Fi (dernière adresse + Bonjour, [[Core - Reconnexion]] E2, E3). Cam en direct : écran d'attente le temps de la bascule, puis « Afficher » reprend seul ([[ADR-0023 Connexion gardee et reconnexion facile]]).
- **E9 — État visible.** Sur le PC (carte de l'iPhone, Accueil) et sur l'iPhone (Accueil) : « Par câble » ou « Wi-Fi » à côté du point vert. Les infos de l'iPhone ([[Infos iPhone - Batterie et chaleur]]) passent par la liaison active.
- **E10 — Sans pilote Apple.** Port 27015 fermé au lancement → Réglages du PC affiche une fois « Câble : installe Apple Devices (Microsoft Store) ou iTunes ». Corrigé au codage (2026-11-01) : le PC regarde de nouveau toutes les 30 s (une connexion locale à `127.0.0.1`, rien sur le réseau), pour voir le câble dès qu'Apple Devices est installé ou que son service redémarre.

## Cas limites
| Cas | Ce qui se passe |
|---|---|
| iPhone branché, app fermée | Le PC réessaie toutes les 2 s (connexion locale, rien sur le réseau) ; à l'ouverture de l'app, point vert en moins de 2 s |
| « Faire confiance à cet ordinateur ? » pas encore accepté | Si usbmux refuse : PC « Accepte « Trust » sur l'iPhone », puis réessaie (non vérifié, voir ADR) |
| iPhone verrouillé depuis plus d'1 h (mode USB restreint) | Plus de données USB : Wi-Fi jusqu'au déverrouillage |
| Câble de charge seulement (sans données) | Pas d'`Attached` : Wi-Fi, rien à afficher |
| iPhone relié à un autre PC, branché sur ce PC | Le PC ne le connaît pas → refus « Ce PC ne connaît pas cet iPhone » ; l'iPhone garde son PC (pas d'appairage par câble pour un iPhone déjà relié) |
| Partage de connexion de l'iPhone actif | Sans effet sur usbmux (à vérifier, erreur 10060 vue en Wi-Fi, [[STATE]]) |
| Débranché en plein Drop | Le Drop s'arrête comme une coupure Wi-Fi ([[Drop - Photos vers le PC]]) ; à relancer |
| Deux iPhone branchés | Seul l'iPhone relié est pris ; un iPhone inconnu ne déclenche E5 que s'il n'y a aucun iPhone relié |

## Preuve
1. iPhone relié, app ouverte : brancher → « Par câble » des deux côtés ; temps noté (5 essais, but < 2 s).
2. iPhone neuf (après « Oublier ») : brancher, ouvrir l'app → code des deux côtés, « Oui » → relié sans QR. Capture.
3. Cam en direct par câble 10 min : aucune coupure ; latence notée et comparée au Wi-Fi (même scène, même réglages).
4. Drop de 1 Go par câble puis en Wi-Fi : durées notées.
5. Débrancher en plein Cam : retour en Wi-Fi seul, « Afficher » reprend ; temps noté (but < 10 s).
6. `cargo test` : appairage par câble refusé hors câble (jeton vide en Wi-Fi), câble prioritaire sur Wi-Fi, débranchement qui ferme la session.

## À vérifier avant le code
- usbmux `Connect` vers le port d'une app sans « Faire confiance » accepté. Non vérifié.
- Le crate `idevice` (fonction `usbmuxd`) parle bien au service Apple de Windows sur 27015 et reçoit `Attached` / `Detached`. Non vérifié (le protocole répond, testé à la main en Python).
- `NWListener` en TLS serveur avec certificat client demandé et vérifié par un bloc (`sec_protocol_options_set_peer_authentication_required`). À vérifier dans la doc Apple.

Liens : [[Specs - Index]], [[ROADMAP]]
