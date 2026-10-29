---
type: decision
date: 2026-10-29
statut: accepte
---
# ADR-0002 Les docs du repo sont le vault Obsidian

## Contexte
Le cahier prévoit des maquettes dans un vault Obsidian « lié depuis docs/ ». Evan n'a pas de vault séparé : ses vaults sont les dossiers `docs/` de RobloxGame et d'AppHome.

## Options
| Option | Pour | Contre |
|---|---|---|
| Vault séparé hors du repo | Sépare les notes perso | Docs et maquettes non versionnées, liens qui cassent, deux sources de vérité |
| `Hyphn/docs` = vault | Comme ses autres projets ; tout versionné ; Claude peut contrôler les liens | Les réglages Obsidian sont dans le repo (on ignore `workspace*.json`) |

## Décision
`Hyphn/docs` est le vault (choix d'Evan, 2026-10-29). Maquettes dans `docs/maquettes/`. Entrée : [[00-Accueil]].

## Conséquences
- Evan ouvre `C:\Users\Evan\Desktop\Hyphn\docs` avec « Ouvrir un dossier comme coffre ».
- Liens `[[Nom exact]]` partout ; `tools/check-docs.ps1` vérifie qu'aucun lien n'est cassé.
- Ne jamais mélanger avec les vaults de RobloxGame ou d'AppHome.
