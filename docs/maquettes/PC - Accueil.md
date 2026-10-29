# PC — Accueil

Fenêtre principale de l'app Tauri. Menu à gauche, contenu à droite. L'app vit aussi dans la zone de notification (icône près de l'horloge).

```
┌───────────┬──────────────────────────────────────────────────┐
│ Hyphn     │ Appareils                         [+ Ajouter]    │
│           │                                                  │
│ ▣ Accueil │ ┌──────────────────────────────────────────────┐ │
│ ◉ Cam     │ │ iPhone d'Evan · iPhone 16 Pro · iOS 26.1     │ │
│ ⇅ Drop    │ │ ● Wi-Fi · 4 ms · 82 % · normal · 41 Go libres │ │
│ ♥ Pulse   │ │ [Démarrer Cam] [Recevoir] [Voir Pulse]        │ │
│           │ └──────────────────────────────────────────────┘ │
│           │                                                  │
│           │ Activité récente                                 │
│           │ · Hier 21:14 — 312 photos reçues (4,2 Go)        │
│           │ · Hier 20:02 — Cam 1 h 12 min, 4K30, 0 coupure   │
│ ⚙ Réglages│                                                  │
└───────────┴──────────────────────────────────────────────────┘
```

## États
| État | Ce qui change |
|---|---|
| Aucun appareil | Grand bouton « Relier un iPhone » → [[PC - Appairage]] |
| iPhone hors ligne | Carte grisée « Vu il y a 2 h » ; si un câble est branché : « Câble : DCIM et batterie disponibles » |
| Câble seul (app iPhone fermée) | Carte « iPhone par câble » : Drop (DCIM) et santé batterie seulement |

Écrans : [[PC - Cam]], [[PC - Drop]], [[PC - Pulse]], [[PC - Reglages]] · Index : [[Maquettes - Index]]
