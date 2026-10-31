---
type: decision
date: 2026-10-31
statut: accepte
---
# ADR-0017 Pulse intégré, sans page à part

## Contexte
Le [[CAHIER]] et les maquettes V1 faisaient de Pulse un module avec sa page sur le PC ([[PC - Pulse]]) et une tuile sur l'iPhone. Evan (2026-10-31) : Pulse n'est pas un mode, c'est une info présente tout le temps, surtout utile quand on regarde le retour de la caméra sur le PC.

## Options
| Option | Pour | Contre |
|---|---|---|
| Page Pulse dédiée | Tout au même endroit, historique possible | Une page de plus, qu'on ouvre rarement |
| Infos intégrées là où on regarde | Toujours visibles, zéro clic | Moins de place pour le détail |

## Décision
Choix d'Evan : **intégré**.
- PC, Accueil : 4 infos en mots simples (Batterie, Chaleur, Connexion, Stockage).
- PC, Cam : coin d'infos sur l'aperçu (batterie, chaleur, latence Wi-Fi), visible **seulement** dans la fenêtre Hyphn, jamais dans l'image envoyée à la webcam ou à OBS.
- iPhone : plus de tuile Pulse ni d'interrupteur « partager » ; l'envoi suit [[ADR-0015 Lien permanent et connexion au premier plan]] (app ouverte).
- Chaleur affichée : `nominal` → Normale, `fair` → Tiède, `serious` → Chaude, `critical` → Très chaude.

## Conséquences
- [[Pulse - Batterie et thermique]] : E4 et parcours mis à jour.
- À trancher : où montrer les cycles lus par câble ([[ADR-0006 Sante batterie par cable]] visait la page Pulse). Piste : une fenêtre « i » sur la carte Batterie de l'Accueil.
- Le nom « Pulse » reste pour le code et les specs.
