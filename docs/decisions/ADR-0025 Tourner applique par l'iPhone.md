---
type: decision
date: 2026-11-01
statut: accepte
---
# ADR-0025 Tourner appliqué par l'iPhone

## Contexte
Evan veut, à côté du bouton miroir de la barre Cam du PC, un bouton qui tourne l'image de 90° à chaque clic. L'image part de l'iPhone et sert à la fenêtre Hyphn, à la webcam Windows (Discord) et à OBS.

## Options
| Option | Pour | Contre |
|---|---|---|
| A — L'iPhone tourne l'image (angle de la connexion caméra, comme le miroir) | Une seule fois, déjà tournée partout ; pas de calcul en plus sur le PC | Nouveau champ dans le protocole, app iPhone à reconstruire |
| B — Le PC tourne l'image (fenêtre, DLL, plugin OBS) | Rien à changer sur l'iPhone | Trois endroits à coder, coût GPU sur le PC |

## Décision
**A** (proposée par Claude, Evan a dit « vas-y »). `CamControl.turn = 16` (0 à 3 quarts de tour dans le sens horaire), ajouté à l'angle « horizon » de l'iPhone. Gardé dans les réglages du PC.

## Conséquences
- `protocol/hyphn.proto`, Rust (`CamWanted.turn`), `ui/app.js` (bouton), `Camera.swift` (`applyRotation`).
- Validé par Evan le 2026-11-01 (« ça marche »).
