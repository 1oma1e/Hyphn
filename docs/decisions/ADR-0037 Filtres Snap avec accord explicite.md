---
type: decision
date: 2026-11-02
statut: remplace
---
> Remplacé le 2026-11-04 par [[ADR-0038 Retrait des filtres Snap]] : tout ce qui suit a été retiré.

# ADR-0037 Filtres Snap avec accord explicite

## Contexte
Evan veut les filtres de Snapchat (Lenses) dans les effets de la Cam ([[Cam - Filtres et effets]]). Le seul moyen officiel est **Camera Kit** de Snap : un kit propriétaire (« information confidentielle de Snap »), sous les Conditions développeur de Snap, qui parle aux serveurs de Snap (`camera-kit-api.snapar.com`, CDN `*.sc-cdn.net`). C'est une exception à « rien ne sort de chez toi » ([[ARCHITECTURE]]).

## Options
| Option | Pour | Contre |
|---|---|---|
| A. Pas de filtres Snap | Rien ne sort jamais | Pas les filtres qu'Evan veut |
| B. Camera Kit, **après un accord explicite** et seulement quand on s'en sert | Les vrais filtres Snap ; le reste de Hyphn reste local | Snap voit l'adresse IP et l'usage, et l'image pour certains filtres (IA) ; clé API à créer ; kit propriétaire |

## Décision
**B** (choix d'Evan, 2026-11-02 ; il accepte les Conditions développeur de Snap pour Hyphn).
- Catégorie « Snap » dans le panneau Effets. Un avertissement dit ce qui sort et chez qui ; bouton « Autoriser » ; case « Ne plus afficher en grand » : même cochée, un rappel d'une ligne reste toujours là. « Retirer l'accord » à tout moment.
- **Aucune connexion à Snap** tant qu'il n'y a pas : l'accord, la clé API (Web) et le Group ID (de my-lenses.snapchat.com › Camera Kit › Apps), puis un clic sur « Voir les filtres Snap » ou un filtre Snap déjà choisi. Vérifié dans la page d'essai : aucune requête vers Snap avant.
- Le kit n'est **pas dans le dépôt** : installé par npm (`@snap/camera-kit` 1.22.0) et emballé dans `ui/vendor/snap/` par `npm run snapkit` (lancé avant `dev` et `build`), dossier ignoré par git.
- La clé reste dans les réglages du PC, jamais dans le dépôt ni les journaux.
- La fenêtre autorise les domaines de Snap dans sa politique de sécurité ; ils ne servent qu'une fois le kit chargé.
- Les serveurs de Snap n'acceptent que les pages en https (vérifié le 2026-11-03 : origine `http://tauri.localhost` → 401, `https://tauri.localhost` → 200). La fenêtre est donc servie en https (`useHttpsScheme` dans `tauri.conf.json`) ; les réglages de Hyphn sont côté Rust, rien n'est perdu.

## Conséquences
- Rendu : l'image de l'iPhone entre dans le filtre Snap par un flux de canvas, et la sortie du filtre remplace l'image avant les autres effets ; Discord voit le résultat ([[ADR-0034 Ou appliquer les filtres de la Cam]]).
- Non vérifié : un vrai filtre Snap (il faut la clé d'Evan), le retard ajouté, le rendu dans Discord.
- Bon choix si Evan voit ses filtres Snap dans Discord et qu'aucune connexion à Snap n'apparaît tant qu'il ne s'en sert pas.

Liens : [[Decisions - Index]]
