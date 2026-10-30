---
type: decision
date: 2026-10-30
statut: accepte
---
# ADR-0012 Anisette Mac publique

## Contexte
Pour se connecter avec un Apple ID hors d'un appareil Apple, iloader, SideStore et xtool ont besoin de données « anisette ». Notre conteneur `hyphn-anisette` (`dadoum/anisette-v3-server`) les fabrique avec le code d'Apple Music pour **Android**. Depuis le 12/10/2026, Apple refuse une connexion dont l'anisette ne colle pas avec l'appareil annoncé (`-80045`) ; depuis le 22/10, il refuse le jeton Xcode à un appareil qui se dit Android (`-80046`). iloader 2.4.1 annonce un Mac : le 2026-10-30, la connexion avec notre serveur a échoué en `-80045`. Ça va contre la règle « tout est local » de [[RULES]].

## Options
| Option | Pour | Contre |
|---|---|---|
| A. Serveur public « Mac » `mac-ani.jkcoxson.com` | Marche aujourd'hui (iloader, SideStore, xtool ≥ 1.23) ; ne reçoit ni mot de passe, ni code, ni jeton | Hors du réseau local ; une seule personne le tient, code non publié ; déjà tombé (502) |
| B. Attendre un outil qui annonce Android pour la connexion et Mac pour le jeton (méthode Apparition) | Garderait notre serveur local | Aucun outil qu'on utilise ne le fait ; date inconnue |
| C. Anisette d'un vrai Mac | Fiable, local | macOS 27 ne la donne plus aux programmes tiers ; Mac pas prévu avant la fin ([[ADR-0009 Serveur et Mac]]) |

## Décision
**A**, choisie par Evan le 2026-10-30 : iloader et SideStore utilisent `mac-ani.jkcoxson.com`. Exception assumée au « tout local » : ce serveur ne voit que l'IP et un identifiant machine, et le compte est l'Apple ID secondaire. Le conteneur `hyphn-anisette` reste en place mais ne sert plus ; on revient au local (option B) dès qu'un outil le permet.

## Conséquences
- Une panne de `mac-ani.jkcoxson.com` bloque connexion et rafraîchissement : surveiller les rafraîchissements (porte de la phase 0).
- `xtool setup` sur le serveur utilisera la même anisette (non vérifié).
- À revoir à chaque version de SideStore, iloader et xtool ; décider plus tard d'arrêter ou non `hyphn-anisette`.
- Sources : blog Ixion « sideloading error -80046 » (2026-10-24), nab138/iloader#859, README d'iPASide.
