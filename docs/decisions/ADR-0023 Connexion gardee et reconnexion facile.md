---
type: decision
date: 2026-11-01
statut: accepte
---
# ADR-0023 Connexion gardée et reconnexion facile

## Contexte
Evan, 2026-11-01 : en changeant d'app sur l'iPhone, la liaison se coupait et il « galérait à relier les deux ». Il veut rester connecté tant que l'app n'est pas fermée, l'écran d'attente quand l'image gèle, et un « refresh » des deux côtés. Il veut aussi lire le texte de l'écran d'attente dans son propre aperçu Discord (qui est en miroir). Corrige [[ADR-0015 Lien permanent et connexion au premier plan]] (connexion fermée en arrière-plan) et [[Core - Reconnexion]] E6 et E7.

## Options
| Option | Pour | Contre |
|---|---|---|
| A. Garder la règle « premier plan seulement » | Batterie | Liaison perdue à chaque changement d'app |
| B. Garder la liaison en arrière-plan le temps qu'iOS permet, réessayer seul au premier plan, bouton « Reconnecter » | Ce que veut Evan ; peu de coût (pas de caméra en arrière-plan) | iOS coupe quand même après ~30 s |

## Décision
**B.**
- L'app iPhone en arrière-plan garde la liaison (tâche de fond iOS, ~30 s), puis la ferme proprement. La caméra s'arrête (règle iOS) : le PC et la webcam montrent l'écran d'attente ; aller dans une autre app n'est pas une « Pause ».
- Lien perdu en direct : si l'iPhone revient dans les 5 minutes, « Afficher » reprend tout seul ; après, Cam redémarre en pause ([[ADR-0018 Cam image seule et demarrage en pause]]).
- App ouverte et PC introuvable : nouvel essai toutes les 5 s (plus de « pas d'essai en boucle »).
- « Reconnecter » sur l'iPhone (Accueil, Réglages) et sur le PC (Accueil, Réglages) : le PC coupe la liaison et refait son annonce Bonjour, l'iPhone revient aussitôt.
- ~~La webcam Windows envoie l'écran d'attente **en miroir**~~ : retiré par [[ADR-0024 Ecran d'attente a l'endroit dans la webcam]] (les autres ne pouvaient pas le lire). La vidéo, elle, suit le bouton miroir.

## Conséquences
- Specs [[Core - Reconnexion]] (E6, E7) et [[Cam - Webcam Windows et OBS]] mises à jour.
- À mesurer plus tard : le coût batterie des 30 s en arrière-plan et des essais toutes les 5 s ([[RULES]], Énergie).
