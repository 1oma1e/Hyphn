# État du projet

Mis à jour : 2026-10-29 (session de préparation). Réécrit à chaque `/session-end`.

## Phase
**0 — Fondations.** Pas une ligne de code de l'app. Porte de sortie : [[ROADMAP]].

## Fait
- Cahier enregistré et figé : [[CAHIER]].
- Règles des 3 projets d'Evan analysées : [[Projets existants d'Evan]].
- Recherche : [[Claude Code - bonnes pratiques]], [[Concurrents et projets open source]], [[Points a tester]], [[Noms]].
- Méthode : CLAUDE.md, hook SessionStart, `deny`, hook git `commit-msg`, skills `/session-start` et `/session-end`, sous-agent `reviewer`, `tools/check-docs.ps1`.
- Docs : [[VISION]], [[ROADMAP]], [[ARCHITECTURE]], [[RULES]], [[IDEES]], 8 ADR ([[Decisions - Index]]).
- Maquettes : 11 écrans + 3 parcours ([[Maquettes - Index]]).

## En attente d'Evan
- Valider les ADR `propose` : 0003 (hook commit), 0004 (nom), 0005 (Drop HTTPS), 0006 (batterie), 0007 (porte phase 0), 0008 (spec).
- Valider les maquettes.
- Confirmer que le serveur de build est le Debian 192.168.1.63 (celui d'AppHome).
- Dire s'il a un Mac (une note d'AppHome le mentionne, le cahier dit « pas de Mac »).

## Non vérifié
- Les hooks et skills : créés dans cette session, actifs seulement à la prochaine. `tools/check-docs.ps1` a été lancé à la main (voir le journal).
- Tous les points de [[Points a tester]] marqués « non vérifié ».

## Prochaine étape
Session suivante — **phase 0, étape « anisette »** :
1. Relever le serveur en lecture seule : `uname -m`, `cat /etc/os-release`, `df -h`, `free -h`, `docker ps` (sans toucher aux autres conteneurs).
2. Écrire `infra/docker-compose.yml` avec `dadoum/anisette-v3-server` (port 6969 sur le réseau local seulement, volume, `restart: always`), le faire valider par Evan, puis le lancer.
3. Preuve : `curl http://<ip-serveur>:6969` depuis le PC renvoie du JSON avec les en-têtes `X-Apple-I-MD`.

Commande pour commencer : `/session-start phase 0 : serveur anisette`.
