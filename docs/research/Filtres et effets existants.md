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
| Fluent Emoji 3D (Microsoft) | MIT | Les 26 effets « Emojis » | `ui/vendor/fluent` |
| Photos Wikimedia Commons (Unsplash CC0, NASA, LoC) | CC0 / domaine public | Les 10 décors de fond | `ui/vendor/backgrounds` |
| Recettes CSSgram (filtres Instagram en CSS) | MIT | Idée des 12 filtres couleur | `ui/fx.js` |

## À consulter : filtres visage prêts
| Source | Licence | Ce qu'il y a | Intégration dans Hyphn |
|---|---|---|---|
| [Jeeliz FaceFilter](https://github.com/jeeliz/jeelizFaceFilter) | Apache-2.0 (code) ; modèles 3D des démos : licences variées, à vérifier une par une | Démos de masques 3D (chien, chapeaux, maquillage, Halloween…) avec three.js | Moyenne : son propre suivi du visage ; ou garder MediaPipe et reprendre seulement les modèles 3D |
| [WebAR.rocks.face](https://github.com/WebAR-rocks/WebAR.rocks.face) | Code ouvert, licence à lire dans le dépôt | Lunettes, casques, masques 3D, maquillage | Comme Jeeliz |
| [MindAR](https://github.com/hiukim/mind-ar-js) | MIT | Suivi du visage + three.js, exemples chapeaux et lunettes | Facile côté rendu : un canvas WebGL dessiné dans notre image |
| [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) | Apache-2.0 | Maillage 3D du visage (468 points + carte UV) : peintures et textures sur le visage | Facile : déjà dans l'app ; il manque un rendu WebGL du maillage texturé |
| [Snap Camera Kit (web)](https://developers.snap.com/camera-kit/home) | Propriétaire (compte Snap développeur, conditions d'usage) | Les « lenses » de Snapchat | Difficile : passe par les serveurs de Snap (contraire à « rien ne sort ») |
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

## Conclusion
Pour des masques 3D façon Snapchat sans rien envoyer dehors : garder MediaPipe (déjà là), ajouter three.js (MIT) pour dessiner des modèles 3D accrochés à la matrice du visage, et prendre les modèles 3D sur Sketchfab (CC-BY, à citer) ou ceux des démos Jeeliz quand leur licence le permet. Snap Camera Kit et DeepAR sont écartés : compte, clé ou serveurs extérieurs.

Liens : [[SOURCES]], [[Cam - Filtres et effets]]
