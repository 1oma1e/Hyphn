---
type: decision
date: 2026-10-31
statut: accepte
---
# ADR-0020 Phase 1 sans attendre le rafraîchissement automatique

## Contexte
[[ADR-0007 Porte de la phase 0]] faisait commencer la phase 1 au premier rafraîchissement automatique de SideStore (lundi 2026-11-02), puis demandait 14 jours notés. L'app PC est prête ([[ADR-0019 App PC en premier avec iPhone simule]]) et Evan veut la vraie app iPhone tout de suite.

## Options
| Option | Pour | Contre |
|---|---|---|
| Attendre lundi, puis 14 jours | On sait que l'app se rafraîchit seule avant d'écrire le code iPhone | 2 jours perdus, pour un risque qu'on peut régler plus tard |
| Commencer la phase 1 maintenant | On voit enfin le vrai appairage et la vraie caméra | Si le rafraîchissement automatique rate, on le découvre plus tard |

## Décision
Choix d'Evan (2026-10-31) : **on oublie la porte du rafraîchissement automatique**. La phase 0 est close. Si le raccourci `Refresh SideStore` rate un jour, on corrigera à ce moment-là. Le [[Journal des rafraichissements]] reste là, mais il n'est plus obligatoire.

Choix d'Evan pris dans la même session :
- **Ordre du travail** : appairage réel, puis Accueil, puis Cam sur l'iPhone et le PC. Drop reste un écran vide pour l'instant (session suivante). Cam passe donc avant la phase 2.
- **Validation de l'appairage seulement sur l'iPhone** : le PC affiche le code à 4 chiffres sans bouton ; Evan touche « Oui, relier » sur l'iPhone, puis l'animation « liés » démarre sur les deux appareils en même temps. Ça corrige [[Core - Appairage QR]] (E6).
- La simulation de l'iPhone sur le PC disparaît (`demo.rs`).

## Conséquences
- [[ROADMAP]] : phase 0 close, phase 1 en cours ; Cam v1 commencée en avance.
- Accord écrit pour la phase 1 : ce message d'Evan.
- Bon choix si l'app iPhone reste installée sans avoir à refaire « Refresh All » à la main plus d'une fois par semaine.

Liens : [[Decisions - Index]]
