---
type: decision
date: 2026-10-29
statut: propose
---
# ADR-0006 Santé de la batterie par câble : valeurs brutes, pas de « % santé » inventé

## Contexte
Le cahier veut la santé de la batterie et les cycles par câble (« à tester sur iOS 26 »). La recherche montre que le service diagnostics d'iOS donne l'entrée IORegistry `AppleSmartBattery` (cycles, capacité de conception, capacité pleine charge). Sur les iOS récents, les capacités sont rangées dans `BatteryData` au lieu du premier niveau. Et le « % de santé » des Réglages n'est pas un simple rapport de capacités. Sources : [[Points a tester]].

## Options
| Option | Pour | Contre |
|---|---|---|
| Calculer un « % santé » | Joli, comme les Réglages | Chiffre qui ne correspondra pas à celui d'Apple : une info fausse |
| Afficher les valeurs brutes (cycles, capacité pleine charge / conception en mAh, date de lecture) | Vrai et vérifiable | Moins parlant pour un débutant |

## Décision
Proposé : valeurs brutes, avec un texte « estimation à partir des capacités » si on montre un rapport. Lecture du premier niveau **puis** de `BatteryData`. À tester en phase 1 avec `idevicediagnostics ioregentry AppleSmartBattery` sur l'iPhone d'Evan.

## Conséquences
- Écran Pulse PC : bloc « Batterie (câble) » séparé du bloc « Batterie (app) » : voir [[PC - Pulse]].
- Si iOS 26 ne donne plus ces valeurs par câble : on retire la ligne et on note la date dans [[Points a tester]].
