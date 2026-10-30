---
type: decision
date: 2026-10-30
statut: accepte
---
# ADR-0011 xtool en Docker avec l'image officielle

## Contexte
xtool (et Swift 6.4, qu'il demande) doit tourner sur le serveur Debian 13 d'Evan, où vivent aussi Home Assistant et d'autres services. On veut ne rien installer dans le système, pouvoir tout retirer facilement et garder le rangement de [[ADR-0010 Rangement du serveur]]. Le projet xtool publie une image Docker officielle (`ghcr.io/xtool-org/xtool`) qui contient Swift et xtool.

## Options
| Option | Pour | Contre |
|---|---|---|
| Installation directe (Swift + AppImage dans `/usr/local/bin`) | Commandes courtes (`xtool …`) | Touche le système ; Debian 13 pas sûr d'être pris en charge par swift.org ; nettoyage à la main |
| Image officielle en Docker, version figée | Rien sur le système ; suppression en une commande ; même rangement que l'anisette | Commandes plus longues (`docker compose run --rm xtool …`) ; image de 4,4 Go |

## Décision
Option 2, choisie par Evan le 2026-10-30 : `ghcr.io/xtool-org/xtool:1.24.0` dans `~/hyphn/xtool/` (compose dans `infra/xtool/`), un conteneur jetable par commande. Le volume `hyphn-xtool_home` sur `/root` garde le SDK iOS et la future session Apple. Le tag est figé : on change de version exprès.

## Conséquences
- Détails et commandes : [[Serveur]].
- usbmuxd de l'hôte n'est pas relié au conteneur ; si un jour xtool doit installer par câble, il faudra le relier (socat, comme le prévoit le Dockerfile de xtool).
- Bon choix si le « Hello » se construit et se signe depuis ce conteneur sans rien installer de plus sur le serveur.
