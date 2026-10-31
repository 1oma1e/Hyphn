# PC — Appairage

Ouvert par « + Ajouter » sur [[PC - Accueil]].

```
┌──────────────────────────────────────────────────────────────┐
│ Relier un iPhone                                     [Fermer] │
│                                                              │
│   ┌──────────────────┐   1. Ouvre Hyphn sur l'iPhone          │
│   │ ▓▓ ▓  ▓▓▓ ▓ ▓▓▓ │   2. Touche « Scanner le QR code »     │
│   │ ▓ ▓▓▓ ▓  ▓▓  ▓▓ │   3. Vise ce code                      │
│   │ ▓▓  ▓ ▓▓▓ ▓ ▓ ▓ │                                        │
│   │ ▓ ▓▓  ▓ ▓▓▓▓  ▓ │   Expire dans 1:42   [Nouveau QR]      │
│   └──────────────────┘                                        │
│                                                              │
│   Réseau : Wi-Fi « Maison-5G » · 192.168.1.20                 │
│   Pas de QR possible ? [Saisir le code à la main]             │
└──────────────────────────────────────────────────────────────┘
```

« Saisir le code à la main » : plus tard, pas en phase 1 ([[Core - Appairage QR]]).

Après le scan, le même code à 4 chiffres que sur l'iPhone s'affiche avec « Oui, relier » / « Non » (voir [[iPhone - Scan QR]]).

## Ce que contient le QR
IP et port du PC, empreinte de son certificat, jeton à usage unique (valable 2 minutes), version du protocole. Rien de secret à long terme.

## États
| État | Message |
|---|---|
| Plusieurs cartes réseau | Choix de l'interface (Wi-Fi, Ethernet) ; on ignore les cartes virtuelles (VPN, Docker, Hyper-V) |
| Pare-feu Windows qui bloque | « Windows bloque Hyphn sur ce réseau » + bouton qui ouvre l'autorisation (réseau privé seulement) |
| Réseau public | « Ce réseau est marqué public : passe-le en privé pour relier l'iPhone. » |

Parcours : [[Parcours - Scan QR]] · Index : [[Maquettes - Index]]
