---
type: decision
date: 2026-11-01
statut: propose
---
# ADR-0026 Recharger le service caméra de Windows

## Contexte
La DLL de la webcam tourne dans le service Windows « Frame Server » (Windows Camera Frame Server). Il garde la DLL chargée tant qu'il tourne : après une mise à jour, Discord montrait encore l'ancien écran d'attente jusqu'à l'arrêt du service à la main. Evan veut que ce soit automatique, idéalement au lancement de Hyphn. Arrêter un service demande les droits admin, et l'app tourne sans admin ([[RULES]], règle PC de la webcam).

## Options
| Option | Pour | Contre |
|---|---|---|
| A — Arrêter le service à la fin de l'installation de la webcam (déjà en admin) | Aucune demande en plus ; seulement quand la DLL change | Une DLL installée hors de Hyphn (ou avant ce correctif) n'est pas rechargée |
| B — Le relancer à chaque lancement de Hyphn | Toujours la DLL à jour | Demande admin (« Oui ») à chaque lancement ; coupe la caméra d'une autre app |
| C — À l'installation, donner aux utilisateurs le droit d'arrêter ce seul service ; l'app l'arrête au lancement si la DLL chargée n'est pas la bonne | Automatique sans demande | Change la sécurité d'un service Windows : à peser |

## Décision
**A** codé le 2026-11-01 (`install.rs`, `reload_camera_service`). Proposé pour la prochaine session : le lancement de Hyphn vérifie, avec la DLL elle-même (version envoyée par le tuyau), si le service garde une ancienne version ; si oui, il relance l'installation (« Oui » admin une seule fois), qui arrête le service. Evan tranche entre cette variante de A, B et C.

## Conséquences
- Non vérifié : l'arrêt automatique n'a pas encore servi (la DLL actuelle a été rechargée à la main).
- Le piège est noté dans [[STATE]].
