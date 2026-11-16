---
type: decision
date: 2026-11-16
statut: accepte
---
# ADR-0042 Anglais par défaut et choix de la langue

## Contexte
Le dépôt devient public et Evan veut que des amis non francophones installent Hyphn ([[ADR-0040 Mises a jour auto et depot public]]). Jusqu'ici, tous les textes des deux apps étaient en français, écrits en dur. Demande d'Evan (2026-11-16) : l'app en anglais de base, le français au choix dans les Réglages, et la partie publique du dépôt (README, tuto) en anglais.

## Options
| Option | Pour | Contre |
|---|---|---|
| A. Fichiers de traduction standards (clés, `Localizable.strings`) | Habituel, extensible à 10 langues | Sur l'iPhone, les ressources d'un paquet SwiftPM passent par un bundle que xtool ne copie peut-être pas (non vérifié) ; clés à inventer pour ~800 textes |
| B. **Texte anglais dans le code, français à côté** | Le code se lit en anglais ; rien ne dépend du bundle ; un oubli affiche l'anglais au lieu de planter | Pensé pour 2 langues ; une 3e langue demanderait de passer à A |

## Décision
**B** (choix d'Evan, 2026-11-16) :
- **PC, fenêtre** : textes anglais dans `apps/desktop/ui/` passés à `t('…')`. Le français est dans `ui/fr.js` (`FR`, et `TIPS_FR` pour les info-bulles). Réglages › Langue : English ou Français, gardé dans `settings.lang` (`en` par défaut) ; la fenêtre se recharge au changement.
- **PC, côté Rust** (erreurs, menu de la barre des tâches, noms des mois de Drop) : `i18n::tr("English", "Français")`, qui suit le même réglage.
- **Webcam Windows** : message de pause par défaut « Be right back » ; le français et l'anglais par défaut font tous deux défiler les langues intégrées ([[ADR-0033 Traduction locale du message d'attente]]).
- **iPhone** : `L("English", "Français")`, français si la première langue de l'iPhone est le français, sinon anglais. Pas de réglage dans l'app (rappel : iPhone minimal, réglages sur le PC).
- **Partie publique** : README et tuto d'installation en anglais. Le vault `docs/` reste en français (pour Evan). Les dossiers de Drop sont en chiffres (`2026/10`) : rien à traduire.

## Conséquences
- Un nouveau texte arrive avec ses deux langues ; un nouveau réglage avec son info-bulle dans `TIPS` et dans `TIPS_FR` ([[RULES]], section PC).
- Les messages envoyés du PC à l'iPhone (refus de Drop, appairage) sont dans la langue du PC. L'iPhone ne compare jamais un message par son texte, sauf l'empreinte fausse de Drop, qu'il reconnaît dans les deux langues.
- Les réglages déjà enregistrés sans `lang` passent en anglais : Evan rechoisit Français une fois.
- Le message de pause personnel est toujours traduit à partir du français (traduction hors ligne, [[ADR-0033 Traduction locale du message d'attente]]) : un message écrit en anglais est mal traduit. À corriger plus tard (voir [[IDEES]]).

Liens : [[Decisions - Index]]
