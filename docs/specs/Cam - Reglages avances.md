---
type: spec
phase: 5 (en avance)
statut: brouillon
---
# Cam — Réglages avancés

## But
Un vrai outil pour régler le rendu de la caméra comme on veut. Les réglages s'ouvrent **par-dessus l'image en direct**, pour voir tout de suite ce que ça donne. Chaque réglage a un bouton « Auto » et un bouton « Reset ». Pour ceux qui s'y connaissent ; les autres gardent Auto.

## Hors périmètre
- Filtres et effets : [[Cam - Filtres et effets]].
- Réglages sur l'iPhone : l'iPhone reste minimal, tout se règle sur le PC.

## Parcours
Image bord à bord dans toute la fenêtre ; la barre du haut, les infos et les boutons flottent dessus et s'effacent quand la souris ne bouge pas ; bouton et F11 pour le vrai plein écran (choix d'Evan, 2026-11-02). Panneau semi-transparent **sur le côté droit**, un menu de catégories en haut (Profil, Lumière, Netteté, Couleurs, Cadrage, Envoi, Pause) et une liste qui défile ; l'image reste visible et à jour. « Infos du flux » s'ouvre au même endroit. Maquette : [[PC - Cam]] (pas à jour : codé direct à la demande d'Evan).

## Exigences (à valider)
- **E1 — Réglages sur l'image.** Colonne à droite qui ne cache pas plus d'un tiers de l'image ; un bouton masque le panneau pour voir l'image entière.
- **E2 — Profils en haut, une seule liste** : Max (par défaut), Équilibré, Économie, Appel, Stream, Cours, Personnalisé ([[ADR-0032 Profils de puissance au lieu de la protection batterie]]). Un réglage changé à la main passe en Personnalisé.
- **E3 — Image**, en mots simples : Lumière (plus sombre ou plus clair ; en manuel sensibilité et vitesse), Netteté (distance, point suivi cliqué sur l'image), Couleurs (chaleur, teinte), Cadrage (zoom, anti-tremblement, contre-jour, lampe). Chaque curseur a ses mots aux deux bouts (« Plus sombre » / « Plus clair »). Reste à faire : espace de couleur.
- **E4 — Flux** : résolution, images/s, codec, débit (plafond), intervalle d'image clé, profil HEVC, format 16:9 / 9:16 / 4:3.
- **E5 — Auto / Manuel** par catégorie, **Reset** sur chaque réglage changé et sur chaque catégorie ; « Tout remettre » en bas.
- **E6** : abandonné (demande d'Evan, 2026-11-02) — plus de mode simple / avancé, le menu de catégories le remplace.
- **E7** : un réglage que la caméra en cours ne sait pas faire **n'est pas affiché** (demande d'Evan, 2026-11-02). App iPhone trop ancienne : un message « Mets à jour l'app iPhone ».
- **E8 — Info-bulles** : titre, explication simple, conseil (règle PC de [[RULES]]).

## Cas limites
- Caméra avant : moins de réglages (pas de mise au point manuelle sur certains iPhone).
- Changement d'objectif : courte coupure de l'image ([[ADR-0036 Objectif exact au lieu de la camera combinee]]) ; les réglages manuels sont envoyés à nouveau au nouvel objectif.

## Preuve
Evan règle exposition et balance des blancs en regardant l'image, sans fermer le panneau, et le rendu dans Discord change pareil.

Liens : [[Specs - Index]], [[Cam - Flux v1]]
