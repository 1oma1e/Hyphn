# Specs — index

Une spec par fonctionnalité, écrite et validée **avant** le code ([[ADR-0008 Une spec par fonctionnalite]], proposé). Nom : `<Module> - <Fonction>.md` (ex. `Core - Appairage QR.md`).

## Contenu d'une spec (une page)
1. **But** en une phrase, et pour qui.
2. **Hors périmètre** : ce qu'on ne fait pas cette fois.
3. **Parcours** : lien vers la maquette ([[Maquettes - Index]]).
4. **Exigences** numérotées (E1, E2…).
5. **Cas limites** (réseau coupé, permission refusée, iPhone chaud…).
6. **Preuve** : la commande, la mesure ou la capture qui dira « fini ».

## Specs
Statuts : `brouillon` (attend Evan), `validee` (date), `faite` (preuve notée).

| Spec | Phase | Statut |
|---|---|---|
| [[Core - Appairage QR]] | 1 | validee (2026-10-31) |
| [[Core - Reconnexion]] | 1 | validee (2026-10-31) |
| [[Infos iPhone - Batterie et chaleur]] | 1 | validee (2026-10-31) |
| [[Cam - Flux v1]] | 4 (en avance) | validee (2026-10-31) |
| [[Cam - Webcam Windows et OBS]] | 5 (en avance) | validee (2026-10-31) |
| [[Drop - Photos vers le PC]] | 2 (en avance) | validee (2026-11-01) |
| [[Core - Liaison par cable]] | 1 (avancée de la phase 3) | validee (2026-11-01) |
| `Infos iPhone - Batterie par cable` | 1 | à écrire (après l'essai `idevicediagnostics`, [[ADR-0006 Sante batterie par cable]]) |

Liens : [[00-Accueil]]
