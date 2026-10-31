---
type: decision
date: 2026-10-31
statut: accepte
---
# ADR-0019 App PC en premier avec iPhone simulé

## Contexte
La porte de la phase 0 n'est pas encore passée (premier rafraîchissement automatique le 2026-11-02, [[ADR-0007 Porte de la phase 0]]) et les specs de la phase 1 sont en brouillon ([[ADR-0008 Une spec par fonctionnalite]]). Evan veut quand même voir et utiliser toute l'app PC tout de suite, au design de la maquette V2 ([[ADR-0016 Design visuel V2]]). L'app iPhone viendra après.

## Options
| Option | Pour | Contre |
|---|---|---|
| A. Attendre la porte et les specs validées | Respecte l'ordre doc → spec → code | Rien de concret avant plusieurs jours |
| B. App PC complète, iPhone simulé dans un module à part | On voit et teste toute l'interface ; le simulé se remplace sans toucher aux écrans | Du code avant la porte ; des données « démo » à ne pas confondre avec des vraies |

## Décision
**B** (choix d'Evan, 2026-10-31). L'app PC (Rust + Tauri) est codée en entier :
- **Réel** : identité et certificat du PC (E1), QR `hyphn://pair?` (E2), jeton 128 bits à usage unique de 2 min (E3), code à 4 chiffres tiré des empreintes (E6), mémoire des appareils reliés et « Oublier » (E7, E10), réglages enregistrés.
- **Simulé** (module `demo`, à remplacer par le vrai réseau) : le scan de l'iPhone (bouton « Simuler le scan »), son certificat, sa batterie, sa chaleur, son stockage, l'aperçu Cam et les transferts Drop. Tout ce qui est simulé est marqué « démo » dans l'interface.

Ce n'est pas le début de la phase 1 : sa porte (iPhone visible en moins de 3 s après un vrai scan) reste à passer avec l'app iPhone.

## Conséquences
- `apps/desktop/` existe avant la phase 1. Le TLS (E4), le `PairRequest` (E5), Bonjour et les vérifications réseau (E11) restent à faire, avec l'app iPhone.
- Les specs restent en brouillon ; ce qui a été codé suit la spec actuelle, et une spec qui change veut dire du code qui change.
- On saura que c'était un bon choix si le passage au vrai iPhone ne touche que le module `demo`.

Liens : [[Decisions - Index]], [[Core - Appairage QR]]
