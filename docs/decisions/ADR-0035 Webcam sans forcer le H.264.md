---
type: decision
date: 2026-11-02
statut: accepte
---
# ADR-0035 Webcam sans forcer le H.264

## Contexte
Mesuré le 2026-11-02 ([[Latence et debit Cam]]) : dès que Discord ouvre la webcam Hyphn, tout le flux passe en H.264, la fenêtre comprise. La DLL de [[ADR-0022 Webcam Windows par DLL qui decode]] tourne dans le service Frame Server (compte Local Service), et elle n'y trouve pas de décodeur HEVC (`HEVC decoder no` dans `vcam.log`). Cause probable : le décodeur HEVC de Windows vient du Store et n'est installé que pour l'utilisateur (**non vérifié** sur Microsoft Learn).

Coût mesuré du H.264 forcé, en 4K60 par câble : encodage iPhone ~250 ms au lieu de 115 ms, 46 images/s au lieu de 60. Le décodage lent côté PC est déjà corrigé (SPS réécrit, E2b de [[Cam - Latence et fluidite]]).

La webcam propose jusqu'à la 4K aux apps (`kModes` dans `vcam.cpp`), mais Discord et Teams n'affichent pas plus que du 1080p.

## Options
| Option | Pour | Contre |
|---|---|---|
| A. **L'app décode pour la webcam.** Le code de décodage de la DLL (`feed.cpp`) tourne aussi dans l'app, où le HEVC est disponible. Il met l'image à la taille demandée sur la carte graphique, puis envoie des images brutes NV12 par le tuyau existant. La DLL ne fait plus que les afficher. | HEVC pour tout le monde ; 4K60 dans la fenêtre même pendant un appel ; la DLL devient plus simple ; on réutilise le code existant (zéro doublon) | Le tuyau porte des images brutes : 41 Mo/s en 720p30, jusqu'à 187 Mo/s en 1080p60 (un tuyau local le tient, **non mesuré**) ; une copie par le processeur à chaque image ; corrige l'option B de l'ADR-0022 |
| B. **La DLL décode le HEVC sans le décodeur du Store.** Elle embarque libavcodec (FFmpeg, LGPL) avec le décodage D3D11 de la carte graphique. | Rien ne change entre l'app et la DLL | Plusieurs Mo de plus dans la DLL ; licence LGPL à respecter ; code de décodage à tenir à jour |
| C. **Deux flux depuis l'iPhone** : HEVC pour la fenêtre, H.264 en 1080p au plus pour la webcam | Rien à décoder en plus sur le PC | L'iPhone encode deux fois : plus de chaleur et de batterie ; protocole à changer |
| D. **Rustine** : on garde le H.264 quand la webcam est ouverte, mais plafonné à 1080p (le maximum de la webcam) | Quelques lignes ; encodage H.264 1080p bien plus rapide qu'en 4K | La fenêtre perd la 4K pendant un appel ; le H.264 reste plus lourd que le HEVC |

## Décision
Choisi par Evan le 2026-11-02 : **D tout de suite, puis A**.

Recommandation de départ : **A**. C'est la seule option qui garde le HEVC partout sans faire encoder deux fois l'iPhone ni embarquer FFmpeg. La règle « effets d'image sur la carte graphique » ([[RULES]], PC) est respectée : décodage et mise à l'échelle restent sur la carte graphique, seule la copie vers le tuyau passe par le processeur. **D** peut être fait d'abord, en attendant A, si Evan veut un gain tout de suite.

## Conséquences
- Corrige l'option B de [[ADR-0022 Webcam Windows par DLL qui decode]] : le tuyau porte des images brutes à la taille demandée par l'app qui regarde, plus le flux compressé.
- Le plugin OBS lit le même tuyau : à adapter de la même façon ([[Cam - Webcam Windows et OBS]]).
- L'app décode seulement tant qu'une app affiche la webcam (message `HELLO` déjà en place).
- Vérifié avant de coder (2026-11-02) : le tuyau tient environ 2,4 Go/s, soit 1,3 ms par image 1080p ; le décodeur HEVC vient de l'app du Store « HEVC Video Extensions » (`HEVCDECODER_STORE.dll`). Un programme normal le voit, le service caméra non : la raison exacte n'est pas écrite par Microsoft (**non vérifié**).
- Fait (2026-11-02) : la DLL exporte son décodeur (`HyphnDecoderOpen`, `Push`, `Wait`, `Fill`, `Close`) ; l'app l'utilise pour un lecteur qui n'a pas le HEVC mais accepte `RAW` (`vcam.rs`, `RawFeed`). Essai hors app avec de vrais flux : HEVC et H.264 décodés, chaque image sort en 1,5 à 2 ms à 1280×720. Confirmé par Evan avec Discord, en HEVC 4K60 par câble (« parfait », sans chiffres notés).
- Bon choix si, avec Discord allumé en 4K60 par câble, « Infos du flux » montre du HEVC à 60 images/s et un total proche de 130 ms, et si le processeur du PC reste bas.

Liens : [[Decisions - Index]], [[Cam - Latence et fluidite]]
