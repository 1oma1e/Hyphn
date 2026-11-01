---
type: decision
date: 2026-11-01
statut: accepte
---
# ADR-0027 Aperçu en coin pendant la pause

## Contexte
En pause, le PC montre l'écran d'attente et l'iPhone n'envoie rien ([[ADR-0018 Cam image seule et demarrage en pause]]). Evan veut voir, sur le PC seulement, ce que filme l'iPhone pendant l'écran d'attente, pour régler le cadrage, le miroir ou l'objectif avant d'appuyer sur « Afficher ». Envoyer des images en pause coûte de la batterie ([[RULES]], Énergie).

## Options
| Option | Pour | Contre |
|---|---|---|
| Même qualité que le direct | « Afficher » instantané ; on voit exactement ce qui partira | Batterie et chaleur comme en direct pendant les réglages |
| Petite qualité (480p, 15 images/s) | Moins de batterie et de chaleur | Aperçu moins net ; environ 1 s de plus au passage en direct (l'iPhone change de format) |

## Décision
**Petite qualité**, choisie par Evan le 2026-11-01.
- Nouveau champ `CamControl.preview` : le PC le met à vrai seulement quand la page Cam est **visible** sur le PC (pas dans la zone de notification, pas sur une autre page).
- En pause, avec `preview` et l'onglet Cam ouvert sur l'iPhone, l'iPhone envoie à 15 images/s, 1,5 Mb/s, avec le plus petit format 16:9 de la caméra qui a au moins 480 lignes (souvent 720p : la caméra n'a pas toujours de 480p en 16:9). L'aperçu plein écran sur l'iPhone suit ce format pendant la pause. En direct, il reprend les réglages demandés.
- Sur le PC, l'image est montrée dans un coin, par-dessus l'écran d'attente, avec la mention « Aperçu · vous seul ».
- Le PC ne donne **jamais** ces images à la webcam Windows ni à OBS : en pause, seule la fenêtre Hyphn les reçoit (contrôle dans `link.rs`). Discord continue de voir l'écran d'attente.

## Conséquences
- Corrige ADR-0018 sur un point : en pause, l'iPhone envoie un petit aperçu quand la page Cam du PC est visible ; sinon, toujours rien.
- Miroir, Tourner et Retourner ne reconstruisent plus l'écran d'attente dans la fenêtre : plus de flash de la caméra derrière.
- Non vérifié : coût batterie de l'aperçu ; délai réel au passage en direct.
