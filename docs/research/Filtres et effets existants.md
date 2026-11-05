---
type: recherche
date: 2026-11-02
---
# Filtres et effets existants

Où trouver des filtres déjà faits pour la Cam ([[Cam - Filtres et effets]]), et comment ils s'intègrent dans Hyphn. Tout tourne dans la fenêtre PC, puis part vers la webcam ([[ADR-0034 Ou appliquer les filtres de la Cam]]).

## Déjà dans Hyphn
| Source | Licence | Pour quoi | Où |
|---|---|---|---|
| MediaPipe Tasks Vision (Google) | Apache-2.0 | Points du visage, détourage (modèle paysage 16:9) | `ui/vendor/mediapipe` |
| Fluent Emoji 3D (Microsoft) | MIT | Les 112 effets « Emojis » | `ui/vendor/fluent` |
| Looks cinéma faits par nous | Aucune (notre code) | 46 filtres par table de couleurs (LUT) en WebGL | `ui/fxlook.js` |
| [Poly Pizza](https://poly.pizza) (Poly by Google, J-Toastie, Quaternius, iPoly3D…) | CC-BY 3.0 ou CC0, lue modèle par modèle | 27 objets 3D de l'onglet « 3D » (chapeaux, casques, lunettes, oreilles) | `ui/vendor/models3d/poly` |
| Photos Wikimedia Commons (Unsplash CC0, NASA, LoC) | CC0 / domaine public | Les 10 décors de fond | `ui/vendor/backgrounds` |
| Recettes CSSgram (filtres Instagram en CSS) | MIT | Idée des 12 filtres couleur | `ui/fx.js` |

## À consulter : filtres visage prêts
| Source | Licence | Ce qu'il y a | Intégration dans Hyphn |
|---|---|---|---|
| [Jeeliz FaceFilter](https://github.com/jeeliz/jeelizFaceFilter) | Apache-2.0 (code) ; modèles 3D des démos : licences variées, à vérifier une par une | Démos de masques 3D (chien, chapeaux, maquillage, Halloween…) avec three.js | Moyenne : son propre suivi du visage ; ou garder MediaPipe et reprendre seulement les modèles 3D |
| [WebAR.rocks.face](https://github.com/WebAR-rocks/WebAR.rocks.face) | Code ouvert, licence à lire dans le dépôt | Lunettes, casques, masques 3D, maquillage | Comme Jeeliz |
| [MindAR](https://github.com/hiukim/mind-ar-js) | MIT | Suivi du visage + three.js, exemples chapeaux et lunettes | Facile côté rendu : un canvas WebGL dessiné dans notre image |
| [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) | Apache-2.0 | Maillage 3D du visage (468 points + carte UV) : peintures et textures sur le visage | Facile : déjà dans l'app ; il manque un rendu WebGL du maillage texturé |
| [Snap Camera Kit (web)](https://developers.snap.com/camera-kit/home) | Propriétaire (compte Snap développeur, conditions d'usage) | Les « lenses » de Snapchat | Essayé puis retiré ([[ADR-0038 Retrait des filtres Snap]]) : seulement ses démos et nos propres filtres, filigrane, serveurs de Snap |
| [DeepAR](https://www.deepar.ai) | Propriétaire (offre gratuite limitée, clé de licence) | Grand catalogue d'effets visage | Difficile : clé, filigrane selon l'offre |

## À consulter : images et objets 3D pour en faire d'autres
| Source | Licence | Ce qu'il y a |
|---|---|---|
| [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) | MIT | Plus de 1 500 emojis en 3D, couleur, à plat |
| [OpenMoji](https://openmoji.org) | CC BY-SA 4.0 (citer, partager pareil) | 4 000 emojis dessinés, dont des accessoires |
| [Twemoji](https://github.com/jdecked/twemoji) | CC-BY 4.0 (citer) | Emojis de Twitter |
| [Sketchfab](https://sketchfab.com) (filtre « Downloadable », licence CC) | Selon le modèle (souvent CC-BY) | Chapeaux, lunettes, masques 3D pour three.js |
| [Poly Haven](https://polyhaven.com) | CC0 | Textures et décors 360° |

## À consulter : filtres couleur
| Source | Licence | Ce qu'il y a |
|---|---|---|
| [CSSgram](https://github.com/una/CSSgram) | MIT | Recettes des filtres Instagram |
| [glfx.js](https://github.com/evanw/glfx.js) | MIT | Effets WebGL : netteté, vignette, débruitage (peau lisse) |
| Fichiers LUT (.cube) gratuits | Variable selon le site | Looks cinéma ; il faudrait un petit rendu WebGL qui applique une LUT |

## Licences vérifiées (2026-11-02, sur les dépôts)
- **MindAR** : MIT. Ses modèles d'exemple : lunettes, chapeau de clown, boucle d'oreille en CC-BY-4.0 (repris, crédités) ; casquette de Mario (marque Nintendo), deuxième paire de lunettes (sans licence), masque et tête de Spark AR (licence Facebook réservée à ses services) : écartés.
- **Jeeliz FaceFilter** : Apache-2.0 (code) ; modèles des démos à vérifier un par un.
- **WebAR.rocks.face** : MIT pour `dist`, `helpers`, `neuralNets`… ; démos de sources tierces.
- MindAR n'est pas repris tel quel : il ouvre la webcam lui-même et charge MediaPipe depuis internet. Hyphn reprend sa méthode (MediaPipe déjà là + three.js) dans `ui/fx3d.js`.

## Pour un maximum de filtres (2026-11-04)
Licences lues sur les dépôts ou les fiches officielles le 2026-11-04, sauf « à vérifier ».

| Famille | Source | Licence | Combien |
|---|---|---|---|
| Maquillage, peinture | Maillage et carte UV de MediaPipe (`canonical_face_model.obj`) ; [FaceMeshFaceGeometry](https://github.com/spite/FaceMeshFaceGeometry) (géométrie three.js du maillage, UV fixes) | Apache-2.0 ; MIT | Autant qu'on en dessine : textures faites par nous |
| Déformations | Les 478 points de MediaPipe, déformation WebGL écrite par nous | Apache-2.0 | Quelques préréglages |
| Cheveux | [Hair Segmenter](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter) de MediaPipe (fiche du modèle lue) | Apache-2.0 | Une couleur au choix, arc-en-ciel |
| Effets qui réagissent | Les 52 expressions de MediaPipe (`outputFaceBlendshapes` : sourire, bouche, clignement) ; [canvas-confetti](https://github.com/catdad/canvas-confetti) | Apache-2.0 ; ISC | Quelques-uns |
| Emojis | [Fluent Emoji](https://github.com/microsoft/fluentui-emoji), déjà dans l'app | MIT | Plus de 1 500 disponibles (26 utilisés) |
| Masques 3D | [Quaternius](https://quaternius.com), [Poly Pizza](https://poly.pizza) (ex. couronne de Quaternius) | CC0 ou CC-BY selon le modèle : à vérifier un par un | Des dizaines de chapeaux, couronnes, casques |
| Fonds animés | Faits par nous (dessin animé en WebGL : aurore, néons, étoiles, pluie…) ; vidéos [Coverr](https://coverr.co), [Mixkit](https://mixkit.co), [Pixabay](https://pixabay.com/videos/) | Les nôtres : aucune ; les vidéos : licence maison, à lire avant d'en mettre dans l'app | À volonté pour les nôtres |
| Looks cinéma | [Film-Luts](https://github.com/YahiaAngelo/Film-Luts) (LUT de G'MIC) ; looks calculés par nous | MIT déclaré, mais l'origine G'MIC est à vérifier ; les nôtres : aucune | Des dizaines |

## Packs de vrais filtres 3D (2026-11-05)
Recherche demandée par Evan (GitHub et banques de modèles). Ce qui a été lu :
- **Poly Pizza** : des milliers de modèles bas poly, **téléchargeables sans compte** (`static.poly.pizza/<id>.glb`), licence affichée sur chaque page (CC-BY 3.0 pour les anciens modèles « Poly by Google », CC0 pour Quaternius et iPoly3D). Packs utiles : « Cosmetic Pack One » et « Two » de J-Toastie (chapeaux, lunettes, CC-BY). **Retenu** : 27 modèles.
- **Sketchfab** : beaucoup de chapeaux et masques CC-BY, mais le téléchargement demande un compte (à faire par Evan) : pas utilisé.
- **Khronos glTF Sample Assets** : « Flight Helmet » (CC0) et « Sunglasses Khronos » (CC-BY 4.0) de très belle qualité, mais 30 à 40 Mo de textures et un pied d'exposition sous le casque : écartés.
- **Jeeliz FaceFilter**, **WebAR.rocks.face** : code libre, mais les modèles des démos ont des licences à vérifier une par une : pas repris.
- **needle-engine/facefilter** : bibliothèque de filtres (masques texturés sur le visage, modèles 3D) liée au moteur Needle ; ses textures d'exemple viennent de leur serveur, licence non écrite : pas repris.
- **MediaPipe** (Apache-2.0) : son exemple « face effect » a une texture de peinture du visage alignée sur sa carte UV (`facepaint.pngblob`), utile plus tard pour E8 (maquillage).
- Listes de sources CC0 : [awesome-cc0](https://github.com/madjin/awesome-cc0) (Kenney, Quaternius, Poly Haven…), [OpenSource3DAssets](https://github.com/toxsam/os3a-gallery).

## Conclusion
Pour des masques 3D façon Snapchat sans rien envoyer dehors : garder MediaPipe (déjà là), ajouter three.js (MIT) pour dessiner des modèles 3D accrochés à la matrice du visage, et prendre les modèles 3D sur Sketchfab (CC-BY, à citer) ou ceux des démos Jeeliz quand leur licence le permet. Snap Camera Kit et DeepAR sont écartés : compte, clé ou serveurs extérieurs.

Liens : [[SOURCES]], [[Cam - Filtres et effets]]
