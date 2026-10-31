---
type: decision
date: 2026-10-31
statut: accepte
---
# ADR-0015 Lien permanent, connexion seulement quand l'app iPhone est ouverte

## Contexte
[[RULES]] (Énergie 2) dit « sockets fermées après 30 s d'inactivité ». Pulse envoie seulement les changements : la batterie peut ne pas bouger pendant plus de 30 s, et la connexion se fermerait alors que l'app est ouverte. Il fallait aussi dire combien de temps dure un appairage.

## Options
| Option | Pour | Contre |
|---|---|---|
| Fermer après 30 s sans message, rouvrir à chaque événement | Socket ouverte moins longtemps | Pulse plus lent, point vert qui ne veut plus dire « connecté » |
| Connexion de contrôle ouverte tant que l'app iPhone est au premier plan, fermée en arrière-plan | Pulse en direct, rien envoyé à vide, l'app suspendue ne coûte rien | Une socket ouverte pendant l'usage (coût presque nul, keepalive TCP du système) |

## Décision
Choix d'Evan (2026-10-31) :
- **Lien** : permanent après le premier appairage ; défait seulement à la main par « Oublier » dans les Réglages.
- **Connexion de contrôle** : ouverte tant que l'app iPhone est au premier plan, fermée dès qu'on la quitte. La règle des 30 s vaut pour les sockets de données (Cam, Drop).
- **Pulse** : envoie tout à chaque ouverture, puis les changements ; rien quand l'app est fermée.

## Conséquences
- [[RULES]] Énergie 2 précisée.
- Specs : [[Core - Appairage QR]] (E10), [[Core - Reconnexion]] (E6), [[Infos iPhone - Batterie et chaleur]].
- Bon choix si la mesure de budget (Pulse E7) ne montre pas de surcoût notable de l'app ouverte.
