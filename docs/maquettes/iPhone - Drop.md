# iPhone — Drop

Envoyer des photos, vidéos ou fichiers vers le PC. Le tri (Année/Mois, type) est fait par le PC : voir [[PC - Drop]].

## Choisir
```
┌──────────────────────────────┐
│ ‹ Retour          Drop       │
│ Envoyer vers PC-EVAN         │
│                              │
│ ( ) Tout ce qui est nouveau  │
│     depuis le 12/10 · 1 240  │
│     éléments · 18,4 Go       │
│ ( ) Choisir dans Photos      │
│ ( ) Choisir des fichiers     │
│                              │
│ Options                      │
│ [✓] Originaux (HEIC, RAW…)   │
│ [✓] Live Photos (photo+vidéo)│
│ [ ] Garder les albums        │
│                              │
│ ┌────────────────────────┐   │
│ │       Envoyer          │   │
│ └────────────────────────┘   │
└──────────────────────────────┘
```
« Nouveau » = pas encore reçu par ce PC (le PC garde la liste des identifiants Photos et des hash : rien n'est envoyé deux fois).

## Envoi en cours
```
┌──────────────────────────────┐
│ Envoi vers PC-EVAN           │
│ ████████████░░░░░░  64 %     │
│ 11,8 / 18,4 Go · 812 / 1 240 │
│ 38 Mo/s · reste ≈ 3 min      │
│                              │
│ IMG_4821.HEIC                │
│ Téléchargement iCloud… 2/5   │
│                              │
│ Tu peux verrouiller l'iPhone │
│ ou changer d'app.            │
│                              │
│ [ Pause ]      [ Annuler ]   │
└──────────────────────────────┘
```
La phrase « Tu peux verrouiller » dépend de l'essai de [[ADR-0005 Drop par HTTPS et blocs]]. Si l'essai échoue : « Garde Hyphn ouvert pendant l'envoi ».

## États
| État | Ce qui change |
|---|---|
| Original sur iCloud | Ligne « Téléchargement iCloud… » dans la progression |
| Wi-Fi coupé | « En pause : Wi-Fi perdu. Reprise automatique. » |
| Stockage du PC plein | « Le PC n'a plus de place (il manque 2,1 Go). » |
| Accès Photos limité | « Hyphn ne voit que 40 photos. » + bouton « Tout autoriser » |

Brouillons TikTok : petit guide (« Dans TikTok, enregistre le brouillon sur l'appareil ; il arrivera dans Photos »), dans [[iPhone - Reglages]] › Aide.

Parcours : [[Parcours - Transfert]] · Index : [[Maquettes - Index]]
