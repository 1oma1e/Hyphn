---
type: decision
date: 2026-10-31
statut: accepte
---
# ADR-0022 Webcam Windows par DLL qui décode

## Contexte
Evan veut tout de suite la webcam Windows et OBS (« fais tout d'un coup », 2026-10-31), donc la phase 5 commence en avance. Windows 11 charge la webcam virtuelle (`MFCreateVirtualCamera`) dans son service Frame Server (compte Local Service), pas dans l'app Hyphn. Il faut donc faire passer l'image de l'app vers ce service, en gardant le PC sobre ([[RULES]], Énergie).

## Options
| Option | Pour | Contre |
|---|---|---|
| A. L'app décode et pousse des images brutes (mémoire partagée) | DLL simple | 4K NV12 = 12 Mo par image : énorme ; l'app décode même quand personne ne regarde |
| B. L'app pousse le flux **compressé** sur un tuyau nommé ; la DLL décode sur la carte graphique | ~40 Mb/s seulement entre les deux ; décodage seulement quand une app affiche la caméra | DLL plus grosse (décodeur Media Foundation) |
| C. Pilote ou caméra DirectShow | Vieilles apps | Non officiel sous Windows 11, signé, compliqué |

## Décision
**B**, avec un plugin OBS qui lit le même tuyau.
- `apps/desktop-vcam/` : DLL C++ (Media Foundation, Direct3D 11), d'après VCamSample (MIT). Décodeur matériel HEVC/H.264, mise à l'échelle par le processeur vidéo de la carte graphique, écran d'attente dessiné par Direct2D (même design que l'app).
- Tuyau `\\.\pipe\hyphn-vcam` : ouvert seulement par ce compte Windows, le Frame Server (Local Service) et SYSTEM ; jamais à distance. L'app le crée en premier (`first_pipe_instance`) ; les services n'ont pas le droit d'en créer une autre instance ; la DLL refuse un tuyau qui n'appartient pas à un compte utilisateur et ne laisse pas le serveur agir en son nom (`SECURITY_IDENTIFICATION`). Un programme lancé par le même compte Windows reste hors de portée de cette protection.
- La caméra vit le temps de l'app (`MFVirtualCameraLifetime_Session`) : rien ne reste quand Hyphn est fermé.
- Installation une seule fois en admin (bouton dans Réglages) : DLL copiée dans `C:\Program Files\Hyphn` (lisible par le service), `regsvr32`, plugin OBS dans `C:\ProgramData\obs-studio\plugins`. Le script d'installation est **dans l'exe** (pas lu sur le disque) et vérifie l'empreinte SHA-256 de chaque DLL copiée, gravée dans l'exe au build : une DLL remplacée dans le dossier de l'utilisateur n'est jamais enregistrée.
- Écran d'attente : deux styles, « Animé » et « Minimal » (« Trame » et « Scène floutée » de [[ADR-0018 Cam image seule et demarrage en pause]] retirés).

## Conséquences
- Phase 5 commencée en avance ; la porte reste : Discord et OBS voient la caméra, 1 h de stream sans arrêt thermique ([[ROADMAP]]).
- Spec [[Cam - Webcam Windows et OBS]].
- Preuve qu'on a bien choisi : l'app Caméra de Windows et OBS montrent l'image ; le processeur du PC reste bas (décodage sur la carte graphique).
