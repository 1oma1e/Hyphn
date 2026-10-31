---
type: spec
phase: 5 (en avance)
statut: validee
---
# Cam — Webcam Windows et OBS

## But
Discord, Teams, OBS, le navigateur… voient l'iPhone comme une vraie webcam « Hyphn », sans rien régler d'autre (demande d'Evan, 2026-10-31, [[ADR-0022 Webcam Windows par DLL qui decode]]).

## Hors périmètre
- Son ([[ADR-0018 Cam image seule et demarrage en pause]]).
- Plusieurs iPhone à la fois ([[IDEES]]).
- Effets sur l'image (flou, cadrage) : retirés de l'app tant qu'ils ne vont pas jusqu'à la webcam.

## Parcours
[[Parcours - Stream]] ; Réglages › Cam › Webcam Windows « Installer » sur le PC ([[PC - Reglages]]).

## Exigences
- **E1 — Installation une fois.** Bouton « Installer » dans Réglages : une seule demande administrateur (UAC). Copie de la DLL dans `C:\Program Files\Hyphn`, enregistrement, plugin OBS si OBS est installé. « Retirer » fait disparaître la webcam tout de suite, désinscrit la DLL et efface les dossiers (une DLL encore ouverte par une app part au redémarrage du PC).
- **E2 — Caméra de session.** Au lancement de Hyphn, la webcam « Hyphn » est créée pour ce compte Windows (Windows ajoute « Windows Virtual Camera » au nom). Elle disparaît quand Hyphn se ferme.
- **E3 — Flux.** L'app envoie le flux compressé de l'iPhone sur le tuyau `\\.\pipe\hyphn-vcam` seulement quand une app affiche la caméra. La DLL décode sur la carte graphique et met l'image au format demandé (1080p, 720p, 4K ; 30 ou 60 images/s ; NV12 ou RGB32).
- **E4 — Écran d'attente.** En pause, iPhone hors ligne ou Hyphn absent : la webcam montre l'écran d'attente (message, langues, style Animé ou Minimal), le même que dans l'app.
- **E5 — Image clé à la demande.** Quand un décodeur démarre ou saute des images, l'iPhone envoie une image clé tout de suite (`KeyRequest`), au lieu d'un gel jusqu'à 4 s.
- **E6 — Sécurité.** Le tuyau n'accepte que ce compte, le Frame Server (Local Service) et SYSTEM, jamais un autre PC ; l'app crée le tuyau en premier, aucun service ne peut en ajouter une instance, la DLL refuse un tuyau qui n'appartient pas à un compte utilisateur. L'installation admin vérifie l'empreinte de chaque DLL (gravée dans l'app).
- **E7 — OBS.** Source « Hyphn (iPhone) » dans OBS, même flux, même écran d'attente, à la taille de l'image de l'iPhone ; elle ne décode que quand elle est visible. OBS voit aussi la webcam Windows (Périphérique de capture vidéo).
- **E9 — HEVC absent.** Si la webcam ou OBS ne sait pas décoder le HEVC sur ce PC, l'iPhone passe en H.264 tant qu'ils sont ouverts.
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
1. `cargo test` : en-tête du tuyau, synchro « Afficher », demande d'image clé limitée.
2. L'app Caméra de Windows et OBS montrent l'écran d'attente, puis l'image de l'iPhone (capture).
3. Gestionnaire des tâches : processeur du PC bas pendant le flux (décodage sur la carte graphique), chiffre noté dans le journal.
