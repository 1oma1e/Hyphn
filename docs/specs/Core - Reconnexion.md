---
type: spec
phase: 1
statut: validee
---
# Core — Reconnexion

## But
Quand Evan ouvre Hyphn sur l'iPhone, il est reconnecté à son PC tout seul, **sans re-scanner**, et un PC qui a changé de certificat est refusé.

Deux choses différentes : le **lien** (appairage) est permanent jusqu'au bouton « Oublier » ([[Core - Appairage QR]], E10) ; la **connexion** n'existe que quand l'app iPhone est ouverte. Fermer l'app ne défait jamais le lien.

## Hors périmètre
- Premier appairage : [[Core - Appairage QR]].
- Connexion quand l'app iPhone est fermée ou en arrière-plan (iOS la suspend).
- Connexion hors du réseau local (internet, VPN).

## Parcours
[[Parcours - Scan QR]], partie « Les fois suivantes ».

## Exigences
- **E1 — Annonce.** L'app PC, quand elle tourne, annonce le service Bonjour `_hyphn._tcp` sur les cartes réseau qu'elle utilise. Le nom de l'annonce ne contient rien de privé, seulement un identifiant court tiré de l'empreinte.
- **E2 — Recherche.** L'iPhone ne cherche (`NWBrowser`) **que quand l'app est au premier plan**, et arrête dès qu'il est connecté ou passe en arrière-plan ([[RULES]], Énergie 2).
- **E3 — Raccourci.** En même temps que Bonjour, l'iPhone essaie la dernière IP et le dernier port connus. Le premier qui répond gagne (routeurs qui bloquent le multicast, [[IDEES]]).
- **E4 — Vérification.** TLS mutuel comme à l'appairage. Chaque côté compare l'empreinte de l'autre à celle qu'il a gardée. Différente → coupure immédiate et message « Ce PC a changé, relie-le à nouveau » (ou « Cet iPhone a changé » sur le PC). Jamais d'acceptation silencieuse.
- **E5 — État visible.** Point vert des deux côtés une fois connecté. L'iPhone met à jour la dernière IP connue.
- **E6 — Durée de vie.** La connexion de contrôle reste ouverte **tant que l'app iPhone est au premier plan** (les infos de l'iPhone et les commandes de Cam y passent, [[Infos iPhone - Batterie et chaleur]]) ; le point vert veut dire « connecté ». Corrigé le 2026-11-01 ([[ADR-0023 Connexion gardee et reconnexion facile]]) : en arrière-plan elle reste ouverte le temps qu'iOS le permet (~30 s), puis se ferme proprement. Une coupure (Wi-Fi perdu) est vue par le keepalive TCP du système (pas de message envoyé par l'app). La règle des 30 s d'inactivité ([[RULES]], Énergie 2) s'applique aux sockets de données (Cam, Drop) ([[ADR-0015 Lien permanent et connexion au premier plan]]). Liaison morte sans fermeture (PC quitté, Wi-Fi coupé) : le PC envoie un Ping toutes les 5 s ; sans nouvelles du PC pendant 15 s, l'iPhone ferme la liaison et repart en recherche tout de suite.
- **E7 — Hors ligne.** Rien trouvé en 10 s → « PC hors ligne », puis un nouvel essai toutes les 5 s tant que l'app est ouverte ; « Reconnecter » des deux côtés repart de zéro ([[ADR-0023 Connexion gardee et reconnexion facile]]).
- **E8 — Port.** Le PC écoute sur un port fixe ; s'il est pris, sur un port au hasard, gardé ensuite. Le port annoncé par Bonjour est celui du QR et celui gardé par l'iPhone.

## Cas limites
| Cas | Ce qui se passe |
|---|---|
| Le PC a changé d'IP (DHCP) | Bonjour le retrouve ; la nouvelle IP est gardée |
| Routeur qui bloque Bonjour | Le raccourci E3 marche si l'IP n'a pas changé ; sinon « PC hors ligne » |
| Réseau local refusé dans Réglages | Message + bouton Réglages ([[iPhone - Scan QR]]) |
| App PC fermée | « PC hors ligne » |
| Evan a cliqué « Oublier » sur le PC | Le PC refuse ; l'iPhone affiche « Ce PC ne te connaît plus, relie-le à nouveau » |
| iPhone passe en arrière-plan | Connexion fermée proprement ; le PC affiche « Vu il y a… » |

## Preuve
1. Fermer puis rouvrir l'app iPhone : point vert **sans scan**, temps entre l'ouverture et le point vert noté (5 essais).
2. Redémarrer le PC puis ouvrir l'app iPhone : reconnexion sans scan.
3. Remplacer le certificat du PC par un autre : refus + message. Capture.
4. Journal horodaté de l'iPhone : la recherche Bonjour s'arrête une fois connecté et quand l'app passe en arrière-plan ; la connexion se ferme en arrière-plan, et le PC passe à « Vu il y a… ».
5. « Oublier » sur le PC puis ouvrir l'app iPhone : message « Ce PC ne te connaît plus ». Capture.

## À vérifier avant le code
- Annonce Bonjour depuis Rust sous Windows 11 (piste : crate `mdns-sd`) à côté du service mDNS de Windows, et règle du pare-feu Windows (UDP 5353). Non vérifié.
Liens : [[Specs - Index]], [[ROADMAP]]
