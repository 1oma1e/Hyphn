---
type: decision
date: 2026-11-02
statut: accepte
---
# ADR-0036 Objectif exact au lieu de la caméra combinée

## Contexte
La Cam ouvrait la caméra arrière « combinée » d'iOS (`builtInTripleCamera`), qui passe d'un objectif à l'autre toute seule. Sur cette caméra, iOS refuse l'exposition manuelle, la mise au point manuelle et la balance des blancs manuelle : sur l'iPhone 16 Pro Max d'Evan, le panneau [[Cam - Reglages avances]] les montrait tous grisés (capture du 2026-11-02).

## Options
| Option | Pour | Contre |
|---|---|---|
| A. Ouvrir l'objectif exact (ultra grand-angle, grand-angle, téléobjectif) selon le bouton 0,5× / 1× / 2× / 5× | Tous les réglages manuels marchent ; l'image ne change jamais d'objectif toute seule | Changer d'objectif coupe l'image environ une demi-seconde ; plus de macro automatique |
| B. Caméra combinée, et objectif exact seulement quand un réglage passe en manuel | Passage d'objectif fluide en Auto | Deux chemins à maintenir, une coupure au moment du passage en manuel |
| C. Garder la caméra combinée et cacher ces réglages | Rien à changer sur l'iPhone | Les réglages manuels n'existent pas |

## Décision
**A** (choix d'Evan, 2026-11-02). 2× est l'objectif grand-angle zoomé ; un objectif absent est remplacé par le grand-angle zoomé. Le grossissement de chaque objectif est lu une fois sur la caméra combinée (le téléobjectif fait 2×, 3× ou 5× selon l'iPhone).

## Conséquences
- `apps/ios/Sources/Hyphn/Camera.swift` : `device(front:lens:)` et `selectLens` ; le zoom fin s'applique sur l'objectif ouvert.
- Ce que la caméra ne sait pas faire est **caché** dans le panneau (E7 de [[Cam - Reglages avances]], demande d'Evan), plus grisé.
- Bon choix si Evan règle l'exposition, la mise au point et la balance des blancs à la main sur la caméra arrière, et si la coupure au changement d'objectif ne le gêne pas.

Liens : [[Decisions - Index]], [[Cam - Flux v1]]
