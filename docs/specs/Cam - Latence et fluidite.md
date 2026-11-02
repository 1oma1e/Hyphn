---
type: spec
phase: 4 (en avance)
statut: brouillon
---
# Cam — Latence et fluidité

## But
Une image fluide et nette qui suit la voix (lèvres synchronisées), au maximum de ce que permettent le téléphone, le PC et le lien (câble ou Wi-Fi). Pour Evan et pour ceux qui ont du bon matériel. Les autres baissent avec un profil ([[ADR-0032 Profils de puissance au lieu de la protection batterie]]).

## Hors périmètre
- Son (Hyphn n'envoie que l'image, [[ADR-0018 Cam image seule et demarrage en pause]]).
- Passage en UDP (SRT, WebRTC) : seulement si les mesures montrent que TCP est la cause des saccades, et par ADR.

## Parcours
Pas d'écran nouveau, sauf « Infos du flux » plus détaillé et le choix de profil ([[Cam - Reglages avances]]).

## Exigences (à valider)
- **E1 — Mesure d'abord.** Latence verre à verre mesurée et notée avant et après chaque changement, en Wi-Fi et en câble ([[Latence et debit Cam]], « Mesures »).
- **E2 — Temps par étape.** « Infos du flux » montre : capture → envoi (iPhone), réseau, attente et décodage (PC), en ms, plus les images sautées et les images clés forcées par minute.
- **E3 — Débit qui suit le lien.** Dans tous les profils, le débit monte jusqu'à ce que le lien sature, puis se cale juste en dessous. Un débit choisi à la main est un plafond, pas une consigne fixe.
- **E4 — Pas de pic d'image clé.** Mode faible latence de VideoToolbox, ou rafraîchissement progressif, si l'iPhone le permet (à vérifier). Plus d'image clé forcée après chaque image sautée quand ce n'est pas nécessaire.
- **E5 — Profil Max par défaut** : 4K60 ou 1080p60 selon le lien mesuré, débit le plus haut que le lien tient.
- **E6 — Rien d'inutile sur le trajet.** Retirer ce qui coûte sans servir : copies d'image, conversions, files en trop. Chaque retrait est mesuré (E1).

## Cas limites
- Wi-Fi chargé (autre appareil qui télécharge) : le débit baisse sans saccade visible plus d'une fois par minute.
- iPhone chaud en profil Max : alerte sur le PC, aucune baisse sauf au stade « critique ».
- PC sans décodage HEVC matériel : H.264, débit adapté.

## Preuve
- Latence verre à verre : chiffres avant et après dans le journal de session ; but à fixer par Evan après la première mesure.
- 30 min en 1080p60 par câble sans saccade visible (porte de la phase 4).

## À décider avec Evan
- Le but chiffré de latence (ex. moins de 100 ms en câble).
- UDP ou pas, après les mesures.

Liens : [[Specs - Index]], [[Cam - Flux v1]]
