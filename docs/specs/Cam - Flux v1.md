---
type: spec
phase: 4
statut: validee
---
# Cam — Flux v1

## But
L'image de la caméra de l'iPhone s'affiche en direct dans la page Cam de l'app PC, chiffrée, en Wi-Fi. Commencé en avance, juste après l'appairage (choix d'Evan, [[ADR-0020 Phase 1 sans attendre le rafraichissement]]).

## Hors périmètre
- Webcam virtuelle Windows et plugin OBS : [[Cam - Webcam Windows et OBS]].
- Effets calculés sur le PC (flou, lumière, filtres, cadrage) : retirés de l'app (2026-10-31), ils n'allaient pas jusqu'à Discord ([[IDEES]]).
- Photo 48 Mpx, ISO manuel : plus tard. Exposition, mise au point, balance des blancs, lampe et stabilisation sont réglables depuis le PC (`CamControl`, 2026-10-31).
- Son : jamais ([[ADR-0018 Cam image seule et demarrage en pause]]).

## Parcours
[[Parcours - Stream]], écrans [[iPhone - Cam]] et [[PC - Cam]] (maquette V2, [[ADR-0016 Design visuel V2]]).

## Exigences
- **E1 — Démarrage en pause.** Ouvrir l'onglet Cam sur l'iPhone allume la caméra et l'aperçu plein écran, **en pause** : rien n'est envoyé (sauf l'aperçu E9), le PC montre l'écran d'attente. « Afficher » (sur l'iPhone ou sur le PC) envoie l'image ; « Pause » arrête l'envoi ([[ADR-0018 Cam image seule et demarrage en pause]]).
- **E2 — Encodage matériel.** VideoToolbox, HEVC par défaut, H.264 si le PC ne sait pas décoder HEVC. Une image clé toutes les 4 s au plus, et tout de suite sur `KeyRequest` du PC. Débit adapté au Wi-Fi : il baisse quand les octets s'accumulent, remonte quand la voie est libre. Rien n'est traité par le CPU de l'iPhone ([[RULES]], Énergie 3).
- **E3 — Socket média.** Une deuxième connexion TCP + TLS 1.3 mutuelle, sur le même port que la connexion de contrôle, vérifiée par les mêmes empreintes. Premier message `VideoHello`, puis des `VideoFrame` (image en Annex-B, horodatage, image clé ou non). Fermée 30 s après la pause ([[RULES]], Énergie 2).
- **E4 — Qui décide.** Le PC envoie la qualité **effective** dans `CamControl` (résolution, images/s, débit, codec, objectif, caméra avant), après la règle thermique ([[RULES]], Énergie 9). L'iPhone l'applique et répond `CamState`. Le choix rapide de qualité sur l'iPhone (résolution et images/s seulement) part en `CamQuality` vers le PC, qui le garde.
- **E5 — Décodage sur le PC.** WebCodecs dans la fenêtre Hyphn (décodage matériel de la carte graphique), reçu par un WebSocket local à chemin secret (pas l'IPC Tauri), seule la dernière image dessinée à chaque rafraîchissement, à la taille affichée. Un vrai retard (plus de 12 images en attente) : le PC demande une image clé (`KeyRequest`).
- **E6 — Écran noir.** Bouton « Écran noir » sur l'iPhone, et automatique après 30 s sans toucher l'écran (réglage, activé par défaut). Luminosité au minimum, l'envoi continue. Double-touche pour rallumer ([[RULES]], Énergie 8).
- **E7 — Objectifs.** 0,5×, 1×, 2×, 5× (selon l'iPhone) et caméra avant, depuis l'iPhone ou le PC.
- **E9 — Aperçu pendant la pause.** Quand la page Cam est visible sur le PC (`CamControl.preview`), l'iPhone en pause envoie un petit aperçu (480p, 15 images/s, 1,5 Mb/s), montré dans un coin de la fenêtre Hyphn par-dessus l'écran d'attente, avec « Aperçu · vous seul ». La webcam Windows et OBS ne le reçoivent jamais. Miroir, Tourner et Retourner ne font pas clignoter l'écran d'attente ([[ADR-0027 Apercu en coin pendant la pause]]).
- **E8 — Infos du flux** sur le PC : images/s reçues, débit, latence réseau (aller-retour du `Ping`), images jetées. Pas de latence « objectif → écran » tant qu'elle n'est pas mesurée ([[RULES]] : jamais de chiffre inventé).

## Cas limites
| Cas | Ce qui se passe |
|---|---|
| L'app iPhone passe en arrière-plan | iOS coupe la caméra ; le PC remet l'écran d'attente |
| iPhone chaud (`serious`) | 30 images/s et débit −30 % ; bandeau sur le PC |
| iPhone très chaud (`critical`) | 1080p30 + alerte sur le PC |
| Le PC ne décode pas HEVC | Le PC demande H.264 |
| Wi-Fi faible | L'iPhone baisse son débit ; une image en retard est sautée et une image clé suit tout de suite |
| « Afficher » sur le PC, onglet Cam fermé sur l'iPhone | L'iPhone ouvre Cam et envoie ; un vieux `CamState` ne remet pas en pause (`by_user`) |

## Preuve
1. `cargo test` : décodage des messages `CamControl` / `VideoFrame`, règle thermique.
2. Sur le vrai matériel : l'image de l'iPhone apparaît sur le PC après « Afficher ». Capture des deux écrans.
3. Pause, objectifs, caméra avant, écran noir : chacun essayé une fois. Noté dans le journal.
4. La porte de la phase 4 (latence mesurée, 30 min sans décrochage) reste à faire.

Liens : [[Specs - Index]], [[ROADMAP]]
