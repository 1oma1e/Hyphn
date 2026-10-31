---
type: decision
date: 2026-10-31
statut: accepte
---
# ADR-0016 Design visuel V2

## Contexte
Les maquettes de la phase 0 ([[Maquettes - Index]]) fixaient le contenu, pas le style. Evan voulait voir l'app « pour que ce soit parfait » : un design unique, des animations, un fond spécial. Une V1 visuelle a été jugée trop chargée (trop d'infos sur le PC, boutons iPhone mal faits). La V2 corrige ça.

## Options
| Option | Pour | Contre |
|---|---|---|
| Rester sur les maquettes texte | Rien à refaire | On ne voit pas l'app ; le style serait décidé pendant le code |
| Maquettes visuelles cliquables (canevas claude.ai) | On voit et on clique chaque écran, avec ses états | Sources hors du repo (artefacts privés d'Evan) |

## Décision
Maquettes visuelles cliquables, V2 validée par Evan le 2026-10-31 (« Ok parfait ») :
- PC : https://claude.ai/artifact/STaU5yYjqD5DsSy6vdATmr — iPhone : https://claude.ai/artifact/1etdZqrAwQWpN31xwQMYFN
- **Fond « trame »** : des fils lumineux qui ondulent lentement en haut de l'écran (le trait d'union de Hyphn), grain léger. iPhone en noir pur (OLED).
- **Couleurs** : encre `#05070A`, texte `#F1F3F6`, citron `#B9F25A` (lien, OK), cyan `#5FD4F4` (Drop), corail `#FF7A66` (Cam), ambre `#FFB547` (alerte).
- **Police** : Geist, et Geist Mono pour les chiffres.
- **Navigation** : PC = menu en haut (Accueil, Cam, Drop) + bouton Réglages ; iPhone = barre d'onglets (Accueil, Cam, Drop, Réglages).
- **Principe** : écrans concis, mots simples ; le détail passe dans un tiroir ou une fenêtre « i ». Tous les réglages sont sur le PC.
- **Appairage** : après validation, animation « liés » d'environ 8 s puis glissement vers l'Accueil, bouton pour passer plus tôt ([[Core - Appairage QR]]).

## Conséquences
- Les notes texte de `docs/maquettes/` deviennent la V1 : à remettre à jour d'après la V2.
- Le code des écrans (Tauri, SwiftUI) suit la V2 ; on réécrit ses couleurs et polices dans le code, pas de dépendance au canevas.
- Changements de fond liés : [[ADR-0017 Pulse integre sans page]], [[ADR-0018 Cam image seule et demarrage en pause]].
