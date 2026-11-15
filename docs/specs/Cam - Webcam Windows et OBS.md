---
type: spec
phase: 5 (en avance)
statut: validee
---
# Cam — Webcam Windows et OBS

> E3, E9 et E10 changés le 2026-11-02 par [[ADR-0035 Webcam sans forcer le H.264]] (option A), validés par Evan le même jour.

## But
Discord, Teams, OBS, le navigateur… voient l'iPhone comme une vraie webcam « Hyphn », sans rien régler d'autre (demande d'Evan, 2026-10-31, [[ADR-0022 Webcam Windows par DLL qui decode]]).

## Hors périmètre
- Son ([[ADR-0018 Cam image seule et demarrage en pause]]).
- Plusieurs iPhone à la fois ([[IDEES]]).
- Effets sur l'image (flou, cadrage) : retirés de l'app tant qu'ils ne vont pas jusqu'à la webcam.

## Parcours
[[Parcours - Stream]] ; Réglages › Cam › Webcam Windows « Installer » sur le PC ([[PC - Reglages]]).

## Exigences
- **E1 — Installation toute seule** (demande d'Evan, 2026-11-01). L'installateur Hyphn (pour tout le PC) installe la webcam et le plugin OBS pendant l'installation de l'app, dans la même demande administrateur. Sans installateur (app de dev), Hyphn l'installe tout seul au lancement : Windows demande une fois « Oui » (on ne peut pas l'éviter) ; un « Non » est retenu, le bouton « Installer » de Réglages reste. DLL dans `C:\Program Files\Hyphn\native` (installateur) ou `C:\Program Files\Hyphn Webcam` (app), plugin OBS si OBS est installé. « Retirer » fait disparaître la webcam tout de suite, désinscrit la DLL et efface les dossiers (une DLL encore ouverte par une app part au redémarrage du PC).
- **E2 — Caméra de session.** Au lancement de Hyphn, la webcam « Hyphn » est créée pour ce compte Windows (Windows ajoute « Windows Virtual Camera » au nom). Elle disparaît quand Hyphn se ferme.
- **E3 — Flux.** L'app envoie le flux compressé de l'iPhone sur le tuyau `\\.\pipe\hyphn-vcam` seulement quand une app affiche la caméra.
  - **Webcam Windows** (DLL dans le Frame Server) : l'app décode elle-même le flux de l'iPhone (HEVC ou H.264), avec le même code que la DLL (`feed.cpp`, chargé dans l'app). Elle met l'image à la taille que la webcam demande, sur la carte graphique, puis envoie des **images brutes NV12** (message `RAW`). La DLL ne décode plus : elle copie l'image, ou la convertit en RGB32 si l'app qui regarde le demande. Mesuré le 2026-11-02 : le tuyau tient environ 2,4 Go/s, soit 1,3 ms par image 1080p (il faut 187 Mo/s en 1080p60).
  - **OBS** (plugin dans le processus OBS, qui voit le décodeur HEVC) : flux compressé comme avant, décodé par le plugin.
- **E4 — Écran d'attente.** En pause, image gelée, iPhone hors ligne ou Hyphn absent : la webcam montre l'écran d'attente (message, style Animé ou Minimal), le même que dans l'app, envoyé **à l'endroit** pour que les autres le lisent sur Discord ([[ADR-0024 Ecran d'attente a l'endroit dans la webcam]]). Boutons « Miroir » et « Tourner » (90° à chaque clic) à côté des objectifs : appliqués par l'iPhone à la vidéo, jamais à l'écran d'attente. Dessin (maquette J, 2026-11-01) : enseigne néon Hyphn suspendue (anneaux corail et cyan, barre blanche où des paquets lumineux vont du PC à l'iPhone et retour), et le message en Geist fin qui arrive lettre par lettre ; « Animé » ajoute rayons de lumière, poussière, balancement et grésillement. Message par défaut en 18 langues, 2,6 s chacune (français, anglais, espagnol, allemand, italien, portugais, néerlandais, polonais, turc, russe, ukrainien, arabe, hindi, chinois, japonais, coréen, vietnamien, indonésien). Rien d'autre à l'écran dans la webcam ; la fenêtre Hyphn ajoute une ligne d'état (« Aucun iPhone relié »…). Image en retard alors que l'iPhone est relié et en direct (PC occupé par un jeu, scène immobile) : la webcam garde la dernière image jusqu'à 10 s, jamais l'écran d'attente ; sans iPhone, l'écran d'attente vient après 1,5 s (2026-11-15, Discord passait à l'écran d'attente pendant un jeu). Pour tenir pendant un jeu, Hyphn refuse le ralentissement de Windows pour les apps en arrière-plan (EcoQoS), décode pour la webcam en priorité « au-dessus de la normale », et la fenêtre n'est pas ralentie quand elle est cachée (effets). Chaque trou de plus de 0,5 s est noté dans `C:\ProgramData\Hyphn\vcam.log` avec sa durée.
- **E5 — Image clé à la demande.** Quand un décodeur démarre ou saute des images, l'iPhone envoie une image clé tout de suite (`KeyRequest`), au lieu d'un gel jusqu'à 4 s.
- **E6 — Sécurité.** Le tuyau n'accepte que ce compte, le Frame Server (Local Service) et SYSTEM, jamais un autre PC ; l'app crée le tuyau en premier, aucun service ne peut en ajouter une instance, la DLL refuse un tuyau qui n'appartient pas à un compte utilisateur. L'installation admin vérifie l'empreinte de chaque DLL (gravée dans l'app).
- **E7 — OBS.** Source « Hyphn (iPhone) » dans OBS, même flux, même écran d'attente, à la taille de l'image de l'iPhone ; elle ne décode que quand elle est visible. OBS voit aussi la webcam Windows (Périphérique de capture vidéo).
- **E9 — HEVC absent.** L'iPhone ne passe en H.264 que si **l'app elle-même** (ou OBS) ne sait pas décoder le HEVC sur ce PC, et alors en 1080p au plus ([[ADR-0035 Webcam sans forcer le H.264]], D). La webcam Windows ne l'impose plus.
- **E10 — Taille demandée.** La webcam dit à l'app la taille qu'on lui demande (`HELLO`, puis `SIZE` si Discord change de taille). L'app envoie cette taille, **1080p au plus** (3 Mo par image) : une app qui demande la 4K à la webcam reçoit du 1080p, agrandi par la carte graphique. Si l'app ne peut pas décoder (DLL installée plus ancienne, sans décodeur, ou pas de HEVC sur ce PC), elle repasse au flux compressé, comme avant. La DLL utilisée est celle installée dans Program Files (modifiable seulement en admin), dont l'empreinte est vérifiée à l'installation (E6).
- **E8 — Synchro.** « Afficher » sur l'iPhone ou sur le PC change l'autre aussitôt ; l'état « en direct » appartient au PC, l'iPhone ne le change que sur un vrai appui (`CamState.by_user`).

## Cas limites
| Cas | Ce qui se passe |
|---|---|
| Hyphn fermé | La webcam n'existe plus (caméra de session) |
| Discord ouvre la caméra en pause | Écran d'attente ; « Afficher » envoie l'image |
| Wi-Fi saturé | L'iPhone baisse son débit, puis remonte ; une image en retard est sautée et une image clé suit |
| DLL mise à jour pendant qu'elle sert | L'ancienne est renommée, la nouvelle copiée ; elle sert au prochain usage |
| Admin refusé | Message « installation annulée », rien n'est changé |

## Preuve
1. `cargo test` : en-tête du tuyau (dont `RAW` et `SIZE`), synchro « Afficher », demande d'image clé limitée, pas de H.264 forcé par la webcam.
4. Discord allumé en 4K60 par câble : « Infos du flux » montre 4K à 60 images/s et un total proche de 130 ms (contre 372 ms le 2026-11-02).
2. L'app Caméra de Windows et OBS montrent l'écran d'attente, puis l'image de l'iPhone (capture).
3. Gestionnaire des tâches : processeur du PC bas pendant le flux (décodage sur la carte graphique), chiffre noté dans le journal.
