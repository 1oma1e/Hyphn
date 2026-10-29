---
name: session-start
description: Ouvre une session Hyphn - lit l'état, contrôle la cohérence des docs, annonce l'objectif et sa preuve, puis attend le feu vert d'Evan
disable-model-invocation: true
argument-hint: "[objectif ou remarques d'Evan]"
---

Tu ouvres une session sur Hyphn. Réponds en français simple et court.

## 1. Lire (dans cet ordre, rien d'autre au départ)
1. `docs/STATE.md` (déjà affiché par le hook SessionStart : ne le relis pas s'il est dans le contexte).
2. Le dernier fichier de `docs/sessions/` (le plus récent par nom `AAAA-MM-JJ`).
3. `docs/ROADMAP.md` : phase actuelle et sa porte de sortie.
4. `docs/RULES.md`.
5. `git status --short` et `git log --oneline -5`.
Lis une autre note seulement si l'objectif de la session la concerne.

## 2. Contrôler la cohérence
1. Résultat de `tools/check-docs.ps1` (affiché par le hook ; sinon lance-le). Chaque problème est à corriger avant tout.
2. À la main, ce que le script ne voit pas :
   - STATE, ROADMAP et le dernier journal disent la même chose (phase, prochaine étape) ;
   - aucune doc ne contredit un ADR `accepte` de `docs/decisions/` ;
   - s'il y a du code : ce que les docs décrivent existe bien dans le code, et l'inverse.
3. Si la session précédente n'a pas de journal (`/session-end` oublié), propose de le rattraper d'abord.

## 3. Annoncer (10 lignes maximum)
- Phase actuelle, et ce qui a été fait la dernière fois (1 ligne chacun).
- Incohérences trouvées (ou « aucune »).
- **L'objectif de la session en une phrase**, et **la preuve** qui dira qu'il est atteint (une commande et son résultat attendu, une mesure, une capture).
- Le premier pas.

## 4. Attendre
Arrête-toi et attends le feu vert d'Evan avant de modifier quoi que ce soit.

Remarques d'Evan : $ARGUMENTS
