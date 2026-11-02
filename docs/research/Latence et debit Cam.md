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

## Mesures à faire en premier
1. **Verre à verre** : filmer un chronomètre à 1 ms affiché sur le PC, et photographier ensemble le chronomètre et son image dans Hyphn. À faire en Wi-Fi et en câble, en 1080p30, 1080p60 et 4K30.
2. **Par étape** : l'iPhone met l'heure de capture dans chaque image (déjà `pts`). Le PC note l'heure d'arrivée et la sortie du décodeur. On affiche ces temps dans « Infos du flux ».
3. **Saccades** : compter les images sautées et les images clés forcées par minute (déjà en partie dans les stats).

Liens : [[Cam - Latence et fluidite]], [[ADR-0032 Profils de puissance au lieu de la protection batterie]], [[SOURCES]]
