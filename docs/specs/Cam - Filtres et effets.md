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
- **E2 — Fond** (fait) : flou, très flou, 10 vraies photos de décors (salon, bureau, bibliothèque, cuisine, salle de lecture, plage, montagne, aurore, ville la nuit, espace ; CC0 ou domaine public, crédits dans `ui/vendor/backgrounds/CREDITS.txt`), ou une image à soi ; détourage MediaPipe (modèle paysage 16:9, masque lissé d'une image à l'autre). Bords des cheveux et du casque encore imparfaits (capture d'Evan, 2026-11-02).
- **E3 — Visage** (fait, v1), catégorie « Emojis » : 26 effets faits avec les Fluent Emoji 3D de Microsoft (MIT, `ui/vendor/fluent`), demande d'Evan de partir d'une base existante : lunettes, couronne, chapeaux, fleurs, papillons, cœurs, étoiles, feu, arc-en-ciel (sort quand la bouche s'ouvre), fête, neige, musique, bisous, et des têtes entières (chien, chat, panda, renard, tigre, licorne, robot, extraterrestre, clown, squelette, fantômes). Accrochés aux points MediaPipe, tournés avec la tête. Plus 4 masques **3D** à la façon de MindAR (MIT) : MediaPipe donne la position de la tête, three.js (MIT) dessine les modèles 3D CC-BY des exemples de MindAR (lunettes, chapeau de clown, boucles d'oreilles ; crédits dans `ui/vendor/models3d/CREDITS.txt`), et une tête invisible cache ce qui passe derrière. Vérifiés sur une photo de visage (page d'essai). Déformations : plus tard.
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

Sources de filtres déjà faits : [[Filtres et effets existants]].

Liens : [[Specs - Index]]
