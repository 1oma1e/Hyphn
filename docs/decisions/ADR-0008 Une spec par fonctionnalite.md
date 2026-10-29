---
type: decision
date: 2026-10-29
statut: propose
---
# ADR-0008 Une spec par fonctionnalité, écrite avant le code

## Contexte
Le cahier dit « doc → maquette → code » et « chaque fonctionnalité a une preuve ». Les bonnes pratiques Claude Code conseillent d'écrire une spec (Claude interviewe Evan jusqu'à pouvoir l'écrire), puis de coder dans une **nouvelle session** à partir de la spec, et de faire relire le code contre la spec par un sous-agent qui n'a pas vu le raisonnement. Sources : [[Claude Code - bonnes pratiques]].

## Options
| Option | Pour | Contre |
|---|---|---|
| Docs générales + maquettes seulement | Moins de fichiers | « Fini » reste flou ; le relecteur n'a rien de précis à comparer |
| `docs/specs/<module> - <fonction>.md` : but, hors périmètre, parcours (lien maquette), cas limites, **preuve** | Définition claire de « fini », relecture précise, session de code qui part propre | Une note de plus par fonctionnalité |

## Décision
Proposé : une spec courte (une page) par fonctionnalité, dans `docs/specs/`, validée par Evan avant le code. Le `reviewer` compare le code à cette spec.

## Conséquences
- Ordre d'une fonctionnalité : spec (session A) → code (session B, après `/clear`) → `reviewer` + `/code-review` → preuve notée dans le journal.
- [[RULES]] : la règle « pas de code sans spec validée ».
