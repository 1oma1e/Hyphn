---
type: decision
date: 2026-11-04
statut: accepte
---
# ADR-0038 Retrait des filtres Snap

## Contexte
[[ADR-0037 Filtres Snap avec accord explicite]] a ajouté les filtres Snap (Camera Kit). À l'essai (2026-11-03) : Snap ne donne que ses filtres de démo et ceux qu'on publie soi-même ; un filigrane « Camera Kit Staging » tant que Snap n'a pas validé l'app ; il faut un compte, une clé, et Lens Studio pour chaque filtre. Evan : « finalement Snapchat c'est nul ».

## Options
| Option | Pour | Contre |
|---|---|---|
| A. Garder Snap | Le travail est fait | Peu de filtres, filigrane, données vers Snap, kit propriétaire |
| B. **Tout retirer**, et faire plus d'effets en local | « Rien ne sort de chez toi » redevient vrai partout ; moins de code | Il faut fabriquer les effets nous-mêmes |

## Décision
**B** (choix d'Evan, 2026-11-04). Retirés avant tout commit : catégorie « Snap », `ui/snap.js`, `@snap/camera-kit` et esbuild, la commande Rust `snap_fetch`, les domaines de Snap dans la politique de sécurité de la fenêtre, `useHttpsScheme` (la fenêtre revient en `http://tauri.localhost`), la clé Snap des réglages du PC. Lens Studio et les projets de filtres sont supprimés du PC.

## Conséquences
- Plus aucune connexion vers Snap. Les effets viennent de bibliothèques libres en local ([[Filtres et effets existants]], [[Cam - Filtres et effets]]).
- Reste à faire par Evan : supprimer « Neon Glasses » publié sur son compte Snap (my-lenses.snapchat.com, corbeille).

Remplace : [[ADR-0037 Filtres Snap avec accord explicite]]. Liens : [[Decisions - Index]]
