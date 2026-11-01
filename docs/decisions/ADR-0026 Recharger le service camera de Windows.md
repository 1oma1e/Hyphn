---
type: decision
date: 2026-11-01
statut: accepte
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
**A** codé le 2026-11-01 (`install.rs`, `reload_camera_service`). Le 2026-11-01 (session 3), Evan choisit **A+** : en plus, au lancement de Hyphn, on vérifie que le service garde la bonne DLL.

Comment on le sait : la DLL ne se connecte au tuyau que pendant qu'une app montre la caméra, donc elle ne peut pas répondre au lancement. À la place, quand un processus la charge, elle calcule l'empreinte SHA-256 de son propre fichier et l'écrit dans `C:\ProgramData\Hyphn\loaded-<pid>.txt` (dossier où seul le service écrit). Au lancement, Hyphn demande à Windows le numéro de processus (PID) des services « FrameServer » et « FrameServerMonitor » (permis sans admin). Si le fichier d'un service en marche porte une autre empreinte que celle de l'app, Hyphn se relance en admin (« Oui » une fois) avec `--reload` : les deux services sont arrêtés et les fichiers `loaded-*` effacés. Windows les relance tout seul à la prochaine ouverture d'une caméra, avec la nouvelle DLL.

## Conséquences
- Pas de « Oui » en plus tant que la DLL n'a pas changé.
- Une DLL d'avant ce correctif n'écrit pas de fichier : elle n'est pas détectée (une fois, au passage à cette version ; l'installation arrête déjà le service).
- Si Evan répond « Non », Hyphn redemande au lancement suivant (seulement tant que le service garde l'ancienne DLL).
- Le piège est noté dans [[STATE]].
