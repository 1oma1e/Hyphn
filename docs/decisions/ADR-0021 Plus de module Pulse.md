---
type: decision
date: 2026-10-31
statut: accepte
---
# ADR-0021 Plus de module Pulse

## Contexte
[[ADR-0017 Pulse integre sans page]] a déjà enlevé la page Pulse, mais gardait le nom « Pulse » dans le code et les specs. Evan (2026-10-31) : Pulse n'est pas un module, ce sont juste les infos de l'iPhone (batterie, chaleur, stockage) déjà intégrées à l'app.

## Options
| Option | Pour | Contre |
|---|---|---|
| Garder le nom « Pulse » en interne | Rien à renommer | On parle d'un module qui n'existe pas |
| L'enlever partout | Deux modules seulement (Cam, Drop) + les infos de l'iPhone | Renommer une spec et le code |

## Décision
Choix d'Evan : **le nom Pulse disparaît**. Hyphn a deux modules, **Cam** et **Drop**. La batterie, la chaleur et le stockage s'appellent « les infos de l'iPhone » (`DeviceStatus` dans le protocole et le code).
- Spec renommée : [[Infos iPhone - Batterie et chaleur]].
- Maquette `PC - Pulse` supprimée (déjà remplacée par l'Accueil PC).
- On ne réécrit pas l'histoire : les journaux de session, le [[CAHIER]] (figé) et les anciens ADR gardent le mot.

## Conséquences
- Remplace la dernière ligne de [[ADR-0017 Pulse integre sans page]] (« le nom Pulse reste pour le code et les specs »).
- Docs vivantes mises à jour : CLAUDE.md, README, [[00-Accueil]], [[VISION]], [[ARCHITECTURE]], [[ROADMAP]], [[RULES]], [[IDEES]], maquettes, specs.

Liens : [[Decisions - Index]]
