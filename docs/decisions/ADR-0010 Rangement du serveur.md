---
type: decision
date: 2026-10-30
statut: propose
---
# ADR-0010 Rangement de Hyphn sur le serveur

## Contexte
Hyphn ajoute des services (anisette, puis xtool, AltServer) sur un serveur où tournent déjà les conteneurs d'Evan (Home Assistant, Nginx Proxy Manager…). Il faut pouvoir les reconnaître, les mettre à jour et les supprimer sans jamais toucher au reste. Rien ne doit être joignable depuis internet.

## Options
| Option | Pour | Contre |
|---|---|---|
| Un seul compose pour tout Hyphn | Un fichier | Mettre à jour un service relance les autres |
| Un dossier et un compose par service, noms préfixés `hyphn-` | Chaque service vit et se met à jour seul ; repérable d'un coup d'œil | Plusieurs fichiers |

## Décision
Option 2 : `~/hyphn/<service>/docker-compose.yml` sur le serveur (dossier `~/hyphn` en 700), copié depuis `infra/<service>/` du repo, qui reste la source. Conteneurs, volumes et réseaux préfixés `hyphn-`. Ports liés à `192.168.1.63` seulement, comme les autres services d'Evan. Pour l'anisette, le volume couvre tout `~/.config/anisette-v3/` (pas seulement `lib/` comme le README officiel), sinon l'identité de l'appareil est perdue à chaque recréation.

## Conséquences
- Détails et commandes : [[Serveur]].
- xtool et AltServer suivront le même rangement.
- Bon choix si une mise à jour d'image (`pull` + `up -d`) ne touche qu'un service et garde l'identité anisette.
