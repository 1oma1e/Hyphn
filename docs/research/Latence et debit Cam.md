---
type: recherche
date: 2026-11-02
---
# Latence et débit de Cam — état et pistes

Point de départ de la session « latence, fluidité, qualité ». Ce qui est **mesuré** est dit ; le reste est une hypothèse à vérifier.

## Ce qu'Evan voit (2026-11-02, iPhone 16 Pro Max, app 0.8.0 (13))
- Petit retard entre la voix et les lèvres, surtout au-dessus de 1080p.
- En 1080p60 à 80 Mb/s (choisi à la main) : un peu moins de retard, mais des **micro-saccades**.
- Pas encore de mesure chiffrée « verre à verre ».

## Le trajet d'une image aujourd'hui
1. Capteur → `AVCaptureVideoDataOutput` (images en retard jetées).
2. VideoToolbox HEVC : temps réel, pas de réordonnancement, `MaxFrameDelayCount = 0`.
3. File d'envoi de l'iPhone : depuis 0.8.0 (13), une image est sautée au-delà de ~180 ms en attente ([[Cam - Flux v1]], E5).
4. Wi-Fi ou câble (TCP + TLS, `nodelay`).
5. PC : file vers la fenêtre (3 images) et vers la webcam (3 images).
6. Décodage : WebCodecs `optimizeForLatency` (fenêtre) ou Media Foundation `MF_LOW_LATENCY` (DLL webcam), dernière image seulement.

## Hypothèses sur les micro-saccades
- **80 Mb/s en Wi-Fi** : au-dessus de ce que le Wi-Fi tient sans à-coups. La file de l'iPhone dépasse, il saute une image et force une image clé, qui est grosse et refait la file. Le débit doit suivre le réseau mesuré, pas un chiffre fixe.
- **Image clé forcée après chaque saut** : HEVC sait reprendre sans image clé si on ne saute que des images que rien ne référence. Piste : couches temporelles (SVC, voir plus bas) pour sauter une image sans tout refaire.
- **Horloge d'affichage** : la fenêtre dessine au `requestAnimationFrame` et Discord tire les images à son rythme. Sans régularité à l'arrivée, on voit des à-coups même sans perte.
- **TCP** : une perte Wi-Fi bloque tout le flux le temps de la retransmission. C'est la cause classique des saccades. Les concurrents à faible latence passent souvent en UDP (SRT, WebRTC, NDI). Piste lourde, à mesurer avant.

## Pistes trouvées (à vérifier dans la doc Apple)
- `kVTVideoEncoderSpecification_EnableLowLatencyRateControl` : le mode « faible latence » de VideoToolbox (WWDC21, « Explore low-latency video encoding with VideoToolbox »). Il régule le débit image par image, sans les pics des images clés. Fait pour H.264 à l'origine ; le forum Apple parle de HEVC à faible latence avec couches temporelles. **Non vérifié** pour HEVC sur iOS 26.
  Source : https://developer.apple.com/documentation/videotoolbox/kvtvideoencoderspecification_enablelowlatencyratecontrol
- Le même mode refuse `ConstantBitRate` (forum Apple, VideoToolbox). On garde `AverageBitRate` et `DataRateLimits`.
- Rafraîchissement progressif (« intra refresh ») au lieu d'images clés entières : pas de pic, donc pas de saccade. À chercher dans VideoToolbox.
- Câble : plus de débit et pas d'interférences Wi-Fi. Débit réel de usbmux sur l'iPhone 16 (USB-C) **non mesuré**.

## Mesures
Chiffres réels, avec la date et la version. Le chiffre « Latence » d'« Infos du flux » est l'**aller-retour du lien de contrôle** (ping), pas le retard de l'image.

| Date | Lien | Réglage | Mesuré | Remarque |
|---|---|---|---|---|
| 2026-11-02 | câble | 1080p60 HEVC, plafond 80 Mb/s | 45,6 Mb/s réels, 61 i/s, aller-retour 1 ms, 2 images sautées | l'encodeur reste sous le plafond sur une scène calme |
| 2026-11-02 | câble | 4K60 HEVC, plafond 80 Mb/s | 80,3 Mb/s, 60 i/s, aller-retour 3 ms, 2 images sautées | le câble tient 80 Mb/s ; un pic d'aller-retour à 73 ms vu une fois |
| — | Wi-Fi | — | à faire | — |
| 2026-11-02 | câble, verre à verre | 540p60, webcam non utilisée | **~85 ms** (79, 87) | 1 capture |
| 2026-11-02 | câble, verre à verre | 4K60, webcam non utilisée | **~150 ms** (148, 150, 150) | 1 capture |
| 2026-11-02 | câble, verre à verre | 4K60, « Webcam utilisée » | **~350 ms** (316 à 383) | 6 captures, écarts réguliers |
| 2026-11-02 | câble, verre à verre | 1080p60 à 81 Mb/s, Discord caméra allumée | **~313 ms** | 1 capture |
| 2026-11-02 | câble, verre à verre | 4K60 à 80 Mb/s (50 i/s reçues), Discord caméra allumée | **~379 ms** | 1 capture |
| 2026-11-02 | câble, verre à verre | 4K60, Discord caméra coupée juste avant | **~388 ms** (387, 388) | codec réel inconnu (H.264 encore ?) |
| — | Wi-Fi, verre à verre | — | à faire | — |

### Temps par étape (E2, app 0.8.1 (14), câble, 2026-11-02)
| Réglage | Encodage | Envoi et lien | Décodage | Affichage | Total ≈ |
|---|---|---|---|---|---|
| 4K60, Discord caméra allumée (47 i/s) | 235 | 7 | 109 | 3 | 355 |
| 720p60 à 80 Mb/s, Discord allumée | 38 | 6 | 271 | 4 | 318 |
| 720p60 à 80 Mb/s, Discord coupée | 40 | 6 | 269 | 3 | 318 |
| 4K60, Discord coupée (48 i/s) | 232 | 9 | 106 | 3 | 350 |

Lecture :
- **Le câble n'y est pour rien** (6 à 9 ms), et la file de l'iPhone est vide. Discord ne change rien.
- **Décodage PC** : environ 16 images d'attente en 720p et environ 6 en 4K. C'est exactement la taille de la mémoire d'images (DPB) du H.264 niveau 5.1 à ces tailles. Hypothèse : le flux est en H.264 et ne dit pas qu'il n'y a pas de réordonnancement (pas de `max_num_reorder_frames = 0` dans le SPS), alors le décodeur garde sa mémoire pleine avant de rendre une image. Le HEVC écrit toujours ce nombre dans son SPS, ce qui expliquerait les ~150 ms en HEVC. Codec confirmé par Evan : **H.264** choisi à la main pendant ces 4 captures.

Comparaison avec le HEVC choisi (câble, 80 Mb/s, même jour) :
| Réglage | Codec réel | Encodage | Envoi et lien | Décodage | Affichage | Total ≈ |
|---|---|---|---|---|---|---|
| 4K60, Discord coupée (60 i/s) | HEVC | 115 | 6 | **2** | 4 | **127** |
| 720p30, Discord coupée | HEVC | 66 | 12 | **2** | 3 | **83** |
| 720p30, Discord allumée | H.264 (forcé par la webcam) | 67 | 12 | **419** | 2 | **500** |
| 4K60, Discord allumée (46 i/s) | H.264 (forcé par la webcam) | 250 | 8 | **110** | 4 | **372** |

Conclusions :
1. **Le décodage H.264 de la fenêtre** coûte de 110 à 420 ms, contre 2 ms en HEVC. L'hypothèse du DPB plein est confirmée par l'écart.
2. **La webcam impose le H.264** dès que Discord l'ouvre : c'est elle qui fait passer de ~130 à ~370-500 ms.
   Correctif (2026-11-02, choisi par Evan) : le PC réécrit le SPS de chaque image clé H.264 (`apps/desktop/src-tauri/src/h264.rs`) pour ajouter `max_num_reorder_frames = 0`, comme Moonlight et Sunshine. Vérifié : `cargo test` passe, et deux flux libx264 réels réécrits se relisent avec ffmpeg (`trace_headers`) et décodent à l'identique (même `framemd5`). Evan confirme que « ça a l'air bon » avec Discord allumé (sans chiffres notés).
3. **L'encodage iPhone**, même en HEVC, reste le plus gros poste : ~2 images en 720p30 et ~7 images en 4K60. Piste : le mode faible latence de VideoToolbox (E4).
- **Encodage iPhone en 4K60** : ~230 ms et 48 images/s au lieu de 60. L'encodeur ne suit pas et les images s'accumulent dans VideoToolbox. Probablement le H.264 en 4K60, plus lourd que le HEVC. **Non vérifié.**

Méthode verre à verre : `tools/latency-chrono.html` à côté de la fenêtre Hyphn, l'iPhone filme les deux, capture d'écran (écran à 240 Hz). L'image se répète en tunnel : l'écart entre deux étages voisins est aussi une latence, ce qui donne plusieurs chiffres par capture. Lecture à ±10 ms (chiffres flous ou en miroir). C'est la latence **de la fenêtre** Hyphn, pas celle vue dans Discord.

À comprendre : avec la webcam utilisée par une autre app, la fenêtre passe de ~150 à ~350 ms en 4K60. Hypothèse : deux décodages 4K60 en même temps sur le PC (fenêtre + DLL), ou l'envoi vers le tube de la webcam qui retarde l'envoi vers la fenêtre. **Non vérifié.**

Trouvé dans le code et `vcam.log` (2026-11-02) :
- La DLL de la webcam tourne dans le service Frame Server (compte Local Service). Elle cherche un décodeur HEVC avec `MFTEnumEx` et n'en trouve pas (`HEVC decoder no` à chaque démarrage). Cause probable : le décodeur HEVC de Windows vient du Store (« HEVC Video Extensions »), installé pour l'utilisateur, invisible pour un service. **Non vérifié** dans la doc Microsoft.
- Elle répond donc « pas de HEVC », et l'app demande à l'iPhone de passer **tout le flux en H.264**, fenêtre comprise (`set_reader_needs_h264`). Le journal montre `decoder h264 3840x2160` pendant les mesures.
- L'envoi vers le tube ne bloque pas la fenêtre (`try_send`, file de 3 images).
- Réglages de l'encodeur iPhone identiques en H.264 et en HEVC. Côté fenêtre, `avc1.640033` annonce le niveau 5.1, alors que la 4K60 demande le niveau 5.2 : piste à vérifier.
- Test qui tranche : 4K60 en **H.264 choisi à la main**, webcam non utilisée. Vers 350 ms, c'est le H.264 ; vers 150 ms, c'est la webcam elle-même.

## Mesures à faire en premier
1. **Verre à verre** : filmer un chronomètre à 1 ms affiché sur le PC, et photographier ensemble le chronomètre et son image dans Hyphn. À faire en Wi-Fi et en câble, en 1080p30, 1080p60 et 4K30.
2. **Par étape** : l'iPhone met l'heure de capture dans chaque image (déjà `pts`). Le PC note l'heure d'arrivée et la sortie du décodeur. On affiche ces temps dans « Infos du flux ».
3. **Saccades** : compter les images sautées et les images clés forcées par minute (déjà en partie dans les stats).

Liens : [[Cam - Latence et fluidite]], [[ADR-0032 Profils de puissance au lieu de la protection batterie]], [[SOURCES]]
