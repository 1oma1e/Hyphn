---
paths:
  - "apps/desktop/**"
  - "apps/desktop-vcam/**"
  - "apps/obs-plugin/**"
---
- Avant d'écrire du code PC, relis les sections « Énergie », « PC » et « Sécurité » de `docs/RULES.md`.
- Une API Windows (Media Foundation, MFCreateVirtualCamera) se vérifie sur Microsoft Learn, pas de mémoire.
- La webcam virtuelle ne demande les droits admin qu'une fois, à l'installation (enregistrement de la DLL). L'app elle-même tourne sans admin.
