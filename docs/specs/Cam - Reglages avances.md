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
Panneau semi-transparent **sur le côté droit** de l'image, liste qui défile ; l'image reste visible et à jour (choix d'Evan, 2026-11-02). Aujourd'hui, les réglages sont à côté de l'image et la cachent en partie (capture d'Evan du 2026-11-02). Maquette : [[PC - Cam]].

## Exigences (à valider)
- **E1 — Réglages sur l'image.** Colonne à droite qui ne cache pas plus d'un tiers de l'image ; un bouton masque le panneau pour voir l'image entière.
- **E2 — Profils en haut, une seule liste** : Max (par défaut), Équilibré, Économie, Appel, Stream, Cours, Personnalisé ([[ADR-0032 Profils de puissance au lieu de la protection batterie]]). Un réglage changé à la main passe en Personnalisé.
- **E3 — Image** (liste à confirmer par ce que l'iPhone expose, `AVCaptureDevice`) : exposition (EV, temps de pose, ISO), mise au point (auto, manuelle, distance), balance des blancs (auto, température, teinte), zoom fin, stabilisation, HDR vidéo, espace de couleur, verrouillage auto-exposition et auto-focus sur un point cliqué dans l'image.
- **E4 — Flux** : résolution, images/s, codec, débit (plafond), intervalle d'image clé, profil HEVC, format 16:9 / 9:16 / 4:3.
- **E5 — Auto et Reset** pour chaque réglage et pour chaque groupe ; « Tout remettre » en bas.
- **E6 — Mode simple / avancé** : le simple montre les profils et 4 réglages, l'avancé montre tout.
- **E7** : un réglage que l'iPhone ne sait pas faire est grisé avec la raison, jamais caché sans explication.

## Cas limites
- Caméra avant : moins de réglages (pas de mise au point manuelle sur certains iPhone).
- Changement d'objectif : les réglages manuels qui ne s'appliquent plus repassent en Auto, avec un message.

## Preuve
Evan règle exposition et balance des blancs en regardant l'image, sans fermer le panneau, et le rendu dans Discord change pareil.

Liens : [[Specs - Index]], [[Cam - Flux v1]]
