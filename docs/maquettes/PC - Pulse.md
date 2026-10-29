# PC — Pulse

Tableau de bord de l'iPhone. Les données arrivent par **événements** (jamais de relevé en boucle) : la page se met à jour quand l'iPhone signale un changement.

```
┌───────────┬──────────────────────────────────────────────────┐
│ Hyphn     │ Pulse · iPhone d'Evan        Mis à jour 21:14:03 │
│           │ ┌────────────┐ ┌────────────┐ ┌────────────┐     │
│ ▣ Accueil │ │ Batterie   │ │ Chaleur    │ │ Stockage   │     │
│ ◉ Cam     │ │ 82 % ⚡    │ │ normal     │ │ 41 / 256 Go│     │
│ ⇅ Drop    │ │ Éco : non  │ │            │ │ libres     │     │
│ ♥ Pulse   │ └────────────┘ └────────────┘ └────────────┘     │
│           │ ┌────────────────────────────────────────────┐   │
│           │ │ Réseau : Wi-Fi · latence 4 ms · 412 Mb/s*  │   │
│           │ │ Modèle : iPhone 16 Pro · iOS 26.1          │   │
│           │ └────────────────────────────────────────────┘   │
│           │ Batterie (câble)            lu le 29/10 20:55    │
│           │ Cycles 412 · Pleine charge 3 102 / 3 582 mAh     │
│           │ (capacité de conception) — pas un « % santé »    │
│           │ Historique 24 h : batterie ▁▂▃▅▆▇█▇▆ chaleur ▁▁▂▁ │
│ ⚙ Réglages│ Alerte si < 15 % sans charge  [✓]                │
└───────────┴──────────────────────────────────────────────────┘
```
`*` débit mesuré par Hyphn pendant un transfert ou un test, sinon « — ».

## États
| État | Ce qui change |
|---|---|
| Pas de câble | Bloc « Batterie (câble) » : « Branche l'iPhone pour lire les cycles. » |
| Valeurs câble introuvables (iOS trop récent) | « Non disponible sur iOS 26.x » (voir [[ADR-0006 Sante batterie par cable]]) |
| iPhone hors ligne | Dernières valeurs grisées + « Vu il y a 2 h » |
| < 15 % sans charge | Notification Windows + bandeau rouge |

Index : [[Maquettes - Index]]
