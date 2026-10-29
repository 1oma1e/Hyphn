# Parcours — Transfert (Drop)

Deux chemins, un seul écran PC : [[PC - Drop]].

## Par Wi-Fi (app iPhone ouverte)
```mermaid
sequenceDiagram
  participant I as iPhone
  participant P as PC
  I->>P: Liste : identifiants Photos + tailles
  P-->>I: Ce qui manque (doublons retirés)
  loop chaque fichier
    I->>I: Original sur iCloud ? le télécharger d'abord
    loop blocs de 4 à 8 Mo
      I->>P: Bloc (position, données)
      P-->>I: Position confirmée
    end
    I->>P: Fin + hash
    P->>P: Vérifie le hash, range en Année/Mois (date EXIF)
  end
  P-->>I: Terminé : n éléments, taille, durée
```

## Coupure et reprise
```mermaid
flowchart LR
  A[Envoi en cours] -->|Wi-Fi coupé| B[Pause des deux côtés]
  B -->|iPhone revient| C[iPhone demande : où en es-tu ?]
  C --> D[PC répond : dernier octet reçu]
  D --> E[Reprise au bloc suivant, rien n'est renvoyé]
```
Preuve de la phase 3 : couper le Wi-Fi en plein transfert, reprendre, et vérifier dans les journaux qu'aucun bloc déjà reçu n'a été renvoyé.

## Par câble (app iPhone fermée)
```mermaid
flowchart LR
  A[iPhone branché, « Faire confiance » accepté] --> B[PC : libimobiledevice, service AFC]
  B --> C[Lit DCIM seulement]
  C --> D[Même tri, même anti-doublon, même historique]
```
Limite : par câble on n'a que DCIM (pas les albums, pas les originaux modifiés de Photos) ; l'écran le dit.

Écrans : [[iPhone - Drop]], [[PC - Drop]] · Index : [[Maquettes - Index]]
