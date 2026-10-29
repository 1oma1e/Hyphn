---
type: decision
date: 2026-10-29
statut: accepte
---
# ADR-0009 Serveur de build = Debian 192.168.1.63, le Mac seulement à la fin

## Contexte
Le cahier dit « serveur Linux 24/7 » et « pas de Mac ». Deux points à confirmer : quel serveur, et Evan a-t-il un Mac (une note d'AppHome le disait).

## Options
| Option | Pour | Contre |
|---|---|---|
| Tout faire avec Xcode sur le Mac | Outils officiels, extensions possibles | Change toute la méthode du cahier ; le Mac n'est pas allumé 24/7 |
| xtool sur le serveur pour tout le projet, Mac + Xcode en dernier | Garde le plan du cahier ; le Mac débloque ce que xtool ne sait pas faire | Deux chaînes de build à la fin |

## Décision
Réponses d'Evan (2026-10-29) : le serveur est son **Debian 13, 192.168.1.63** (celui d'AppHome). Il **a un Mac**, mais **Xcode se fait à la fin**. Le build reste donc xtool sur le serveur pour les phases 0 à 6 ; le Mac sert en dernier, par exemple pour le partage d'écran (extension ReplayKit) si xtool ne sait toujours pas construire les extensions.

## Conséquences
- Sur ce serveur tournent Home Assistant, Nginx Proxy Manager, cloudflare-ddns, pairdrop, ollama… : ne jamais les toucher (règles `ask` sur `ssh * docker rm` et `ssh * sudo`). 4 cœurs, 7,6 Go de RAM, 184 Go libres relevés le 2026-10-28 : à revérifier en phase 0.
- [[ROADMAP]] « Plus tard » : partage d'écran avec xtool **ou** avec le Mac à la fin.
- Le SDK iOS de xtool vient quand même du fichier `Xcode.xip` (téléchargé, pas installé) : voir [[STATE]].
