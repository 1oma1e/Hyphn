---
type: decision
date: 2026-11-16
statut: accepte
---
# ADR-0040 Mises à jour auto et dépôt public

## Contexte
Evan veut qu'un ami installe Hyphn (PC et iPhone) depuis GitHub, puis reçoive chaque nouvelle version sans retélécharger à la main (2026-11-16). Le dépôt `1oma1e/Hyphn` était privé : personne d'autre ne voyait les Releases. Le setup de [[ADR-0039 Setup Windows publie sur GitHub]] n'avait aucune mise à jour.

## Options
| Option | Pour | Contre |
|---|---|---|
| A. **Rendre `Hyphn` public**, updater de Tauri pour le PC, source SideStore pour l'iPhone | Un seul dépôt ; les fichiers de mise à jour sont servis par GitHub | Tout le code et les docs deviennent visibles |
| B. Dépôt public à part pour les fichiers seulement | Code privé | Deux dépôts à tenir à chaque version |

## Décision
**A** (choix d'Evan, 2026-11-16). Historique vérifié avant : aucun secret, auteur des commits en adresse `noreply` de GitHub.
- **PC** : `tauri-plugin-updater`. Au lancement, Hyphn lit `https://github.com/1oma1e/Hyphn/releases/latest/download/latest.json` ; si la version est plus récente, un bandeau propose « Installer » ; le setup se télécharge, sa signature est vérifiée, puis il s'installe (fenêtre de progression, un « Oui » admin car l'app est installée pour tout le PC) et Hyphn redémarre. Réglages, appairage et langues sont gardés.
- **Clé de signature** : générée sur le PC dans `F:\Hyphn\keys\` (hors dépôt, à sauvegarder : sans elle, plus aucune mise à jour possible pour les PC déjà installés). La clé publique est dans `tauri.conf.json`.
- **iPhone** : `source.json` à la racine du dépôt (format AltStore Classic, lu par SideStore). L'ami l'ajoute une fois ; SideStore montre « Update » quand une version plus récente y est listée. Le rafraîchissement tous les 7 jours reste obligatoire (compte Apple gratuit).
- **Une version** = `tools/release.ps1` : setup signé, `latest.json`, mise à jour de `source.json`, fichiers rangés dans `F:\Hyphn\out\v<version>\` ; Evan crée la Release et y dépose les fichiers.
- L'app iPhone publiée n'est pas signée (`xtool dev build`) : elle ne contient ni profil ni nom de compte Apple.

## Conséquences
- `README.md` en anglais pour les visiteurs ; les docs restent en français.
- Une version 0.1.1 déjà installée n'a pas d'updater : elle passe à 0.2.0 à la main une fois.
- Preuve : un PC en 0.2.0 voit « Mise à jour disponible » quand une Release plus récente existe ; SideStore affiche la source Hyphn et son app.
- Plus tard ([[IDEES]]) : setup construit par GitHub Actions.

Liens : [[ADR-0039 Setup Windows publie sur GitHub]], [[Decisions - Index]]
