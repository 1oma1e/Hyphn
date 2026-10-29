# Parcours — Stream (Cam)

De « Démarrer » à une caméra visible dans Discord ou OBS, avec la baisse automatique quand l'iPhone chauffe.

```mermaid
flowchart TB
  A[Evan : Démarrer sur l'iPhone ou sur le PC] --> B[iPhone : capture AVFoundation au format choisi]
  B --> C[Encodage matériel HEVC, VideoToolbox temps réel]
  C --> D[Envoi : TCP+TLS en v1, SRT/QUIC en v2]
  D --> E[PC : décodage GPU, sans tampon]
  E --> F[Webcam virtuelle Windows]
  E --> G[Plugin OBS]
  F --> H[Discord, Teams, navigateur]
  B --> I[iPhone passe en écran noir, luminosité au minimum]
```

## Quand ça chauffe ou que le Wi-Fi faiblit
```mermaid
stateDiagram-v2
  [*] --> Demande: réglages d'Evan
  Demande --> Reduit: chaleur serious
  Reduit --> Demande: chaleur fair pendant 2 min
  Reduit --> Minimum: chaleur critical
  Minimum --> Reduit: chaleur serious
  Demande --> DebitBas: Wi-Fi faible
  DebitBas --> Demande: Wi-Fi bon pendant 30 s
  note right of Reduit: 60 → 30 fps, débit −30 %
  note right of Minimum: 1080p30 + alerte PC
```
Les durées (2 min, 30 s) évitent que la qualité monte et descende sans arrêt ; elles seront ajustées après les mesures de la phase 5.

## Arrêts
- Evan touche « Arrêter » (iPhone) ou ■ (PC) → les deux côtés s'arrêtent, la webcam virtuelle affiche une image « Hyphn Cam en pause ».
- Appel téléphonique ou autre app au premier plan → iOS coupe la caméra → le PC affiche « Caméra de l'iPhone interrompue » et reprend seul au retour.

Écrans : [[iPhone - Cam]], [[PC - Cam]] · Index : [[Maquettes - Index]]
