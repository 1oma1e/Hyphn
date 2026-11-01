# Parcours — Liaison par câble

Spec : [[Core - Liaison par cable]]. Brancher remplace le QR et le Wi-Fi ; débrancher revient au Wi-Fi sans geste.

## iPhone déjà relié
```mermaid
sequenceDiagram
  actor E as Evan
  participant P as PC (Hyphn)
  participant U as usbmux (Apple)
  participant I as iPhone (Hyphn)
  E->>I: Branche le câble
  U-->>P: Attached (iPhone 16 Pro Max)
  P->>U: Connect port 47801
  U->>I: Connexion locale (127.0.0.1)
  P->>I: TLS (PC client, iPhone serveur), empreintes vérifiées
  I->>P: Hello
  P-->>I: Welcome
  P->>P: Ferme la liaison Wi-Fi de cet iPhone
  P-->>E: Carte « iPhone d'Evan · Par câble »
  I-->>E: Accueil « Relié · Par câble »
  E->>I: Débranche
  U-->>P: Detached : session fermée
  I->>P: Repart en Wi-Fi (dernière adresse + Bonjour)
  P-->>E: « Wi-Fi »
```

## Premier appairage par câble (sans QR)
```mermaid
flowchart LR
  A[iPhone neuf, écran « Scanner le QR »] --> B[Câble branché]
  B --> C[PC : Connect + TLS, PairRequest sans jeton]
  C --> D[Code à 4 chiffres des deux côtés]
  D --> E{« Oui, relier » sur l'iPhone ?}
  E -- oui --> F[Relié : animation, « Par câble »]
  E -- non ou 2 min --> G[Rien gardé ; pas de nouvelle demande tant que branché]
```

## Écrans touchés
```
iPhone - Scan QR                    iPhone - Accueil
┌──────────────────────────┐        ┌──────────────────────────┐
│ Scanner le QR du PC      │        │ ● Relié à PC-EVAN        │
│ [   viseur caméra    ]   │        │   Par câble   ⌁          │
│ ou branche le câble      │        │ ...                      │
└──────────────────────────┘        └──────────────────────────┘

PC - Accueil (carte iPhone)         PC - Réglages (sans pilote Apple)
┌──────────────────────────┐        ┌──────────────────────────────────┐
│ iPhone d'Evan  ● ⌁ Câble │        │ Câble : installe Apple Devices   │
│ 82 %  · normal · 112 Go  │        │ (Microsoft Store) ou iTunes.     │
└──────────────────────────┘        └──────────────────────────────────┘
```
Le libellé « Par câble » / « Wi-Fi » remplace seulement le petit texte sous le point vert ; rien d'autre ne bouge ([[ADR-0016 Design visuel V2]]).

Écrans : [[iPhone - Scan QR]], [[iPhone - Accueil]], [[PC - Accueil]], [[PC - Reglages]] · Index : [[Maquettes - Index]]
