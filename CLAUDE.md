# Hyphn — consignes du projet

App iPhone + app PC Windows 11 qui s'appairent par QR code et se parlent en local, sans compte ni cloud. Deux modules : **Cam** (webcam virtuelle Wi-Fi jusqu'à 4K60 HEVC + plugin OBS) et **Drop** (transfert trié avec reprise), plus les infos de l'iPhone (batterie, chaleur, stockage) affichées partout sur le PC. Priorité iPhone ; Android seulement quand l'iPhone est fini.

Profil d'Evan, façon de parler, règles git et pièges Windows communs : `~/.claude/CLAUDE.md` (chargé automatiquement dans chaque session). Ce fichier ne garde que ce qui est propre au projet.

## Où en est le projet
L'état exact et la prochaine étape sont dans `docs/STATE.md` (affiché au démarrage par le hook). La phase et sa porte de sortie : `docs/ROADMAP.md`. Ordre de travail toujours : doc → maquette → code. On ne passe à la phase suivante qu'avec l'accord écrit d'Evan.

## Où est quoi (ce que le code ne dit pas)
- `docs/` est **le vault Obsidian du projet** (Evan l'ouvre comme coffre). Entrée : `docs/00-Accueil.md`. Notes en français, liens `[[Nom exact]]`, une idée par note. Pas de doc en dehors de `docs/` sauf ce fichier et `README.md`.
- `docs/CAHIER.md` est figé (règle deny) : on ne le modifie pas, on écrit un ADR dans `docs/decisions/` qui le corrige.
- Maquettes : `docs/maquettes/` (texte + Mermaid).
- Sessions : `/session-start` et `/session-end` (Evan les tape ; Claude ne peut pas les lancer). Journal : `docs/sessions/AAAA-MM-JJ.md`.
- Relecture : sous-agent `reviewer` (lecture seule) contre une spec ou un ADR, puis `/code-review` pour les bugs.
- GitHub : `origin` = https://github.com/1oma1e/Hyphn (push seulement à la demande d'Evan).

## Commandes
- Contrôle des docs : `powershell -NoProfile -File tools/check-docs.ps1` (doit afficher `check-docs: OK`).
- App PC (`apps/desktop/`, iPhone simulé, ADR-0019) : `npm install` une fois, puis `npm run dev` pour la lancer ; tests : `cargo test` dans `apps/desktop/src-tauri/`. Le build Rust va dans `CARGO_TARGET_DIR` (F:).
- Après un clone : `git config core.hooksPath .githooks` (active le refus des lignes `Co-Authored-By`).

## Façon de travailler avec Evan
- Commit seulement avec son accord, push seulement s'il le demande. Conventional Commits, sans aucune attribution à Claude.
- Une idée non demandée va dans `docs/IDEES.md` et se propose ; elle ne se code pas.
- Chercher l'existant avant de créer : dans `docs/` et le code (zéro doublon), puis sur internet (projets open source de `docs/research/`).
- Dire ce qui a **réellement** été lancé et son résultat ; ce qui n'est pas testé est dit « non vérifié ». « Je ne sais pas » vaut mieux qu'une info inventée.
- Il tranche vite : proposer des options, recommander, puis appliquer son choix sans insister.
- Une étape manuelle sur l'iPhone ou le serveur : lui dire exactement où cliquer et quoi regarder, puis attendre sa confirmation.

## Serveur Linux (build et infra)
- Les builds iOS, le serveur anisette et AltServer tournent sur le serveur Linux 24/7 d'Evan (Debian 13, `ssh evan@192.168.1.63`), en Docker. Evan a un Mac, mais Xcode ne sert qu'à la fin (ADR-0009). Le PC et l'iPhone n'en dépendent jamais pour streamer ou transférer.
- Sur ce serveur tournent aussi d'autres conteneurs d'Evan (Home Assistant, Nginx Proxy Manager…) : ne jamais les toucher, ni le pare-feu ; rien d'ouvert sur internet.
- Aucun identifiant Apple dans le repo, les logs ou les réponses : il vit dans un fichier ignoré par git sur le serveur.

## Pièges propres au projet
- `.gitattributes` force LF (sauf `.ps1` en CRLF). Les pièges Windows communs (F:, BOM des `.ps1`, heredocs) sont dans `~/.claude/CLAUDE.md`.
