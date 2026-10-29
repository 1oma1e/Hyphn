---
name: session-end
description: Clôt la session Hyphn - met à jour STATE, écrit le journal, ajoute les ADR et les règles, refait le contrôle de cohérence et propose le commit
disable-model-invocation: true
argument-hint: "[remarques d'Evan]"
---

Tu clôts la session en cours. Fais tout toi-même, sauf ce qui demande l'accord d'Evan (commit, push). Mets à jour les notes existantes au lieu d'en créer des doublons.

## 1. Vérifier
- S'il y a du code : lance les vérifications listées dans `CLAUDE.md` (section Commandes) et note la commande exacte et le résultat.
- Serveurs, conteneurs ou streams de test lancés pendant la session : arrêtés.
- Aucun secret dans ce qui va être commité (`git diff --cached` et fichiers nouveaux : Apple ID, mot de passe, jeton, données anisette).

## 2. Mettre à jour les docs
1. `docs/STATE.md` : **réécrit** selon sa structure (phase, fait, pas fait, non vérifié, prochaine étape exacte). Il doit suffire à un Claude qui ne sait rien. Moins de 60 lignes : l'historique va dans le journal, pas ici.
2. `docs/sessions/AAAA-MM-JJ.md` (date du jour ; si le fichier existe, ajoute `-2`) avec le modèle de `docs/sessions/_modele.md` : objectif et preuve, fait, décisions, problèmes rencontrés, appris, non vérifié. 40 lignes maximum. Pas de liste de fichiers touchés : git la garde.
3. Un ADR dans `docs/decisions/` pour chaque décision technique prise pendant la session (modèle `docs/decisions/_modele.md`, numéro suivant), et sa ligne dans `Decisions - Index.md`. Décision pas encore validée par Evan : `statut: propose`.
4. Une nouvelle règle d'Evan → `docs/RULES.md`. Si elle doit s'appliquer **sans exception**, propose plutôt un hook ou une règle `deny` (dans `.claude/settings.json`) et dis-le à Evan.
5. `docs/ROADMAP.md` : cases cochées seulement si la preuve existe.
6. Une idée nouvelle → `docs/IDEES.md`, pas dans le code.

## 3. Contrôler la cohérence
Relance `tools/check-docs.ps1` et le contrôle à la main de `/session-start` (étape 2). Corrige ce qui est faux. Ce qui ne peut pas être corrigé maintenant va dans STATE (« Pas fait »).

## 4. Mémoire
Mets à jour ta mémoire de projet seulement pour ce que le repo ne contient pas (préférences d'Evan, retours sur ta façon de travailler).

## 5. Dire à Evan (court)
- Fait, pas fait, non vérifié.
- Le message de commit proposé (Conventional Commits, en anglais, **sans** ligne `Co-Authored-By`). Commit seulement après son accord ; push seulement s'il le demande.
- La phrase de départ de la prochaine session : `/session-start <objectif>`.

Remarques d'Evan : $ARGUMENTS
