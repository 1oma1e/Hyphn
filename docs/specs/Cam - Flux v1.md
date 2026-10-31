---
type: spec
phase: 4
statut: validee
---
# Cam — Flux v1

## But
L'image de la caméra de l'iPhone s'affiche en direct dans la page Cam de l'app PC, chiffrée, en Wi-Fi. Commencé en avance, juste après l'appairage (choix d'Evan, [[ADR-0020 Phase 1 sans attendre le rafraichissement]]).

## Hors périmètre
- Webcam virtuelle Windows et plugin OBS : phase 5 (Discord et OBS ne voient pas encore la caméra).
- Effets calculés sur le PC (flou, lumière, filtres, cadrage) : les réglages existent sur le PC mais ne changent pas encore l'image reçue.
- Photo 48 Mpx, lampe, réglages fins (ISO, balance, mise au point) : plus tard.
- Son : jamais ([[ADR-0018 Cam image seule et demarrage en pause]]).

## Parcours
[[Parcours - Stream]], écrans [[iPhone - Cam]] et [[PC - Cam]] (maquette V2, [[ADR-0016 Design visuel V2]]).

## Exigences
- **E1 — Démarrage en pause.** Ouvrir l'onglet Cam sur l'iPhone allume la caméra et l'aperçu plein écran, **en pause** : rien n'est envoyé, le PC montre l'écran d'attente. « Afficher » (sur l'iPhone ou sur le PC) envoie l'image ; « Pause » arrête l'envoi ([[ADR-0018 Cam image seule et demarrage en pause]]).
- **E2 — Encodage matériel.** VideoToolbox, HEVC par défaut, H.264 si le PC ne sait pas décoder HEVC. Une image clé toutes les 2 s. Rien n'est traité par le CPU de l'iPhone ([[RULES]], Énergie 3).
- **E3 — Socket média.** Une deuxième connexion TCP + TLS 1.3 mutuelle, sur le même port que la connexion de contrôle, vérifiée par les mêmes empreintes. Premier message `VideoHello`, puis des `VideoFrame` (image en Annex-B, horodatage, image clé ou non). Fermée 30 s après la pause ([[RULES]], Énergie 2).
- **E4 — Qui décide.** Le PC envoie la qualité **effective** dans `CamControl` (résolution, images/s, débit, codec, objectif, caméra avant), après la règle thermique ([[RULES]], Énergie 9). L'iPhone l'applique et répond `CamState`. Le choix rapide de qualité sur l'iPhone (résolution et images/s seulement) part en `CamQuality` vers le PC, qui le garde.
- **E5 — Décodage sur le PC.** WebCodecs dans la fenêtre Hyphn (décodage matériel de la carte graphique), dessin sur un canevas, aucun tampon : une image en retard est jetée jusqu'à la prochaine image clé.
- **E6 — Écran noir.** Bouton « Écran noir » sur l'iPhone, et automatique après 30 s sans toucher l'écran (réglage, activé par défaut). Luminosité au minimum, l'envoi continue. Double-touche pour rallumer ([[RULES]], Énergie 8).
- **E7 — Objectifs.** 0,5×, 1×, 2×, 5× (selon l'iPhone) et caméra avant, depuis l'iPhone ou le PC.
- **E8 — Infos du flux** sur le PC : images/s reçues, débit, latence réseau (aller-retour du `Ping`), images jetées. Pas de latence « objectif → écran » tant qu'elle n'est pas mesurée ([[RULES]] : jamais de chiffre inventé).

## Cas limites
| Cas | Ce qui se passe |
|---|---|
| L'app iPhone passe en arrière-plan | iOS coupe la caméra ; le PC remet l'écran d'attente |
| iPhone chaud (`serious`) | 30 images/s et débit −30 % ; bandeau sur le PC |
| iPhone très chaud (`critical`) | 1080p30 + alerte sur le PC |
| Le PC ne décode pas HEVC | Le PC demande H.264 |
| Wi-Fi faible | Images jetées côté PC, le flux reprend à la prochaine image clé |

## Preuve
1. `cargo test` : décodage des messages `CamControl` / `VideoFrame`, règle thermique.
2. Sur le vrai matériel : l'image de l'iPhone apparaît sur le PC après « Afficher ». Capture des deux écrans.
3. Pause, objectifs, caméra avant, écran noir : chacun essayé une fois. Noté dans le journal.
4. La porte de la phase 4 (latence mesurée, 30 min sans décrochage) reste à faire.

Liens : [[Specs - Index]], [[ROADMAP]]
