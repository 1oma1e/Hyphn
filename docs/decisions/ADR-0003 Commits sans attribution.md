---
type: decision
date: 2026-10-29
statut: propose
---
# ADR-0003 Commits sans attribution à Claude, imposé par un hook git

## Contexte
Dans ses trois projets, Evan veut des commits signés par lui seul, sans ligne `Co-Authored-By: Claude`. Dans RobloxGame la règle a été oubliée une fois et l'historique a dû être réécrit. Claude Code envoie en plus un rappel automatique qui demande d'ajouter cette ligne : une règle seulement écrite lutte contre ce rappel.

## Options
| Option | Pour | Contre |
|---|---|---|
| Règle dans CLAUDE.md seulement | Simple | Peut être oubliée (déjà arrivé) |
| Hook git `commit-msg` (`.githooks/commit-msg`) | Refuse le commit à tous les coups, pour Claude **et** pour Evan | Il faut `git config core.hooksPath .githooks` après chaque clone |

## Décision
Proposé : hook git `commit-msg` + une ligne dans CLAUDE.md. À valider par Evan.

## Conséquences
- `core.hooksPath` réglé dans ce repo le 2026-10-29 ; commande rappelée dans CLAUDE.md pour un nouveau clone.
- Si Evan veut un jour l'attribution, on supprime le hook et on passe l'ADR en `remplace`.
