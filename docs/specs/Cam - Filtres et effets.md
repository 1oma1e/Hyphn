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

## Où calculer
Sur la carte graphique du PC, juste après le décodage, avant la fenêtre et la webcam ([[ADR-0034 Ou appliquer les filtres de la Cam]]). L'iPhone ne fait que filmer et envoyer.

## Exigences (à valider)
- **E1 — Filtres de base (v1)** : luminosité, contraste, saturation, chaleur, netteté, vignettage, noir et blanc, quelques looks prêts. Chacun réglable et remis à zéro.
- **E2 — Fond (v1)** : flou d'arrière-plan et remplacement par une image, avec le détourage de la personne par un modèle sur la carte graphique du PC (modèle à choisir après recherche de l'existant).
- **E3 — Visage (v2)** : masques, lunettes, chapeaux, déformations, qui suivent le visage. Points du visage trouvés par un modèle sur le PC, dans l'image reçue (avant ou arrière, même chose).
- **E4 — Animations (v2)** : effets déclenchés par un bouton ou par une expression (sourire, bouche ouverte).
- **E5 — Coût visible** : la latence ajoutée et les images/s s'affichent dans « Infos du flux » ; un effet trop lourd pour le profil choisi est signalé.
- **E6** : carte graphique du PC seulement ([[RULES]], PC) ; rien de plus à faire pour l'iPhone.

## Cas limites
- PC sans carte graphique assez forte : l'effet trop lourd est signalé (E5), jamais calculé sur le CPU en silence.
- 4K60 : les effets lourds (fond, visage) peuvent travailler sur une image réduite puis s'appliquer en pleine taille.

## Preuve
Un ami d'Evan voit le flou d'arrière-plan dans Discord ; la latence mesurée ne monte pas de plus de 1 image.

Liens : [[Specs - Index]]
