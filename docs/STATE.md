# État du projet

Mis à jour : 2026-10-30 (session « iPhone et SideStore »). Réécrit à chaque `/session-end`.

## Phase
**0 — Fondations.** Pas une ligne de code de l'app. Porte de sortie : [[ROADMAP]].

## Fait
- Préparation (2026-10-29) : cahier figé ([[CAHIER]]), recherche ([[Points a tester]], [[Concurrents et projets open source]]), méthode (hooks, skills, `reviewer`, `tools/check-docs.ps1`), docs, maquettes ([[Maquettes - Index]]), ADR 0001 à 0009 ([[Decisions - Index]]).
- Serveur `evan@192.168.1.63` (Debian 13, x86_64, Wi-Fi) : tout Hyphn dans `~/hyphn/<service>/`, compose copiés depuis `infra/<service>/` ([[Serveur]]).
- **xtool prêt** : image `ghcr.io/xtool-org/xtool:1.24.0` dans `~/hyphn/xtool/`, SDK iOS 27.2 dans le volume `hyphn-xtool_home` ([[ADR-0011 xtool en Docker]]).
- **SideStore sur l'iPhone** (2026-10-30) : iPhone 16 Pro Max, iOS 27.0.1, mode développeur + code + LocalDevVPN ; Apple ID secondaire créé ; iloader 2.4.1 (`F:\iloader`) a posé SideStore 0.7.0-alpha ; « Refresh All » réussi avec LocalDevVPN (confirmé par Evan, sans capture).
- **Anisette** : `mac-ani.jkcoxson.com` dans iloader et SideStore, car Apple refuse l'anisette « Android » du conteneur `hyphn-anisette` (`-80045`) ([[ADR-0012 Anisette Mac publique]]).

## Pas fait
- Push : 4 commits (plus les docs de cette session) attendent la demande d'Evan.
- `xtool setup` (connexion Apple sur le serveur) avec l'Apple ID secondaire.
- Décider d'arrêter ou non le conteneur `hyphn-anisette` (inutilisé).

## En attente d'Evan
- Confirmer que « Xcode à la fin » vise Xcode sur le Mac.
- Valider les ADR `propose` : 0003, 0004, 0005, 0006, 0007, 0008, 0010.
- Valider les maquettes.
- Optionnel : une capture de « My Apps » après Refresh All pour le journal ; supprimer `F:\Downloads\Xcode_27.2.xip`.

## Non vérifié
- Build et signature d'une app depuis le conteneur xtool ; `xtool setup` avec l'anisette jkcoxson.
- Rafraîchissement sans câble à J+7 ; comportement si `mac-ani.jkcoxson.com` tombe.
- Volumes du serveur après un redémarrage complet.
- Hook git `commit-msg` : pas encore déclenché par une vraie ligne `Co-Authored-By`.
- Les points de [[Points a tester]] marqués « non vérifié ».

## Pièges à retenir
- iPhone branché en USB : couper son **partage de connexion**, sinon Windows route `192.168.1.x` par l'iPhone (erreur 10060).
- SideStore : « Anisette Servers » est caché tant que « On-Device Anisette » est activé (User Customizations → ANISETTE).
- Un seul VPN actif sur iOS : LocalDevVPN coupe WireGuard.

## Prochaine étape
Session suivante — **phase 0, étape « Hello SwiftUI »** :
1. Serveur : `xtool setup` avec l'Apple ID secondaire (Evan tape les identifiants dans le conteneur, jamais dans le chat), anisette jkcoxson.
2. Projet « Hello » minimal (`xtool new`), `xtool.yml` relu à la main, build dans le conteneur → `.ipa`.
3. Installer le `.ipa` avec SideStore. Preuve : capture de l'app ouverte sur l'iPhone.

Commande pour commencer : `/session-start phase 0 : Hello SwiftUI avec xtool`.
