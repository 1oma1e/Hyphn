# État du projet

Mis à jour : 2026-10-30 (session « xtool sur le serveur »). Réécrit à chaque `/session-end`.

## Phase
**0 — Fondations.** Pas une ligne de code de l'app. Porte de sortie : [[ROADMAP]].

## Fait
- Préparation (2026-10-29) : cahier figé ([[CAHIER]]), recherche ([[Points a tester]], [[Concurrents et projets open source]]), méthode (hooks, skills, `reviewer`, `tools/check-docs.ps1`), docs, maquettes ([[Maquettes - Index]]), ADR 0001 à 0009 ([[Decisions - Index]]).
- Serveur `evan@192.168.1.63` (Debian 13, x86_64, Wi-Fi) : tout Hyphn dans `~/hyphn/<service>/`, compose copiés depuis `infra/<service>/` ([[Serveur]]).
- **Anisette en service** : conteneur `hyphn-anisette`, port `192.168.1.63:6969`, identité dans le volume `hyphn-anisette_data`. Preuve : `curl http://192.168.1.63:6969` renvoie `X-Apple-I-MD` et `X-Apple-I-MD-M` (2026-10-30).
- **xtool prêt** : image `ghcr.io/xtool-org/xtool:1.24.0` (Swift 6.4.1) dans `~/hyphn/xtool/`, SDK iOS 27.2 tiré de `Xcode_27.2.xip` dans le volume `hyphn-xtool_home` ([[ADR-0011 xtool en Docker]]). Preuves : `xtool --help` OK, `xtool sdk status` = installé, `swift sdk list` = `darwin` (2026-10-30).
- Commits locaux : `c0a855e` (anisette), `f3ea4ce` (docs), `33ccf0e` (xtool).

## Pas fait
- Push : 3 commits (plus les docs de fin de session) attendent la demande d'Evan.
- `xtool setup` (connexion Apple) : attend l'Apple ID secondaire.

## En attente d'Evan
- Créer l'**Apple ID secondaire** dédié (jamais dans le repo ni dans le chat).
- Confirmer que « Xcode à la fin » vise Xcode sur le Mac.
- Valider les ADR `propose` : 0003, 0004, 0005, 0006, 0007, 0008, 0010.
- Valider les maquettes.
- Optionnel : supprimer `F:\Downloads\Xcode_27.2.xip` (une copie vérifiée est sur le serveur).

## Non vérifié
- Build et signature d'une app depuis le conteneur xtool ; xtool avec l'anisette du serveur.
- Anisette et volumes après un redémarrage complet du serveur.
- Hook git `commit-msg` : pas encore déclenché par une vraie ligne `Co-Authored-By`.
- Les points de [[Points a tester]] marqués « non vérifié ».

## Prochaine étape
Session suivante — **phase 0, étape « iPhone + SideStore »** (après l'Apple ID secondaire) :
1. iPhone : activer le mode développeur, vérifier le code de verrouillage, installer LocalDevVPN (App Store). Evan le fait, Claude guide écran par écran.
2. PC : installer iloader, poser SideStore avec l'Apple ID secondaire, pointer SideStore vers `http://192.168.1.63:6969`.
3. Preuve : SideStore s'ouvre sur l'iPhone et « Refresh All » réussit avec LocalDevVPN connecté.

Commande pour commencer : `/session-start phase 0 : iPhone et SideStore`.
