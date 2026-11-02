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
Bouton « Effets » (baguette magique) dans la barre de la Cam : panneau à droite, comme les réglages ([[Cam - Reglages avances]]), avec Filtres (vignettes qui montrent l'image en direct avec le filtre), Masques, Fond, Retouche et « Tout enlever ». Un point vert sur le bouton quand un effet est actif. Codé direct (demande d'Evan, 2026-11-02), pas de maquette.

## Où calculer
Sur la carte graphique du PC, juste après le décodage, avant la fenêtre et la webcam ([[ADR-0034 Ou appliquer les filtres de la Cam]]). L'iPhone ne fait que filmer et envoyer.

## Exigences (à valider)
- **E1 — Filtres** (fait) : 12 looks façon Instagram (Vif, Chaud, Froid, Noir et blanc, Vintage, Film, Pastel, Néon, Ciné, Doux, Dramatique) et leur force.
- **E2 — Fond** (fait) : flou, très flou, 4 fonds dessinés par l'app, ou une image à soi ; détourage MediaPipe (selfie segmenter).
- **E3 — Visage** (fait, v1) : masques Lunettes, Chien (la langue sort quand la bouche s'ouvre), Chat, Couronne, Moustache, Cœurs ; dessinés par l'app, accrochés aux points MediaPipe et tournés avec la tête. Déformations : plus tard.
- **E3b — Retouche** (fait) : peau lisse (yeux et bouche gardés nets), lumière douce.
- **E4 — Animations (v2)** : effets déclenchés par un bouton ou par une expression (sourire, bouche ouverte).
- **E5 — Coût visible** : la latence ajoutée et les images/s s'affichent dans « Infos du flux » ; un effet trop lourd pour le profil choisi est signalé.
- **E6** : carte graphique du PC seulement ([[RULES]], PC) ; rien de plus à faire pour l'iPhone. Si MediaPipe n'a pas de carte graphique, il passe au processeur (plus lent).
- **E7** : la webcam reçoit l'image avec les effets (fait, [[ADR-0034 Ou appliquer les filtres de la Cam]]) ; OBS pas encore.

## Cas limites
- PC sans carte graphique assez forte : l'effet trop lourd est signalé (E5), jamais calculé sur le CPU en silence.
- 4K60 : les effets lourds (fond, visage) peuvent travailler sur une image réduite puis s'appliquer en pleine taille.

## Preuve
Un ami d'Evan voit le flou d'arrière-plan dans Discord ; la latence mesurée ne monte pas de plus de 1 image.

Liens : [[Specs - Index]]
