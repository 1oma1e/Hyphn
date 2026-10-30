---
type: decision
date: 2026-10-31
statut: accepte
---
# ADR-0013 Build iOS par clone Git

## Contexte
Le code de l'app iPhone (`apps/ios/`) s'écrit sur le PC, mais xtool tourne dans Docker sur le serveur ([[ADR-0011 xtool en Docker]]). Il faut amener le code sur le serveur, fixer une fois pour toutes l'identifiant de l'app (RULES : toujours le même) et produire un `.ipa` pour SideStore. Le repo GitHub est privé.

## Options
| Option | Pour | Contre |
|---|---|---|
| A. Copie `scp` de `apps/ios` avant chaque build | Rien à configurer, pas besoin de pousser | Le serveur n'a pas l'historique ; copie à la main |
| B. `git clone` sur le serveur avec une clé de déploiement en lecture seule | Même code que GitHub, `git pull` suffit ; clé limitée à ce repo, sans écriture | Il faut pousser avant chaque build |

## Décision
**B**, choisie par Evan le 2026-10-30 :
- Clé `~/hyphn/git/deploy_hyphn` (ed25519, lecture seule, ajoutée dans GitHub → Deploy keys) et `~/hyphn/git/known_hosts` (empreinte GitHub vérifiée). Rien dans `~/.ssh`.
- Clone dans `~/hyphn/xtool/src` (vu `/work/src` dans le conteneur), `core.sshCommand` réglé sur cette clé.
- Bundle ID **`io.github.1oma1e.hyphn`** (choisi par Evan), dans `apps/ios/xtool.yml`.
- `.ipa` : `xtool dev build` puis zip de `Payload/Hyphn.app` avec `python3 -m zipfile` sur l'hôte, car l'image xtool 1.24.0 n'a pas `zip` (`--ipa` échoue et efface le `.app`). Le `.ipa` n'est pas signé : SideStore le signe à l'installation.

## Conséquences
- Chaque build demande un push (avec l'accord d'Evan) puis `git pull` sur le serveur.
- Le contournement `zip` disparaît si une image xtool l'inclut : à revoir à chaque mise à jour de l'image.
- Bon choix si un build ne demande que `pull` + build + zip, sans copie à la main.
