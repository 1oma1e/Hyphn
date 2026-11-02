---
type: spec
phase: 5 (en avance)
statut: brouillon
---
# Cam — Écrans d'attente

## But
L'utilisateur écrit son message une fois, et Hyphn le traduit tout seul dans toutes les langues de l'écran d'attente. Il choisit son écran parmi ceux de l'app, ou importe le sien depuis le PC.

## Hors périmètre
- Traduction par un service en ligne : Hyphn reste sans cloud ([[ADR-0033 Traduction locale du message d'attente]]).
- Boutique ou partage d'écrans entre utilisateurs.

## Parcours
Réglages › Écran d'attente (existe déjà : message, « Dans toutes les langues », style Animé / Minimal). Maquette à faire : galerie de vignettes et bouton « Importer ».

## Exigences (à valider)
- **E1 — Traduction automatique.** Avec « Dans toutes les langues », le message tapé est traduit dans les 18 langues de l'écran néon, sur le PC, sans internet. On voit les traductions et on peut en corriger une à la main.
- **E2 — Message par défaut** : traductions faites à la main, déjà dans l'app (comme aujourd'hui).
- **E3 — Galerie.** Plusieurs écrans proposés par l'app (néon aujourd'hui, d'autres à dessiner). Vignette animée, choix en un clic, aperçu en grand.
- **E4 — Import.** Image (PNG, JPG), GIF ou vidéo courte (MP4) depuis le PC, recadrée en 16:9, envoyée à l'endroit dans la webcam ([[ADR-0024 Ecran d'attente a l'endroit dans la webcam]]). Le message peut s'afficher par-dessus ou non.
- **E5 — Même rendu partout** : fenêtre Hyphn, webcam Windows, OBS ([[Cam - Webcam Windows et OBS]], E4).

## Cas limites
- Message très long : coupé proprement, ou plus petit.
- Langue mal traduite : la correction à la main est gardée.
- Fichier importé trop gros ou abîmé : refusé avec la raison.

## Preuve
Evan tape « On revient dans 5 min », coche « Dans toutes les langues » : les 18 langues défilent dans Discord. Il importe un GIF : Discord le montre à l'endroit.

Liens : [[Specs - Index]]
