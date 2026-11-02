---
type: spec
phase: 5 (en avance)
statut: brouillon
---
# Cam — Filtres et effets

## But
Des filtres simples d'abord (couleur, lumière, flou d'arrière-plan), puis des effets amusants façon Snapchat (masques sur le visage, animations), visibles **jusque dans Discord et OBS**, sans ajouter de latence visible.

## Hors périmètre
- Montage, enregistrement.
- Effets qui demandent internet ou un compte.

## Parcours
Maquette à faire : une rangée de vignettes sur l'image en direct, comme les réglages avancés ([[Cam - Reglages avances]]).

## Où calculer (à trancher)
[[ADR-0034 Ou appliquer les filtres de la Cam]] : sur l'iPhone avant l'encodage, ou sur la carte graphique du PC. Ancienne idée « effets dans la DLL » : [[IDEES]].

## Exigences (à valider)
- **E1 — Filtres de base (v1)** : luminosité, contraste, saturation, chaleur, netteté, vignettage, noir et blanc, quelques looks prêts. Chacun réglable et remis à zéro.
- **E2 — Fond (v1)** : flou d'arrière-plan et remplacement par une image, avec le détourage de la personne (Vision sur l'iPhone, ou modèle sur le PC selon l'ADR).
- **E3 — Visage (v2)** : masques, lunettes, chapeaux, déformations, qui suivent le visage. Sur iPhone, ARKit suit le visage (caméra avant TrueDepth) ; Vision donne des points du visage avec la caméra arrière.
- **E4 — Animations (v2)** : effets déclenchés par un bouton ou par une expression (sourire, bouche ouverte).
- **E5 — Coût visible** : la latence ajoutée et les images/s s'affichent dans « Infos du flux » ; un effet trop lourd pour le profil choisi est signalé.
- **E6** : carte graphique seulement ([[RULES]], Énergie 3).

## Cas limites
- Caméra arrière (la meilleure image) : pas de TrueDepth, donc moins d'effets visage.
- iPhone chaud : les effets lourds se coupent seulement en profil Économie.

## Preuve
Un ami d'Evan voit le flou d'arrière-plan dans Discord ; la latence mesurée ne monte pas de plus de 1 image.

Liens : [[Specs - Index]]
