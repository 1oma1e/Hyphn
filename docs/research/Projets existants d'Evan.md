# Ce qu'on reprend de SafeSweep, AppHome et RobloxGame

Analyse du 2026-10-29 des trois projets (`Desktop\SafeSweep`, `Desktop\apphome-nexus`, `Desktop\robloxgame`) et de la mémoire de Claude pour ces projets.

## Ce qu'ils ont en commun
- `docs/` = vault Obsidian, notes en français, liens `[[…]]`, point d'entrée `00-Accueil`, modèles de notes.
- Phases avec porte de sortie, passage seulement avec l'accord écrit d'Evan.
- Rituels de session (`/session` + `/fin-session` ou `/end-session`), `SESSION SUIVANTE.md` réécrit à chaque fin, journal des sessions.
- Décisions dans des notes dédiées (SafeSweep : 13 notes `Decision - …`).
- Règles d'Evan répétées partout : français simple, commits **sans** `Co-Authored-By`, rien d'irréversible sans accord, dire ce qui n'est pas vérifié, chercher avant de créer, zéro doublon et zéro code mort.

## Ce qui a bien marché
- **SafeSweep** est le plus abouti : skills (pas d'anciennes `commands/`) avec `disable-model-invocation: true`, hooks réels (rappel au démarrage, formatage après modification, commit bloqué si les vérifs échouent), règles `ask` sur `rm`, `git push`, `git reset --hard`. CLAUDE.md de 47 lignes.
- Le journal avec « Problèmes rencontrés » et « Non vérifié » : il a gardé la trace des vrais pièges (encodage PowerShell, heredocs, C: plein).
- `/next-phase` qui vérifie chaque case « pour de vrai » avant de changer de phase.
- Le format de décision court : contexte, options (tableau pour/contre), choix, raisons, conséquences.

## Ce qui a moins bien marché
- **Journal unique géant** (385 à 455 lignes) : lourd à relire, et `/session` en relit une partie à chaque fois.
- **Doublons d'état** : `SESSION SUIVANTE`, `CONTEXTE COMPLET`, `Feuille de route`, `Changelog`, `TODO` et la mémoire disent souvent la même chose. Ils finissent par se contredire.
- **Lectures de départ trop longues** : jusqu'à 9 fichiers lus avant de commencer (SafeSweep `/session`, RobloxGame « Routine OBLIGATOIRE »).
- **Règles en MAJUSCULES dans CLAUDE.md** (« OBLIGATOIRE », « toujours ») au lieu d'un hook. Les bonnes pratiques actuelles disent que ça pousse à sur-appliquer la règle sans la garantir.
- **Règle « pas de Co-Authored-By » oubliée** une fois (RobloxGame, historique réécrit) : c'est exactement le cas d'une règle sans exception qui doit être un hook.
- **Listes « Fichiers touchés »** dans le journal : git les garde déjà.
- AppHome et RobloxGame utilisent encore `.claude/commands/` (ancien format) et n'ont aucun hook.

## Synthèse pour Hyphn

| On garde | On améliore | On jette |
|---|---|---|
| `docs/` = vault Obsidian, français, `[[liens]]`, `00-Accueil` | Un seul fichier d'état, **STATE.md** (< 60 lignes), au lieu de SESSION SUIVANTE + CONTEXTE COMPLET + TODO | Le journal unique géant → **un fichier par session** (< 40 lignes) |
| Phases avec porte mesurable et accord écrit d'Evan | Lecture de départ réduite à STATE + dernier journal + ROADMAP + RULES | Les listes « Fichiers touchés » |
| Skills avec `disable-model-invocation: true` | Contrôle de cohérence **scripté** (`tools/check-docs.ps1`) en plus du contrôle à la main | Les MAJUSCULES et « OBLIGATOIRE » dans CLAUDE.md |
| Hook SessionStart, règles `ask` avant les actions risquées | « Pas de Co-Authored-By » imposé par un **hook git** `commit-msg`, pas seulement écrit | `.claude/commands/` (ancien format) |
| Décisions dans des notes → **ADR numérotés** | Règles par dossier (`.claude/rules/` avec `paths:`) : chargées seulement quand on touche ce code | Le Changelog séparé tant qu'il n'y a pas d'utilisateur |
| « Non vérifié » et « Problèmes rencontrés » dans chaque bilan | Une **spec par fonctionnalité** (`docs/specs/`) avec sa preuve, avant le code | |
| Pièges connus : PowerShell 5.1 et BOM, heredocs, C: plein, LF | Sous-agent `reviewer` en lecture seule contre la spec | |

Liens : [[Claude Code - bonnes pratiques]], [[ADR-0001 Methode de travail]], [[00-Accueil]]
