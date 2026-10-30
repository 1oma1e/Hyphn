# État du projet

Mis à jour : 2026-10-30 (session « serveur anisette »). Réécrit à chaque `/session-end`.

## Phase
**0 — Fondations.** Pas une ligne de code de l'app. Porte de sortie : [[ROADMAP]].

## Fait
- Préparation (2026-10-29) : cahier figé ([[CAHIER]]), recherche ([[Points a tester]], [[Concurrents et projets open source]]), méthode (hooks, skills, `reviewer`, `tools/check-docs.ps1`), docs, maquettes ([[Maquettes - Index]]), ADR 0001 à 0009 ([[Decisions - Index]]).
- Serveur relevé en lecture seule : Debian 13 x86_64, 183 Go libres, 5,8 Go de RAM dispo, Docker 28.5 ([[Serveur]]).
- **Anisette en service** : conteneur `hyphn-anisette` dans `~/hyphn/anisette/`, port `192.168.1.63:6969`, `restart: always`, identité conservée dans le volume `hyphn-anisette_data`. Preuve : `curl http://192.168.1.63:6969` depuis le PC renvoie du JSON avec `X-Apple-I-MD` et `X-Apple-I-MD-M` (2026-10-30).
- Hooks SessionStart et skills `/session-start`, `/session-end` : marchent en conditions réelles.

## Pas fait
- Commit `c0a855e` (anisette) et les docs de fin de session : pas encore poussés.

## En attente d'Evan
- Créer l'**Apple ID secondaire** dédié (jamais dans le repo ni dans le chat).
- Télécharger `Xcode.xip` depuis developer.apple.com (avec n'importe quel Apple ID) : xtool en tire le SDK iOS. On le copiera sur le serveur.
- Confirmer que « Xcode à la fin » vise Xcode sur le Mac.
- Valider les ADR `propose` : 0003 (hook commit), 0004 (nom), 0005 (Drop HTTPS), 0006 (batterie), 0007 (porte phase 0), 0008 (spec), 0010 (rangement serveur).
- Valider les maquettes.

## Non vérifié
- Hook git `commit-msg` : pas encore déclenché par une vraie ligne `Co-Authored-By`.
- Anisette après un redémarrage complet du serveur, et avec un vrai client (xtool, SideStore).
- Les points de [[Points a tester]] marqués « non vérifié ».

## Prochaine étape
Session suivante — **phase 0, étape « xtool »** (après l'Apple ID et `Xcode.xip`) :
1. Lire la doc d'installation de xtool pour Linux et choisir : Docker dans `~/hyphn/xtool/` (comme [[ADR-0010 Rangement du serveur]]) ou installation directe.
2. Installer Swift, xtool et usbmuxd sur le serveur ; copier `Xcode.xip` et lancer `xtool sdk`.
3. Preuve : `xtool --help` et `xtool sdk` OK sur le serveur.

Commande pour commencer : `/session-start phase 0 : xtool sur le serveur`.
