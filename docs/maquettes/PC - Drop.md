# PC — Drop

Recevoir, trier, suivre la progression et retrouver l'historique. Même écran pour le Wi-Fi (via l'app iPhone) et le câble (DCIM, app iPhone fermée).

## Transfert en cours
```
┌───────────┬──────────────────────────────────────────────────┐
│ Hyphn     │ Drop · iPhone d'Evan · Wi-Fi                     │
│           │ ████████████████░░░░░░░░  64 %                   │
│ ▣ Accueil │ 11,8 / 18,4 Go · 812 / 1 240 éléments            │
│ ◉ Cam     │ 38 Mo/s (moyenne 30 s) · reste ≈ 3 min           │
│ ⇅ Drop    │ En cours : IMG_4821.HEIC (iCloud → iPhone…)      │
│ ♥ Pulse   │ [Pause] [Annuler]                                │
│           │──────────────────────────────────────────────────│
│           │ Destination : D:\Photos\iPhone   [Changer]       │
│           │ Rangement : Année / Mois  (date réelle de prise) │
│           │ ▾ 2026                                           │
│           │   ▾ 10-Octobre   412 photos · 38 vidéos · 6,1 Go │
│           │   ▸ 09-Septembre 287 photos · 12 vidéos · 3,4 Go │
│           │ Filtres : [Photos][Vidéos][Captures][Selfies]    │
│ ⚙ Réglages│ [ProRAW][ProRes][Live][Rafales]   Doublons : 23 ⊘ │
└───────────┴──────────────────────────────────────────────────┘
```

## Envoyer vers l'iPhone
Glisser des fichiers sur la fenêtre → choix : **Photos** (photos et vidéos) ou **dossier Hyphn** (visible dans l'app Fichiers de l'iPhone).

## Historique
```
│ Date            Sens   Éléments  Taille   Durée   Vérif. │
│ 29/10 21:14     ← iPh   312      4,2 Go   2 min   ✓ hash │
│ 28/10 18:40     → iPh   3        120 Mo   4 s     ✓ hash │
│ 27/10 23:05     ← câble 1 004    22 Go    7 min   ✓ hash │
```

## États
| État | Ce qui change |
|---|---|
| Coupure Wi-Fi | « En pause : iPhone injoignable. Reprise auto au bloc 2 341. » |
| Hash faux à la fin | Le fichier est renvoyé une fois ; si ça recommence : ligne rouge dans l'historique |
| Doublon (même hash ou même identifiant Photos) | Pas copié, compté dans « Doublons » |
| Disque plein | Pause + « Il manque 2,1 Go sur D: » |

Parcours : [[Parcours - Transfert]] · Index : [[Maquettes - Index]]
