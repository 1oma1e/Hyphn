---
type: decision
date: 2026-11-02
statut: accepte
---
# ADR-0034 Où appliquer les filtres de la Cam

## Contexte
Les filtres et effets ([[Cam - Filtres et effets]]) doivent se voir dans Discord et OBS, sans latence visible et sur la carte graphique ([[RULES]], Énergie 3). Le 2026-10-31, des effets appliqués seulement à l'aperçu du PC ont été retirés : Discord ne les voyait pas ([[IDEES]]).

## Options
| Option | Pour | Contre |
|---|---|---|
| A. **Sur l'iPhone**, avant l'encodage (Core Image / Metal ; Vision et ARKit pour le visage et le détourage) | L'image envoyée a déjà l'effet : fenêtre, webcam et OBS identiques ; puces Apple très rapides ; ARKit pour les masques façon Snapchat | Plus de chaleur et de batterie ; chaque changement passe par le réseau ; ARKit seulement avec la caméra avant |
| B. **Sur le PC**, dans la DLL de la webcam et dans la fenêtre (shaders sur la carte graphique) | iPhone qui ne chauffe pas ; marche avec n'importe quel iPhone ou Android | Deux rendus à écrire (fenêtre et DLL) ; détourage et suivi du visage à refaire sur PC (modèles ML) ; dépend du PC |
| C. Mixte : couleurs et lumière sur l'iPhone, effets lourds sur le PC | Profite des deux | Deux chemins à tenir |

## Décision
**B : tout sur le PC** (choix d'Evan, 2026-11-02). L'iPhone en fait le moins possible : il filme, encode et envoie. Filtres, détourage du fond et suivi du visage se calculent sur la carte graphique du PC, à partir de l'image reçue de l'iPhone.

Pourquoi c'est devenu simple : depuis [[ADR-0035 Webcam sans forcer le H.264]], l'app PC décode déjà une seule fois pour la fenêtre **et** la webcam. Les effets se placent juste après ce décodage : un seul rendu, vu dans la fenêtre, Discord et OBS. L'iPhone ne chauffe pas plus, et Android (phase 7) profitera des mêmes effets.

## Conséquences
- Chaîne : décodage → effets (GPU) → fenêtre et images NV12 de la webcam. Les effets ne passent pas par le protocole.
- Détourage et points du visage : modèles ML sur le PC (carte graphique), à choisir dans [[Cam - Filtres et effets]] après recherche de l'existant.
- Les réglages de la caméra elle-même (exposition, mise au point, balance des blancs…) restent sur l'iPhone : seul le capteur peut les faire. Le PC envoie la commande ([[Cam - Reglages avances]]).
- Les mesures de [[Cam - Latence et fluidite]] incluent le coût des effets ; bon choix si le flou en 1080p60 n'ajoute pas plus d'une image de latence ni de saccade.
- Ce que perd B : ARKit (caméra TrueDepth) pour les masques. Les effets visage viendront d'un modèle sur le PC.

## Mise en œuvre (2026-11-02)
Evan : « ce qu'on voit dans l'app, Discord le voit », avec des outils libres existants. Choisi après recherche :
- **Fenêtre** : le canvas dessine l'image avec ses effets (filtres et modes de fusion du canvas, accélérés par la carte graphique, comme les recettes CSSgram des filtres Instagram, licence MIT) ; **MediaPipe** de Google (Apache-2.0) pour les 478 points du visage et le détourage de la personne, délégué GPU. MediaPipe et ses deux modèles (19 Mo) sont dans l'app (`ui/vendor/mediapipe`, empreintes dans `SHA256SUMS`) : rien n'est téléchargé.
- **Webcam** : avec un effet, la fenêtre envoie son image finale à Rust (WebSocket local, `HFX1`), convertie en NV12 BT.709 (`vcam::fx`) et donnée à la webcam à la place du décodage de l'app. Sans effet, rien ne change (le moins de retard).
- Mesuré dans la page d'essai, 720p : fond (flou ou image) ≈ 26 ms par image ; points du visage ≈ 11 ms. Non vérifié : retard réel dans Discord, fenêtre cachée près de l'horloge, OBS (garde encore l'image sans effets).

Liens : [[Decisions - Index]]
