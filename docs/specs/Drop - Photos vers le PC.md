---
type: spec
module: Drop
phase: 2
statut: validee
---
# Drop — Photos vers le PC (v1)

## But
Envoyer des photos, vidéos, albums ou fichiers de l'iPhone vers le PC d'Evan, en qualité d'origine, vérifiés un par un, sans doublon, rangés par année et par mois, avec un parcours guidé ([[ADR-0029 Drop guide avec anti-doublon des la v1]]).

## Hors périmètre (v1)
- Envoi écran verrouillé ou app fermée, reprise après coupure ([[ADR-0005 Drop par HTTPS et blocs]]).
- PC → iPhone, câble, historique détaillé, pause (seulement « Annuler »).

## Parcours
[[Parcours - Transfert]], écrans [[iPhone - Drop]] et [[PC - Drop]], dans le style actuel de l'app, étapes animées (choix d'Evan, 2026-11-01 : code direct).

## Exigences
- **E1 — Commencer (PC).** Page Drop : un grand bouton « Commencer le transfert ». La **première fois** seulement, deux étapes avant :
  1. « Où ranger tes photos ? » : « Choisir un dossier » (boîte de dialogue Windows) ou « Laisser Hyphn choisir » : le disque fixe avec le plus de place libre, `X:\Hyphn\Photos` si ce n'est pas le disque de Windows, sinon `Images\Hyphn`. Le PC montre le chemin et la place libre : « C'est bon » ou « Choisir un autre ».
  2. « Comment les ranger ? » : Année puis mois (recommandé), Année, Tout ensemble.
  Ensuite (et directement les fois suivantes) : « Regarde ton iPhone ». Dossier et rangement se changent dans [[PC - Reglages]].
- **E2 — PC → iPhone.** « Commencer » envoie `DropStart` sur la liaison. Si Hyphn est ouvert sur l'iPhone, il passe sur l'onglet Drop, écran « Que veux-tu envoyer ? ». Sinon le PC dit « Ouvre Hyphn sur ton iPhone ». L'iPhone peut aussi commencer seul depuis son onglet Drop.
- **E3 — Que veux-tu envoyer ? (iPhone).** Quatre choix : **Photos et vidéos** (sélecteur d'Apple), **Un album** (liste des albums avec leur nombre d'éléments), **Des fichiers** (app Fichiers, plusieurs), **Tout le nouveau** (tout ce que ce PC n'a jamais reçu ; l'iPhone montre d'abord combien et quelle taille, puis « Envoyer »). La première fois, avant la demande d'iOS, une étape explique pourquoi Hyphn a besoin des photos (`NSPhotoLibraryUsageDescription`).
- **E4 — Originaux.** Les fichiers d'origine tels quels (HEIC, JPEG, DNG, MOV…), sans conversion : la photo ou la vidéo, plus la vidéo d'une Live Photo. Nom d'origine. Si l'original est sur iCloud, l'iPhone le télécharge d'abord (« Téléchargement iCloud… »).
- **E5 — Liaison.** Une connexion TLS épinglée par envoi, comme celle de Cam ([[Core - Appairage QR]] E4), premier message `DropHello`. L'app reste ouverte : l'écran ne se met pas en veille ; si l'app passe en arrière-plan, l'envoi s'arrête et le fichier en cours est jeté.
- **E6 — Anti-doublon.** Le PC garde un registre : identifiants Photos reçus et SHA-256 des fichiers rangés (avec leur chemin). Avant tout, l'iPhone envoie les identifiants choisis (`DropHave`) ; le PC répond ceux qui manquent (`DropMissing`) : les autres ne sont pas exportés et comptent « déjà sur le PC ». Ensuite chaque `DropFile` porte le SHA-256 calculé par l'iPhone : si ce contenu est déjà rangé (et le fichier existe toujours), le PC répond « doublon » et le fichier n'est pas envoyé.
- **E7 — Plan.** `DropPlan` : éléments, fichiers, taille totale. Le PC refuse s'il manque de la place (« Il manque 2,1 Go sur D: »), en gardant 1 Go libre.
- **E8 — Fichier.** `DropFile` (nom, taille, date de prise, année, mois, identifiant Photos, SHA-256, « fichier » ou « photo ») → `DropAck` (envoyer ou doublon) → blocs de 1 Mo (`DropChunk`) → `DropEnd` (SHA-256) → `DropAck`. Le PC écrit un `.part`, recalcule le SHA-256 et ne range le fichier que s'il est égal ; sinon il l'efface et l'iPhone le renvoie une fois.
- **E9 — Rangement.** Photos et vidéos : `<dossier>\Année\Mois` selon la **date de prise** (ou selon le réglage), date du fichier = date de prise. Fichiers : `<dossier>\Fichiers`. Nom déjà pris : `IMG_1234 (1).HEIC`. Le nom venu de l'iPhone ne peut pas sortir du dossier.
- **E10 — Progression.** Des deux côtés, animée : pourcentage, barre, octets et éléments faits / total, débit (moyenne sur 5 s), temps restant, fichier en cours. Fin : « 48 éléments · 1,2 Go · vérifiés · 12 déjà sur le PC », « Ouvrir le dossier » sur le PC.
- **E11 — Annuler.** Des deux côtés : arrêt, `.part` effacé, ce qui est rangé reste.
- **E12 — Énergie.** Fichiers lus par blocs, jamais entiers en mémoire ; aucun traitement d'image sur l'iPhone ([[RULES]], Énergie 3).

## Cas limites
| Cas | Ce qui se passe |
|---|---|
| Accès Photos refusé | « Hyphn a besoin de tes photos pour les envoyer. » + « Ouvrir Settings » |
| Accès Photos limité | Seuls les éléments visibles partent ; les autres comptent « non envoyés » |
| Original iCloud impossible à télécharger | Élément sauté, compté « non envoyé », l'envoi continue |
| Disque du PC plein | Arrêt + « Il manque X Go sur D: » |
| Hash différent | Fichier effacé, renvoyé une fois ; sinon « non envoyé » |
| Wi-Fi coupé, PC éteint, Hyphn en arrière-plan | Arrêt + message ; la reprise viendra plus tard |
| « Commencer » sur le PC, Hyphn fermé sur l'iPhone | « Ouvre Hyphn sur ton iPhone » |
| Rien de nouveau | « Tout est déjà sur le PC » |

## Preuve
1. `cargo test` : rangement par date et dans `Fichiers`, `.part` effacé si le hash est faux, « (1) », place insuffisante, registre (identifiants manquants, doublon par hash), dossier choisi par Hyphn.
2. Porte de la phase 2 : **10 Go** envoyés sans erreur, chaque SHA-256 vérifié ; puis le même envoi refait : **0 octet** envoyé, tout « déjà sur le PC ».

Liens : [[Specs - Index]], [[ROADMAP]]
