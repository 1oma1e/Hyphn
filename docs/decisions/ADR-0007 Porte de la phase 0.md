---
type: decision
date: 2026-10-29
statut: accepte
---
# ADR-0007 Porte de la phase 0 : commencer la phase 1 après le premier rafraîchissement réussi

## Contexte
La porte de sortie de la phase 0 est : « un Hello SwiftUI tourne sur l'iPhone et se rafraîchit tout seul pendant 2 semaines ». C'est une bonne preuve, mais elle bloque tout le projet 14 jours alors que le risque principal (est-ce que le rafraîchissement automatique marche ?) est déjà levé au premier cycle de 7 jours.

## Options
| Option | Pour | Contre |
|---|---|---|
| Attendre 14 jours sans rien faire | Simple, prudent | Deux semaines perdues |
| Phase 1 (doc, spec, maquettes, puis code) dès le **premier rafraîchissement automatique réussi** (J+7), la mesure continue jusqu'à J+14 | Le risque est levé, on avance en parallèle | Si le 2e cycle rate, il faut corriger l'infra au milieu de la phase 1 |

## Décision
Accepté par Evan le 2026-10-31 : la deuxième option. La phase 0 n'est **close** qu'à J+14 ; on l'écrit dans STATE tant qu'elle n'est pas close. Pendant l'attente du premier cycle, on peut écrire la spec de la phase 1 (docs seulement).

## Conséquences
- [[ROADMAP]] : la phase 0 a une étape intermédiaire « premier rafraîchissement automatique réussi ».
- Un journal des rafraîchissements (date, réussi ou non) pendant les 14 jours : [[Journal des rafraichissements]].
