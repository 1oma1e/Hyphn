# iPhone — Scan QR

Ouvert depuis [[iPhone - Accueil]]. La caméra ne sert ici qu'à lire le QR affiché par [[PC - Appairage]].

```
┌──────────────────────────────┐
│ ‹ Retour        Appairage    │
│ ┌──────────────────────────┐ │
│ │                          │ │
│ │    ┌──────────────┐      │ │
│ │    │  (viseur QR) │      │ │
│ │    └──────────────┘      │ │
│ │                          │ │
│ └──────────────────────────┘ │
│ Vise le QR code affiché      │
│ sur ton PC.                  │
│                              │
│ [ Lampe ]                    │
└──────────────────────────────┘
```

Après la lecture :
```
┌──────────────────────────────┐
│        PC-EVAN trouvé        │
│                              │
│ Code de vérification         │
│        4 7 1 9               │
│ Le même code s'affiche sur   │
│ ton PC ?                     │
│                              │
│ [  Oui, relier  ] [ Non ]    │
└──────────────────────────────┘
```
Le code à 4 chiffres est tiré des deux empreintes de certificat : il évite de relier le mauvais PC si quelqu'un affiche un faux QR. (Idée à valider : voir [[IDEES]].)

## États et erreurs
| Cas | Message |
|---|---|
| Accès caméra refusé | « Hyphn a besoin de la caméra pour lire le QR. » + bouton Réglages |
| Accès réseau local refusé | « Autorise le réseau local dans Réglages › Hyphn. » + bouton Réglages |
| QR d'une autre app | « Ce QR code ne vient pas de Hyphn. » |
| QR expiré (jeton déjà utilisé ou > 1 min) | « Ce QR a expiré. Clique “Nouveau QR” sur le PC. » |
| PC injoignable | « PC trouvé mais injoignable. Vérifie que les deux sont sur le même Wi-Fi. » |

Parcours complet : [[Parcours - Scan QR]] · Index : [[Maquettes - Index]]
