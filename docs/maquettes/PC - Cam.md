# PC — Cam

Tous les réglages de la caméra de l'iPhone, l'aperçu et la télémétrie en direct.

```
┌───────────┬──────────────────────────────────────────────────┐
│ Hyphn     │ Cam · iPhone d'Evan            ● EN DIRECT [■]   │
│           │ ┌──────────────────────────────┐ Télémétrie      │
│ ▣ Accueil │ │                              │ 4K30 · HEVC     │
│ ◉ Cam     │ │         (aperçu vidéo)       │ 31,8 Mb/s       │
│ ⇅ Drop    │ │                              │ 29,9 fps réels  │
│ ♥ Pulse   │ │                              │ Latence 78 ms   │
│           │ └──────────────────────────────┘ Pertes 0        │
│           │ Sorties : [✓] Webcam Windows  [✓] OBS            │
│           │                                  iPhone          │
│           │ Image                            82 % ⚡ en charge │
│           │ Objectif   [0,5×] [1×] [3×]      Chaleur : normal│
│           │ Résolution [4K ▾] fps [30 ▾]                     │
│           │ Codec [HEVC ▾] Débit [Auto ▾]                    │
│           │ ▸ Mise au point, exposition, ISO, balance        │
│           │ ▸ Zoom, stabilisation, miroir, lampe, HDR        │
│           │ ▸ Son : micro de l'iPhone                        │
│ ⚙ Réglages│ Profils : [Appel] [Stream] [Cours] [+ Enregistrer]│
└───────────┴──────────────────────────────────────────────────┘
```
iOS ne donne pas de température en degrés à une app, seulement un **état thermique** (nominal, fair, serious, critical) : c'est ce qu'on affiche, jamais un chiffre en °C (voir [[Points a tester]]).

## Adaptation automatique (visible ici)
| Chaleur iPhone | Ce que fait Hyphn | Ce qu'affiche le PC |
|---|---|---|
| normal / fair | Réglages demandés | rien |
| serious | 60 → 30 fps, débit −30 % | Bandeau orange « iPhone chaud : 30 fps » |
| critical | 1080p30 | Bandeau rouge + notification Windows |
| Wi-Fi faible | Débit baissé puis résolution | « Wi-Fi faible : 1080p » |

Parcours : [[Parcours - Stream]] · Index : [[Maquettes - Index]]
