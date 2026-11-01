---
type: decision
date: 2026-11-01
statut: accepte
---
# ADR-0028 QR plus petit et lecture rapide

## Contexte
Le scan du QR est parfois lent, parfois raté (constat d'Evan, iPhone 16 Pro Max). Le QR fait 29×29 cases ([[Core - Appairage QR]], E2). Sur les iPhone Pro récents, l'objectif principal ne fait pas la mise au point à moins de ~20 cm : tenu près de l'écran, l'image reste floue tant que l'iPhone n'a pas basculé sur l'objectif macro. Apple recommande de lire `minimumFocusDistance` et de zoomer d'autant (WWDC21 session 10047, exemple AVCamBarcode). Evan veut aussi que la caméra s'arrête dès la lecture, avec un écran d'analyse aux mots simples.

## Options
| Option | Pour | Contre |
|---|---|---|
| QR 25×25 : empreinte 96 bits, jeton 48 bits, champs collés en un seul bloc base32 | Cases 16 % plus grosses | Empreinte plus courte dans le QR |
| Garder 29×29 | Rien à changer | Cases plus petites |
| QR qui change toutes les 20 s (idée d'Evan) | Jeton exposé moins longtemps | N'aide pas l'empreinte (elle est la même pour tous les QR du PC : un pirate peut chercher hors ligne sans limite de temps) ; le QR change pendant qu'on vise |

## Décision
Choix d'Evan le 2026-11-01 : QR plus petit, durée de vie réduite de 2 min à **1 min** (demande d'Evan).
- **Format** : `HY1` puis un bloc base32 de 24 octets : IPv4 (4), port (2), début de l'empreinte du PC (12 = 96 bits), jeton (6 = 48 bits). 42 caractères alphanumériques, correction basse → **version 2, 25×25**.
- **Pourquoi c'est sûr** : 96 bits d'empreinte, c'est 2⁹⁶ essais pour fabriquer un faux certificat, hors d'atteinte même sans limite de temps ; l'iPhone garde ensuite l'empreinte complète. Le jeton de 48 bits ne sert qu'une fois, 1 min, et chaque essai est une vraie connexion TLS au PC. Le code à 4 chiffres vérifie encore les deux empreintes complètes.
- **Lecture sur l'iPhone** (d'après AVCamBarcode) : zoom calculé avec `minimumFocusDistance` pour que le QR remplisse le viseur à une distance où l'image est nette ; lecture limitée au carré du viseur (`rectOfInterest`).
- **Après la lecture** : la caméra s'arrête et un écran d'analyse prend sa place, avec des mots simples (« QR lu », « Je contacte ton PC », « Je vérifie que c'est bien lui »).

## Conséquences
- Un ancien QR (`HYPHN:…`) est refusé avec « mets à jour Hyphn » : rien de grave, un QR ne vit que 1 min.
- [[Core - Appairage QR]] E2 et E3 mis à jour.
- Non vérifié : gain réel de vitesse ; à mesurer avec la porte de la phase 1 (moins de 3 s).
