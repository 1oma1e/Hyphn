---
type: decision
date: 2026-11-02
statut: propose
---
# ADR-0034 Où appliquer les filtres de la Cam

## Contexte
Les filtres et effets ([[Cam - Filtres et effets]]) doivent se voir dans Discord et OBS, sans latence visible et sur la carte graphique ([[RULES]], Énergie 3). Le 2026-10-31, des effets appliqués seulement à l'aperçu du PC ont été retirés : Discord ne les voyait pas ([[IDEES]]).

## Options
| Option | Pour | Contre |
|---|---|---|
| A. **Sur l'iPhone**, avant l'encodage (Core Image / Metal ; Vision et ARKit pour le visage et le détourage) | L'image envoyée a déjà l'effet : fenêtre, webcam et OBS identiques ; puces Apple très rapides ; ARKit pour les masques façon Snapchat | Plus de chaleur et de batterie ; chaque changement passe par le réseau ; ARKit seulement avec la caméra avant |
| B. **Sur le PC**, dans la DLL de la webcam et dans la fenêtre (shaders sur la carte graphique) | iPhone qui ne chauffe pas ; marche avec n'importe quel iPhone ou Android | Deux rendus à écrire (fenêtre et DLL) ; détourage et suivi du visage à refaire sur PC (modèles ML) ; dépend du PC |
| C. Mixte : couleurs et lumière sur l'iPhone, effets lourds sur le PC | Profite des deux | Deux chemins à tenir |

## Décision
Proposé : **A pour la v1** (filtres de base, flou d'arrière-plan avec le détourage de Vision). C'est un seul endroit, et ça marche déjà jusqu'à Discord. On revoit pour les effets visage après une mesure de chaleur et de latence. Android (phase 7) poserait la question à nouveau : à noter.

## Conséquences
- Le filtre passe dans `CamControl` (protocole), et l'iPhone l'applique entre la caméra et VideoToolbox.
- Les mesures de [[Cam - Latence et fluidite]] doivent inclure le coût du filtre.
- Bon choix si le flou d'arrière-plan en 1080p60 n'ajoute pas plus d'une image de latence ni de saccade.

Liens : [[Decisions - Index]]
