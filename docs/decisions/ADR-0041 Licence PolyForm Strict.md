---
type: decision
date: 2026-11-16
statut: accepte
---
# ADR-0041 Licence PolyForm Strict

## Contexte
Le dépôt devient public ([[ADR-0040 Mises a jour auto et depot public]]). Evan veut que personne ne puisse reprendre Hyphn à son compte, tout en restant libre de faire ce qu'il veut de son code (2026-11-16). Sans licence, tout est interdit par défaut, mais ce n'est pas clair pour les visiteurs.

## Options
| Option | Pour | Contre |
|---|---|---|
| A. Aucune licence (« tous droits réservés » par défaut) | Rien à écrire | Flou : les visiteurs ne savent pas s'ils peuvent installer l'app |
| B. **PolyForm Strict 1.0.0** | Texte écrit par des avocats ; usage gratuit et non commercial permis ; copie, modification et revente interdites | Pas « open source » : personne ne peut proposer de correctif tiré du code |
| C. Licence libre (MIT, GPL) | Contributions possibles | Tout le monde peut copier, la GPL permet même de revendre |

## Décision
**B** (choix d'Evan, 2026-11-16) : `LICENSE.md` à la racine, avec « Copyright 2026 1oma1e ». Evan, seul auteur, garde tous ses droits : il peut changer de licence plus tard ou vendre l'app. Les fichiers tiers (MediaPipe, three.js, modèles 3D, photos de fond) gardent leur propre licence, citée dans leurs `CREDITS.txt`.

## Conséquences
- Une licence n'empêche pas techniquement la copie : elle donne le droit de la faire retirer (signalement DMCA à GitHub). GitHub permet toujours le bouton « Fork » sur un dépôt public (conditions de GitHub), sans autre droit.
- Le README le dit en clair (section « License »).

Liens : [[Decisions - Index]]
