---
type: decision
date: 2026-11-01
statut: accepte
---
# ADR-0024 Écran d'attente à l'endroit dans la webcam

## Contexte
Evan, 2026-11-01 : dans Discord, les autres ne peuvent pas lire l'écran d'attente. La webcam Windows l'envoyait en miroir pour qu'Evan le lise dans son propre aperçu ([[ADR-0023 Connexion gardee et reconnexion facile]]). Or Discord ne retourne que l'aperçu de l'utilisateur : les autres reçoivent l'image telle quelle, donc à l'envers. On ne peut pas avoir les deux.

## Options
| Option | Pour | Contre |
|---|---|---|
| A — Écran d'attente envoyé à l'endroit | Les autres lisent le texte (c'est pour eux qu'il existe) ; code plus simple | Dans l'aperçu d'Evan, le texte est à l'envers |
| B — Garder le miroir | Evan lit son aperçu | Personne d'autre ne peut lire |

## Décision
**A** (choix d'Evan). La webcam envoie l'écran d'attente à l'endroit, comme la fenêtre Hyphn et OBS. Corrige le point « écran d'attente en miroir » de [[ADR-0023 Connexion gardee et reconnexion facile]] ; le reste de l'ADR-0023 ne change pas. Le bouton miroir retourne toujours la vidéo, jamais l'écran d'attente.

## Conséquences
- `apps/desktop-vcam` : plus de `SetMirrorWait` ni de dessin retourné.
- Les DLL changent d'empreinte : reconstruire l'app et réinstaller la webcam.
- Bon choix si un ami en appel Discord lit « Je reviens bientôt » sans effort.
