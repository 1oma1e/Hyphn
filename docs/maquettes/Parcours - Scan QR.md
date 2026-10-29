# Parcours — Scan QR (appairage)

Objectif de la phase 1 : l'iPhone apparaît sur le PC **en moins de 3 s** après le scan, et **sans re-scan** au lancement suivant.

## Premier appairage
```mermaid
sequenceDiagram
  actor E as Evan
  participant P as PC (Hyphn)
  participant I as iPhone (Hyphn)
  E->>P: Clique « + Ajouter »
  P->>P: Crée un jeton à usage unique (2 min)
  P-->>E: Affiche le QR (IP, port, empreinte PC, jeton, version)
  E->>I: Touche « Scanner le QR code »
  I->>I: Lit le QR, demande l'accès réseau local la 1re fois
  I->>P: Connexion TLS, vérifie l'empreinte du PC
  I->>P: Envoie jeton + certificat de l'iPhone
  P-->>E: Code à 4 chiffres
  I-->>E: Même code à 4 chiffres
  E->>I: « Oui, relier »
  P->>P: Garde l'empreinte de l'iPhone
  I->>I: Garde l'empreinte du PC (Keychain)
  P-->>E: Carte « iPhone d'Evan » sur l'Accueil
```

## Les fois suivantes
```mermaid
flowchart LR
  A[Ouverture de Hyphn sur l'iPhone] --> B[Bonjour : cherche les PC connus]
  B --> C{PC trouvé ?}
  C -- oui --> D[TLS + vérification des deux empreintes]
  D --> E[Connecté : point vert des deux côtés]
  C -- non, 10 s --> F[« PC hors ligne » + Réessayer]
  D -- empreinte différente --> G[Refus + « Ce PC a changé, relie-le à nouveau »]
```

Écrans : [[PC - Appairage]], [[iPhone - Scan QR]], [[iPhone - Accueil]] · Index : [[Maquettes - Index]]
