---
paths:
  - "apps/ios/**"
---
- Avant d'écrire du code iOS, relis les sections « Énergie » et « iOS » de `docs/RULES.md` : elles s'appliquent à chaque ligne.
- Une API iOS dont on doute se vérifie dans la doc Apple (developer.apple.com), pas de mémoire. Ce qui ne peut pas être testé sur l'iPhone d'Evan est marqué « non vérifié ».
- Build et installation : seulement par xtool sur le serveur (voir `docs/ARCHITECTURE.md`, section Build). Aucune commande ne suppose un Mac ou Xcode.
