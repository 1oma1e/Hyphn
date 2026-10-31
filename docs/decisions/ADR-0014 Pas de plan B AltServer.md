---
type: decision
date: 2026-10-31
statut: accepte
---
# ADR-0014 Pas de plan B AltServer-Linux pour l'instant

## Contexte
Le [[CAHIER]] prévoit un plan B : AltServer-Linux + netmuxd sur le serveur, pour rafraîchir les apps en Wi-Fi si SideStore ne suffit pas. La [[ROADMAP]] demandait de le tester une fois en phase 0. Depuis le 2026-10-31, le raccourci `Refresh SideStore` (LocalDevVPN + « Refresh All Apps ») marche, lancé à la main, et une automatisation tourne lundi et jeudi à 20 h.

## Options
| Option | Pour | Contre |
|---|---|---|
| Monter et tester le plan B maintenant | Une solution de secours prête | Une session de plus, un service de plus sur le serveur, pour un besoin pas encore prouvé |
| Ne pas le faire ; surveiller le rafraîchissement automatique | On passe à la phase 1 ; rien de plus sur le serveur | Si SideStore casse, il faudra monter le plan B au milieu d'une autre phase |

## Décision
Choix d'Evan (2026-10-31) : la deuxième option. Le plan B n'est plus une étape de la phase 0. On le rouvre seulement si le [[Journal des rafraichissements]] montre un échec que SideStore ne sait pas corriger.

## Conséquences
- [[ROADMAP]] : l'étape « Plan B testé une fois » est retirée de la phase 0.
- [[ARCHITECTURE]] : le plan B est noté « non monté ».
- Pas de dossier `infra/altserver/` ni `~/hyphn/altserver/` sur le serveur.
- Bon choix si le journal reste vert jusqu'à J+14 (porte de la phase 0).
