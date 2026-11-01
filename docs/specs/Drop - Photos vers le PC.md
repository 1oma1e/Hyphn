---
type: spec
module: Drop
phase: 2
statut: validee
---
# Drop — Photos vers le PC (v1)

## But
Envoyer des photos, vidéos, albums ou fichiers de l'iPhone vers le PC d'Evan, en qualité d'origine, vérifiés un par un, sans doublon, rangés par année et par mois, avec un parcours guidé qui commence sur l'iPhone ([[ADR-0029 Drop guide avec anti-doublon des la v1]], [[ADR-0030 Drop commence sur l'iPhone et le PC confirme]]).

## Hors périmètre (v1)
- Envoi écran verrouillé ou app fermée, reprise après coupure ([[ADR-0005 Drop par HTTPS et blocs]]).
- PC → iPhone, câble, historique détaillé, pause (seulement « Annuler »).

## Parcours
[[Parcours - Transfert]], écrans [[iPhone - Drop]] et [[PC - Drop]], dans le style actuel de l'app, étapes animées (choix d'Evan, 2026-11-01 : code direct).

## Exigences
- **E1 — On commence sur l'iPhone** ([[ADR-0030 Drop commence sur l'iPhone et le PC confirme]]). Onglet Drop : « Que veux-tu envoyer ? » avec trois choix, en grandes cartes : **Photos et vidéos** (sélecteur d'Apple), **Un album** (liste des albums avec leur nombre d'éléments), **Des fichiers** (app Fichiers, plusieurs). « Tout le nouveau » est retiré (choix d'Evan, 2026-11-01). La première fois, avant la demande d'iOS, une étape explique pourquoi Hyphn a besoin des photos (`NSPhotoLibraryUsageDescription`).
- **E2 — Aperçu et confirmation sur l'iPhone.** Après le choix (et le tri anti-doublon E6), l'iPhone montre un **aperçu** : les premières miniatures (une case « +N » compte le reste, une icône lecture sur les vidéos, le nom pour un fichier), « 32 photos · 14 vidéos · 2 fichiers · 1,2 Go vers PC-EVAN », « 12 déjà sur le PC », puis « Envoyer » et « Annuler ». Les miniatures sont celles que Photos garde déjà ; huit d'entre elles, petites (JPEG ≤ 64 Ko), partent avec le plan pour la confirmation du PC. Puis « Confirme sur ton PC » jusqu'à la réponse du PC. Si tout est déjà sur le PC : « Tout est déjà sur le PC », rien n'est demandé au PC.
- **E3 — Confirmer sur le PC.** À l'arrivée du plan, la fenêtre Hyphn s'ouvre sur Drop avec une fenêtre de confirmation. La **première fois**, étape par étape : (1) « Où ranger tes photos ? » : « Laisser Hyphn choisir » (le disque fixe avec le plus de place libre, `X:\Hyphn\Photos` si ce n'est pas le disque de Windows, sinon `Images\Hyphn`) ou « Choisir un dossier », puis « C'est bon ? » avec la place libre ; (2) « Comment les ranger ? » : Année puis mois (conseillé), Année, Tout ensemble ; (3) l'accord, avec le même aperçu (miniatures, nombre de photos, vidéos et fichiers, taille, dossier et rangement). Les fois suivantes, seulement l'accord : « Accepter » ou « Refuser ». Dossier et rangement se changent dans [[PC - Reglages]]. Sans réponse en 5 minutes, l'envoi s'arrête. Au repos, la page Drop montre une courte simulation animée des étapes (iPhone à gauche, PC à droite, cinq étapes qu'on peut aussi toucher) et si l'iPhone est prêt. Si l'iPhone annule ou se déconnecte pendant que le PC demande, la fenêtre se ferme aussitôt ; une connexion Drop restée bloquée avant l'accord cède la place à la suivante.
- **E4 — Originaux.** Les fichiers d'origine tels quels (HEIC, JPEG, DNG, MOV…), sans conversion : la photo ou la vidéo, plus la vidéo d'une Live Photo. Nom d'origine. Si l'original est sur iCloud, l'iPhone le télécharge d'abord (« Téléchargement iCloud… »).
- **E5 — Liaison.** Une connexion TLS épinglée par envoi, comme celle de Cam ([[Core - Appairage QR]] E4), premier message `DropHello`. L'app reste ouverte : l'écran ne se met pas en veille ; si l'app passe en arrière-plan, l'envoi s'arrête et le fichier en cours est jeté.
- **E6 — Anti-doublon.** Le PC garde un registre : identifiants Photos reçus et SHA-256 des fichiers rangés (avec leur chemin). Avant tout, l'iPhone envoie les identifiants choisis (`DropHave`) ; le PC répond ceux qui manquent (`DropMissing`) : si certains sont déjà connus, l'iPhone prévient : « 12 déjà envoyés · Si tu les as supprimés du PC, renvoie-les » avec « Envoyer les nouveaux », « Tout renvoyer » (ou « Les renvoyer » s'ils le sont tous) et « Annuler » (choix d'Evan, 2026-11-01). Non renvoyés, ils ne sont pas exportés et comptent « déjà sur le PC ». Ensuite chaque `DropFile` porte le SHA-256 calculé par l'iPhone : si ce contenu est déjà rangé (et le fichier existe toujours), le PC répond « doublon » et le fichier n'est pas envoyé.
- **E7 — Plan.** `DropPlan` : éléments, fichiers, taille totale. Le PC refuse s'il manque de la place (« Il manque 2,1 Go sur D: »), en gardant 1 Go libre.
- **E8 — Fichier.** `DropFile` (nom, taille, date de prise, année, mois, identifiant Photos, SHA-256, « fichier » ou « photo ») → `DropAck` (envoyer ou doublon) → blocs de 1 Mo (`DropChunk`) → `DropEnd` (SHA-256) → `DropAck`. Le PC écrit un `.part`, recalcule le SHA-256 et ne range le fichier que s'il est égal ; sinon il l'efface et l'iPhone le renvoie une fois.
- **E9 — Rangement.** Photos et vidéos : `<dossier>\Année\Mois` selon la **date de prise** (ou selon le réglage), date du fichier = date de prise. Fichiers : `<dossier>\Fichiers`. Nom déjà pris : `IMG_1234 (1).HEIC`. Le nom venu de l'iPhone ne peut pas sortir du dossier.
- **E10 — Progression** (choix d'Evan, 2026-11-01). Le **pourcentage est seulement sur le PC** : c'est lui qui sait ce qui est vraiment arrivé (l'iPhone compte ce qu'il a mis dans le réseau, en avance). PC : un schéma animé iPhone → PC → dossier, un anneau de pourcentage, et en clair « Reçu 812 Mo sur 1,2 Go », « 12 éléments sur 48 », vitesse (moyenne sur 5 s), temps restant, fichier en cours. iPhone : « Envoi en cours » avec une animation, « Suis la progression sur ton PC », le fichier en cours (et « Téléchargement iCloud… »), « Annuler ». Fin : sur le PC, une fenêtre montre l'aperçu de ce qui est arrivé (miniatures, nombre de photos, vidéos et fichiers, taille, « vérifiés »), avec « OK » et « Ouvrir le dossier » ; sur l'iPhone, « 48 éléments sur le PC ».
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
| « Refuser » sur le PC | L'iPhone affiche « Refusé sur le PC », rien n'est envoyé |
| Tout est déjà sur le PC | « Tout est déjà sur le PC », rien n'est demandé au PC |

## Preuve
1. `cargo test` : rangement par date et dans `Fichiers`, `.part` effacé si le hash est faux, « (1) », place insuffisante, registre (identifiants manquants, doublon par hash), dossier choisi par Hyphn.
2. Porte de la phase 2 : **10 Go** envoyés sans erreur, chaque SHA-256 vérifié ; puis le même envoi refait : **0 octet** envoyé, tout « déjà sur le PC ».

Liens : [[Specs - Index]], [[ROADMAP]]
