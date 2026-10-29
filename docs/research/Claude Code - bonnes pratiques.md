# Claude Code — bonnes pratiques (octobre 2026)

Source principale : [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices). Autres liens dans [[SOURCES]].

## Les idées clés
1. **Deux sortes de consignes.** CLAUDE.md, les skills et le prompt sont *lus* par Claude, qui décide (presque toujours il suit). Les hooks, les règles `deny` et les tests sont *appliqués* par Claude Code, à tous les coups. Une règle sans exception va dans la deuxième catégorie.
2. **N'écrire que ce que Claude ne peut pas trouver en lisant le repo** : commandes de vérification, pièges, décisions prises hors du code, ce qu'on a dû corriger deux fois. Pas de description de l'architecture ou de l'arborescence (« Claude reads the repo itself »).
3. **CLAUDE.md court** (moins de 200 lignes) : chaque ligne coûte un peu d'attention à chaque tâche. Préférences perso dans `CLAUDE.local.md` (ignoré par git). `/doctor` propose des coupes.
4. **Règles par dossier** : `.claude/rules/x.md` avec `paths:` ne se charge que quand Claude travaille dans ces fichiers.
5. **Procédures dans des skills** (`.claude/skills/<nom>/SKILL.md`) : seul le nom et la description sont chargés tant qu'on ne s'en sert pas. Pour un rituel avec effets (commit, release) : `disable-model-invocation: true`, seul Evan le lance.
6. **Donner une vérification** qui répond « passe / ne passe pas » (test, code de sortie, capture comparée à la maquette). Demander la *preuve* : la commande et sa sortie.
7. **Hook `Stop`** (code de sortie 2) pour obliger un test ou un build vert avant que Claude finisse ; plafond de 8 blocages d'affilée.
8. **Règles `deny`** (`Read(./.env)`) valables dans tous les modes, y compris auto ; elles attrapent aussi `cat .env`, pas un script qui ouvre le fichier.
9. **Peu de règles imposées** : chaque hook ou `deny` peut gêner à tort et doit être entretenu. « À quarante, la plupart sont des préférences. »
10. **Sous-agents** : utiles pour le parallèle, pour garder une longue sortie hors de la conversation et pour un **relecteur qui n'a pas vu le raisonnement**. `tools: Read, Grep, Glob` = relecteur qui ne peut rien modifier. Ils coûtent des jetons et ne donnent pas une meilleure réponse que la session principale.
11. **Piloter la session** : `Esc` pour arrêter, `/rewind` pour revenir en arrière, `/clear` entre deux tâches sans rapport, et après deux corrections ratées, `/clear` + un meilleur prompt.
12. **Spec avant le code** : « interviewe-moi jusqu'à pouvoir écrire SPEC.md », puis nouvelle session pour construire à partir de la spec ; le relecteur compare ensuite le code à la spec.

## Ce qu'on peut arrêter de faire (d'après la doc)
- Les MAJUSCULES et « IMPORTANT » : ça fait sur-appliquer la règle. Une règle qui doit tenir devient un hook.
- « Réfléchis bien », « sois exhaustif » : c'est le réglage d'effort (`/effort`) qui compte ; `ultrathink` pour un seul message.
- Gérer le contexte à la main : fenêtre de 1M et compaction automatique ; `/clear` reste utile pour la qualité et le coût.
- Décrire l'architecture dans CLAUDE.md.

## Ce qu'on en tire pour Hyphn
- CLAUDE.md de ~55 lignes : langue, pièges, règles d'Evan, où est l'état. Pas d'arborescence.
- Hook SessionStart qui affiche STATE.md **et** le résultat de `tools/check-docs.ps1`.
- `deny` : secrets (`.env`, `secrets/`, `.p12`, `.mobileprovision`) et `docs/CAHIER.md` (figé).
- Hook git `commit-msg` qui refuse `Co-Authored-By: Claude` (règle d'Evan oubliée une fois dans RobloxGame).
- Hook `Stop` « build vert » **seulement quand il y aura du code** (phase 1) : aujourd'hui il n'aurait rien à vérifier.
- Sous-agent `reviewer` en lecture seule, modèle Sonnet (assez bon pour relire, moins cher).
- Une spec par fonctionnalité dans `docs/specs/` : voir [[ADR-0008 Une spec par fonctionnalite]].

Liens : [[Projets existants d'Evan]], [[ADR-0001 Methode de travail]]
