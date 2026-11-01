---
type: spec
module: Drop
phase: 2
statut: validee
---
# Drop — Photos vers le PC (v1)

## But
Envoyer les photos et vidéos choisies sur l'iPhone vers le PC d'Evan, en qualité d'origine, vérifiées une par une et rangées par année et par mois.

## Hors périmètre (v1)
- « Tout ce qui est nouveau » et l'anti-doublon (Drop v2). En v1, renvoyer une photo la recopie avec un nom en « (1) ».
- Envoi écran verrouillé ou app fermée, reprise après coupure ([[ADR-0005 Drop par HTTPS et blocs]], Drop v2).
- Fichiers de l'app Fichiers, PC → iPhone, câble, historique détaillé.
- Pause : en v1, seulement « Annuler ».

## Parcours
[[Parcours - Transfert]] (par Wi-Fi), écrans [[iPhone - Drop]] et [[PC - Drop]], dans le style actuel de l'app (choix d'Evan, 2026-11-01 : code direct, sans nouvelle maquette).

## Exigences
- **E1 — Choisir.** Onglet Drop de l'iPhone : un bouton « Choisir dans Photos » ouvre le sélecteur d'Apple (`PHPickerViewController`, plusieurs éléments, photos et vidéos). L'accès à la photothèque est demandé à ce moment-là, pas avant (`NSPhotoLibraryUsageDescription`).
- **E2 — Originaux.** Pour chaque élément, l'iPhone envoie les fichiers d'origine tels quels (HEIC, JPEG, DNG, MOV…), sans conversion : la photo ou la vidéo, plus la vidéo d'une Live Photo. Nom d'origine (`IMG_1234.HEIC`). Si l'original est sur iCloud, l'iPhone le télécharge d'abord (« Téléchargement iCloud… »).
- **E3 — Liaison.** Une troisième connexion TLS épinglée vers le PC, comme celle de Cam (même port, mêmes empreintes, [[Core - Appairage QR]] E4). Premier message `DropHello`. Fermée à la fin de l'envoi. L'app reste ouverte : l'écran ne se met pas en veille pendant l'envoi ; si l'app passe en arrière-plan, l'envoi s'arrête et le fichier en cours est jeté.
- **E4 — Plan.** L'iPhone annonce d'abord le nombre d'éléments et la taille totale (`DropPlan`). Le PC répond oui, ou non avec la raison (« Il manque 2,1 Go sur D: »).
- **E5 — Fichier.** Pour chaque fichier : `DropFile` (nom, taille, date de prise, type), puis des blocs de 1 Mo (`DropChunk`), puis `DropEnd` avec le SHA-256 calculé par l'iPhone. Le PC écrit dans un fichier `.part`, calcule son propre SHA-256, et seulement s'ils sont égaux le renomme à sa place ; sinon il l'efface et répond une erreur. Réponse `DropAck` (ok ou raison).
- **E6 — Rangement.** Dossier choisi dans [[PC - Reglages]] (par défaut `Images\Hyphn`), puis `Année\Mois` selon la **date de prise** de la photo (réglage « Rangement » : Année/Mois, Année, ou tout à plat). Nom déjà pris : `IMG_1234 (1).HEIC`.
- **E7 — Progression.** Des deux côtés : barre, octets envoyés / total, éléments faits / total, débit (moyenne sur 5 s), temps restant, nom du fichier en cours. À la fin : « 48 éléments · 1,2 Go · vérifiés » et, sur le PC, un bouton « Ouvrir le dossier ».
- **E8 — Annuler.** Sur l'iPhone ou le PC : l'envoi s'arrête, le fichier en cours (`.part`) est effacé, ceux déjà rangés restent.
- **E9 — PC.** Page Drop : dossier de destination, envoi en cours (E7), puis les derniers mois reçus (nombre de fichiers et taille, déjà calculés par `drop::summary`).
- **E10 — Énergie.** Lecture et SHA-256 des fichiers par blocs (pas de fichier entier en mémoire) ; aucun traitement d'image sur l'iPhone ([[RULES]], Énergie 3).

## Cas limites
| Cas | Ce qui se passe |
|---|---|
| Accès Photos refusé | « Hyphn a besoin de tes photos pour les envoyer. » + bouton « Ouvrir Settings » |
| Original iCloud impossible à télécharger | L'élément est sauté et compté « non envoyé », l'envoi continue |
| Disque du PC plein (au plan ou en cours) | Arrêt + « Il manque X Go sur D: » |
| Hash différent | Fichier effacé sur le PC, envoyé une seconde fois ; si ça recommence, compté « non envoyé » |
| Wi-Fi coupé, PC éteint | Arrêt + « Liaison perdue : relance l'envoi » (la reprise vient en v2) |
| Hyphn passe en arrière-plan sur l'iPhone | Arrêt, même message |

## Preuve
1. `cargo test` : rangement par date, `.part` effacé si le hash est faux, nom en « (1) », refus si le disque est trop petit.
2. Porte de la phase 2 : **10 Go** (photos et vidéos mélangées, dont des Live Photos) envoyés sans erreur, chaque SHA-256 vérifié par le PC ; nombre de fichiers et taille comparés, durée notée dans le journal.

Liens : [[Specs - Index]], [[ROADMAP]]
