---
type: decision
date: 2026-11-02
statut: propose
---
# ADR-0032 Profils de puissance au lieu de la protection batterie

## Contexte
[[RULES]] (section Énergie) impose de protéger la batterie de l'iPhone : qualité réduite en mode économie, sous 15 %, et selon la chaleur (règles 5, 7, 9). Evan veut l'inverse par défaut : **le meilleur rendu possible**, surtout avec un bon téléphone, un bon PC et un câble. Ceux qui ont une batterie fatiguée, un PC lent ou un mauvais réseau doivent pouvoir baisser eux-mêmes.

## Options
| Option | Pour | Contre |
|---|---|---|
| A. Garder les règles Énergie telles quelles | Batterie ménagée sans rien faire | Qualité bridée même sur un iPhone branché et froid |
| B. Profils de puissance sur le PC : **Max** (par défaut), **Équilibré**, **Économie**, plus « Personnalisé » | Le meilleur rendu par défaut, un clic pour baisser ; les règles deviennent des réglages | Plus de réglages à expliquer ; batterie et chaleur à surveiller par l'utilisateur |
| C. Tout enlever, sans profils | Simple | Rien pour les petits téléphones ou les mauvais réseaux |

## Décision
Proposé : **B**. Profil **Max** par défaut. Seule la règle « critique » reste toujours active, parce qu'iOS coupe la caméra de toute façon : baisse en 1080p30 plus une alerte. Chaque protection devient un interrupteur du profil, ce qui demande un ADR qui corrige [[RULES]] (Énergie 5, 7, 9) une fois validé. Le débit suit le réseau mesuré dans tous les profils : sans ça, saccades ([[Latence et debit Cam]]).

## Conséquences
- RULES Énergie 5, 7, 9 deviennent « par défaut dans Économie ».
- Énergie 3 (traitement d'image sur la carte graphique seulement) reste : il garde la latence basse.
- Réglages Cam du PC : un choix de profil en haut. Le profil applique résolution, images/s, débit et protections ; un réglage changé à la main passe en « Personnalisé ».
- Phase 6 : la porte « budgets Énergie tenus » se mesure sur le profil Économie.
- Bon choix si Evan voit un rendu fluide en Max sans alerte de chaleur pendant 30 min.

Liens : [[Cam - Latence et fluidite]], [[Decisions - Index]]
