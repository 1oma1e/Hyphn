---
type: decision
date: 2026-10-31
statut: accepte
---
# ADR-0018 Cam : image seule, démarrage en pause, aperçu plein écran

## Contexte
Le [[CAHIER]] (figé) prévoit le micro de l'iPhone dans les réglages (section Cam) et « pas d'aperçu sur l'iPhone pendant le stream » ; [[RULES]] prévoit un tampon audio réglable et l'Énergie 8 (pas d'aperçu). En relisant les maquettes, Evan (2026-10-31) a choisi autrement.

## Options
| Option | Pour | Contre |
|---|---|---|
| Garder le cahier (son, pas d'aperçu, démarrage direct) | Moins d'écran allumé | L'iPhone ne montre rien ; l'image part tout de suite chez Discord |
| Choix d'Evan (image seule, aperçu, démarrage en pause) | On voit son cadrage ; rien n'est montré sans le vouloir ; moins de code (pas d'audio) | L'aperçu consomme de la batterie |

## Décision
Choix d'Evan :
- **Image seule** : Hyphn n'envoie jamais de son. Plus de micro dans l'app ni de tampon audio.
- **Démarrage en pause** : toucher Cam lance le flux tout de suite, sans avertissement, **en pause**. Le PC, la webcam et OBS montrent un écran d'attente animé (« Je reviens bientôt » en plusieurs langues, message personnalisable plus tard). « Afficher la caméra » envoie l'image ; « Pause » remet l'écran d'attente.
- **iPhone** : aperçu plein écran, avec quelques boutons (retourner la caméra, objectifs, qualité = résolution et images/s seulement, pause, écran noir), plus l'indicateur d'envoi et le débit réseau. Tout le reste se règle sur le PC.
- **Écran noir** : l'écran s'éteint comme en veille, la vidéo continue d'être envoyée. Automatique après 30 s sans toucher l'écran, activé par défaut (proposé pour tenir le budget énergie ; Evan peut le changer).
- **Effets** (flou d'arrière-plan, lumière, filtres, cadrage auto) : calculés par la carte graphique du PC, jamais sur l'iPhone ([[RULES]], Énergie 3).

## Conséquences
- Corrige le [[CAHIER]] (micro de la liste des réglages Cam ; « pas d'aperçu pendant le stream »).
- [[RULES]] : Énergie 8 réécrite, « tampon audio » retiré ; [[ARCHITECTURE]] mise à jour.
- Bon choix si la mesure de budget de la phase 4 (Cam 30 min) reste correcte avec l'écran noir automatique.
