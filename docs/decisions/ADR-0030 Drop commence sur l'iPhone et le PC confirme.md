---
type: decision
date: 2026-11-01
statut: accepte
---
# ADR-0030 Drop commence sur l'iPhone, le PC confirme

## Contexte
[[ADR-0029 Drop guide avec anti-doublon des la v1]] faisait partir Drop d'un bouton « Commencer » sur le PC, qui ouvrait l'onglet Drop de l'iPhone. En l'essayant, Evan préfère l'inverse : on choisit et on confirme sur l'iPhone (c'est là que sont les photos), puis le PC demande confirmation, et la première fois où ranger.

## Options
| Option | Pour | Contre |
|---|---|---|
| Départ du PC (ADR-0029) | Un bouton visible sur le PC | On fait l'aller-retour PC → iPhone → PC ; deux endroits pour commencer |
| Départ de l'iPhone, le PC confirme (choix d'Evan) | Un seul point de départ, là où sont les photos ; le PC garde le dernier mot (dossier, place, accord) | Le PC doit attendre une réponse humaine au milieu de l'échange |

## Décision
Choix d'Evan le 2026-11-01 :
1. **iPhone** : « Que veux-tu envoyer ? » → choix → écran de confirmation (« Envoyer 48 éléments · 1,2 Go vers PC-EVAN ? ») → « Confirme sur ton PC ».
2. **PC** : à l'arrivée du plan (`DropPlan`), la fenêtre s'ouvre sur Drop avec une fenêtre de confirmation. La **première fois**, étape par étape : où ranger (« Laisser Hyphn choisir » ou « Choisir un dossier », puis « C'est bon ? »), comment ranger, puis l'accord. Les fois suivantes : seulement l'accord (« Accepter » / « Refuser »).
3. Le PC répond au plan seulement après la réponse d'Evan (`DropAck`), puis le transfert démarre. « Refuser » renvoie « Refusé sur le PC » à l'iPhone.
4. **Page Drop du PC au repos** : pas de bouton « Commencer » ; un écran qui explique comment commencer sur l'iPhone, en trois étapes.
5. `DropStart` (PC → iPhone) est retiré ; son numéro 26 n'est pas réutilisé.

## Conséquences
- Remplace dans [[ADR-0029 Drop guide avec anti-doublon des la v1]] le départ depuis le PC ; le reste (choix sur l'iPhone, dossier choisi par Hyphn, anti-doublon) est gardé.
- [[Drop - Photos vers le PC]] E1 à E3 réécrits.
- Le PC attend la réponse d'Evan au plus 5 minutes, puis l'envoi s'arrête (« Pas de réponse sur le PC »).
