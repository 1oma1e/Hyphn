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
Bouton « Effets » (baguette magique) dans la barre de la Cam : panneau à droite, comme les réglages ([[Cam - Reglages avances]]). Un point vert sur le bouton quand un effet est actif. Codé direct (demande d'Evan, 2026-11-02), pas de maquette.

Panneau refait le 2026-11-05 (demande d'Evan : « plus clean, menus déroulants »), de haut en bas :
- **Recherche** dans tout à la fois (filtres, emojis, 3D, fonds), sans tenir compte des accents ; un effet sort si son nom contient le mot ou si sa famille commence par ce mot.
- **5 onglets** : Filtres, Emojis, 3D, Fond, Retouche ; un point orange sur l'onglet qui a un effet en cours.
- **Effets en cours** en pastilles : un clic retire celui-là seulement ; « Tout enlever » à côté.
- **Familles qui se plient** (menus déroulants animés), avec leur nombre d'effets et le nom de celui qui est choisi. Ouvertes au départ : celle de l'effet en cours, sinon la première. Les vignettes des familles pliées ne sont pas calculées.
- En haut de chaque onglet : **Favoris** (l'étoile sur une vignette) et **Récents** (8 derniers choisis), gardés dans les réglages.
- Recliquer sur l'effet choisi l'enlève.

## Où calculer
Sur la carte graphique du PC, juste après le décodage, avant la fenêtre et la webcam ([[ADR-0034 Ou appliquer les filtres de la Cam]]). L'iPhone ne fait que filmer et envoyer.

## Exigences (à valider)
- **E1 — Filtres** (fait) : 12 looks façon Instagram (Vif, Chaud, Froid, Noir et blanc, Vintage, Film, Pastel, Néon, Ciné, Doux, Dramatique) et leur force.
- **E2 — Fond** (fait) : flou, très flou, 10 vraies photos de décors (salon, bureau, bibliothèque, cuisine, salle de lecture, plage, montagne, aurore, ville la nuit, espace ; CC0 ou domaine public, crédits dans `ui/vendor/backgrounds/CREDITS.txt`), ou une image à soi ; détourage MediaPipe (modèle paysage 16:9, masque lissé d'une image à l'autre). Bords des cheveux et du casque encore imparfaits (capture d'Evan, 2026-11-02).
- **E3 — Visage** (fait, v1), catégorie « Emojis » (112 depuis E12) : 26 effets faits avec les Fluent Emoji 3D de Microsoft (MIT, `ui/vendor/fluent`), demande d'Evan de partir d'une base existante : lunettes, couronne, chapeaux, fleurs, papillons, cœurs, étoiles, feu, arc-en-ciel (sort quand la bouche s'ouvre), fête, neige, musique, bisous, et des têtes entières (chien, chat, panda, renard, tigre, licorne, robot, extraterrestre, clown, squelette, fantômes). Accrochés aux points MediaPipe, tournés avec la tête. Plus 4 masques **3D** à la façon de MindAR (MIT) : MediaPipe donne la position de la tête, three.js (MIT) dessine les modèles 3D CC-BY des exemples de MindAR (lunettes, chapeau de clown, boucles d'oreilles ; crédits dans `ui/vendor/models3d/CREDITS.txt`), et une tête invisible cache ce qui passe derrière. Vérifiés sur une photo de visage (page d'essai). Déformations : plus tard.
- **E3c — Filtres Snap** : essayés puis retirés ([[ADR-0038 Retrait des filtres Snap]]).
- **E3b — Retouche** (fait) : peau lisse (yeux et bouche gardés nets), lumière douce.
- **E4 — Animations (v2)** : effets déclenchés par un bouton ou par une expression (sourire, bouche ouverte).
- **E5 — Coût visible** : la latence ajoutée et les images/s s'affichent dans « Infos du flux » ; un effet trop lourd pour le profil choisi est signalé.
- **E6** : carte graphique du PC seulement ([[RULES]], PC) ; rien de plus à faire pour l'iPhone. Si MediaPipe n'a pas de carte graphique, il passe au processeur (plus lent).
- **E7** : la webcam reçoit l'image avec les effets (fait, [[ADR-0034 Ou appliquer les filtres de la Cam]]) ; OBS pas encore.

### Un maximum de filtres, tous en local (demande d'Evan, 2026-11-04, à valider)
Sources et licences : [[Filtres et effets existants]], partie « Pour un maximum de filtres ». Chaque famille est une catégorie du panneau Effets, avec ses vignettes en direct.
- **E8 — Maquillage et peinture** (~20) : rouge à lèvres et fard en plusieurs couleurs, taches de rousseur, paillettes, peintures (guerre, tête de mort, tigre, chat, clown, super-héros, drapeaux). Textures dessinées par nous sur la carte UV de MediaPipe, posées sur le maillage du visage avec three.js.
- **E9 — Déformations** (~8) : gros yeux, petite bouche, grosse tête, tête d'extraterrestre, visage étiré, miroir déformant.
- **E10 — Cheveux** (~10) : teinture rose, bleu, violet, vert, blond, roux, blanc, arc-en-ciel (Hair Segmenter de MediaPipe).
- **E11 — Effets qui réagissent** (~8) : cœurs si tu souris, confettis si tu ouvres la bouche, éclair si tu clignes des yeux, étoiles si tu lèves les sourcils… (expressions de MediaPipe, canvas-confetti). Remplace E4.
- **E12 — Plus d'emojis** (fait, 2026-11-04) : 26 → 112, rangés en 9 familles dans le panneau (lunettes et chapeaux, nez et bouche, au-dessus de la tête, autour de toi, pluies et fêtes, têtes d'animaux, de smileys, monstres, 3D). Nouveau mouvement « monte » (ballons, bulles). Fluent Emoji (MIT) ; deux chapeaux absents du dépôt de Microsoft sous ce nom, laissés de côté. Vérifiés sur une photo de visage (page d'essai) ; ceux qui sortent de la bouche ouverte : non vérifiés.
- **E13 — Plus de masques 3D** (fait, 2026-11-05) : 4 → 31, dans l'onglet « 3D » en 4 familles (chapeaux, casques et couronnes, lunettes et visage, oreilles et bijoux). 27 vrais modèles de Poly Pizza (téléchargement sans compte), licence lue sur la page de chaque modèle : CC-BY 3.0 (Poly by Google, J-Toastie, jeremy, Michael Fuchs) ou CC0 (Quaternius, iPoly3D), crédités dans `ui/vendor/models3d/CREDITS.txt` et dans Réglages. Chaque modèle est tourné vers la caméra, posé par son bas (chapeaux) ou par sa face avant (lunettes), et réglé à l'œil sur une photo de visage (page d'essai). Écartés après essai : casque audio, masque à gaz, masque de clown, lunettes cœur, casque d'astronaute, chapeau pizza (mal tournés ou trop gros). Les 2 textures intégrées aux `.glb` sont sorties en fichiers à côté : la règle de sécurité de l'app (CSP) bloque les images `blob:` et n'a pas été changée. Un emoji et un objet 3D ne se combinent pas (un seul « masque »). Non vérifié : sur un vrai visage qui bouge, dans Discord.
- **E14 — Fonds animés** (~10) : dessinés en direct par nous (aurore, néons, étoiles, pluie, neige, bulles, vagues…), pas de vidéo à licence douteuse.
- **E15 — Looks cinéma** (fait, 2026-11-04) : 12 → 58 filtres. 46 looks calculés par nous (`ui/fxlook.js`), en 5 familles (cinéma, pellicules, saisons et lumières, noir et blanc, couleurs folles) : chacun devient une fois une table de couleurs 32×32×32 (~30 ms), puis la carte graphique l'applique en WebGL (coût mesuré : aucun écart visible avec « Original », page d'essai). Même curseur de force. Film-Luts n'est pas repris : origine non confirmée.
- Ordre proposé : E12 et E15 (le plus de filtres pour le moins de code), puis E8, E11, E10, E9, E13, E14. E13 fait avant les autres (demande d'Evan, 2026-11-05).

## Cas limites
- PC sans carte graphique assez forte : l'effet trop lourd est signalé (E5), jamais calculé sur le CPU en silence.
- 4K60 : les effets lourds (fond, visage) peuvent travailler sur une image réduite puis s'appliquer en pleine taille.

## Preuve
Un ami d'Evan voit le flou d'arrière-plan dans Discord ; la latence mesurée ne monte pas de plus de 1 image.

Sources de filtres déjà faits : [[Filtres et effets existants]].

Liens : [[Specs - Index]]
