---
type: decision
date: 2026-11-01
statut: accepte
---
# ADR-0029 Drop guidé, avec anti-doublon dès la v1

## Contexte
Le premier Drop marche (Evan a envoyé des photos le 2026-11-01). Evan veut un vrai parcours : un bouton « Commencer » sur le PC, des étapes animées, le choix du dossier la première fois (ou « Laisser Hyphn choisir »), puis l'iPhone qui propose quoi envoyer. Il avance aussi des points prévus pour Drop v2 ([[ROADMAP]], phase 3) : les albums, les fichiers, « Tout le nouveau » et l'anti-doublon.

## Options
| Option | Pour | Contre |
|---|---|---|
| Garder la v1 simple, le reste en v2 | Moins de code d'un coup | Parcours pauvre ; « Tout le nouveau » impossible sans anti-doublon |
| Tout dans la v1 (choix d'Evan) | Un Drop complet et guidé tout de suite | Plus gros ; la reprise après coupure et l'envoi écran verrouillé restent pour plus tard |

## Décision
Choix d'Evan le 2026-11-01, code direct dans le style actuel :
- **PC** : bouton « Commencer le transfert ». La première fois seulement : « Où ranger tes photos ? » (« Choisir un dossier » ou « Laisser Hyphn choisir », avec confirmation), puis « Comment les ranger ? ». Ensuite « Regarde ton iPhone ». Ces choix se changent ensuite dans les Réglages.
- **Laisser Hyphn choisir** : le disque fixe qui a le plus de place libre ; si ce n'est pas celui de Windows, `X:\Hyphn\Photos`, sinon `Images\Hyphn`. Le PC montre le chemin et la place libre, et demande « C'est bon ? ».
- **PC → iPhone** : « Commencer » envoie `DropStart` sur la liaison ; si Hyphn est ouvert sur l'iPhone, il passe tout seul sur Drop, à l'écran « Que veux-tu envoyer ? ».
- **iPhone** : Photos et vidéos, Un album, Des fichiers (app Fichiers), Tout le nouveau. La première fois, une étape explique l'accès aux photos avant la demande d'iOS.
- **Anti-doublon** : le PC garde un registre (identifiants Photos reçus, SHA-256 des fichiers rangés). L'iPhone demande d'abord quels éléments manquent (`DropHave` / `DropMissing`) : ceux déjà reçus ne sont même pas exportés. Puis chaque fichier annonce son SHA-256 dans `DropFile` : s'il est déjà rangé, le PC répond « doublon » et rien n'est envoyé.
- Les fichiers de l'app Fichiers vont dans `<dossier>\Fichiers`, pas par mois.

## Conséquences
- La spec [[Drop - Photos vers le PC]] est réécrite avec ces exigences.
- Reste pour plus tard : envoi écran verrouillé et reprise après coupure ([[ADR-0005 Drop par HTTPS et blocs]]), PC → iPhone, câble.
- Un fichier effacé à la main du dossier n'est pas renvoyé par « Tout le nouveau » (le registre se souvient de l'identifiant Photos) ; il l'est s'il est choisi à la main.
