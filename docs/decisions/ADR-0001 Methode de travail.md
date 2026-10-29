---
type: decision
date: 2026-10-29
statut: accepte
---
# ADR-0001 Méthode de travail et structure des docs

## Contexte
Le cahier (section 9) fixe la méthode : sessions courtes, STATE.md lu à chaque début, rituels `/session-start` et `/session-end`, règles sans exception dans des hooks. Les projets précédents d'Evan ont montré leurs limites (journal géant, état en double, règles en majuscules) : voir [[Projets existants d'Evan]].

## Options
| Option | Pour | Contre |
|---|---|---|
| Copier la méthode de SafeSweep | Connue, elle marche | Plusieurs fichiers d'état qui se contredisent, journal de 400 lignes |
| Méthode du cahier + leçons des 3 projets | Un seul état, journal par session, contrôle scripté | Nouveaux noms de skills à prendre en main |

## Décision
Méthode du cahier, avec ces choix (demandés par Evan le 2026-10-29) :
- `docs/STATE.md` est le **seul** état courant (< 60 lignes) ; un journal par session dans `docs/sessions/` (< 40 lignes).
- Skills `/session-start` et `/session-end` avec `disable-model-invocation: true`.
- Hook SessionStart qui affiche STATE.md et le résultat de `tools/check-docs.ps1`.
- Règles `deny` pour les secrets et pour `docs/CAHIER.md` (figé : on le corrige par ADR).
- Sous-agent `reviewer` (Read, Grep, Glob).
- Règles par dossier dans `.claude/rules/` qui renvoient à `docs/RULES.md` (source unique).

## Conséquences
- CLAUDE.md reste court ; tout ajout passe le test « Claude peut-il le trouver en lisant le repo ? ».
- Un hook `Stop` « build et tests verts » sera ajouté en phase 1, quand il y aura une commande à lancer.
- Les améliorations proposées en plus : [[ADR-0003 Commits sans attribution]], [[ADR-0007 Porte de la phase 0]], [[ADR-0008 Une spec par fonctionnalite]].
