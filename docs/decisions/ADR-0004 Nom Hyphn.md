---
type: decision
date: 2026-10-29
statut: propose
---
# ADR-0004 Nom du projet : Hyphn

## Contexte
Six noms proposés dans le cahier. Vérification du 2026-10-29 (domaines, GitHub, App Store, marques) : [[Noms]].

## Options
| Option | Pour | Contre |
|---|---|---|
| Hyphn | Aucune app, aucune marque UE/FR ; court ; idée du trait d'union | `.app`, `.dev` et le compte GitHub `hyphn` déjà pris ; marque en Australie (classe 42) |
| Hyphenly | Domaines et GitHub libres | Plus long, marque non vérifiée |
| Ferry, Lynx, Ponto, Tandem, Orbit | — | Mots courants, apps et marques connues du même nom |

## Décision
Proposé : **Hyphn** (Hyphn Cam · Hyphn Drop · Hyphn Pulse). À valider par Evan.

## Conséquences
- Identifiant d'app iOS à fixer en phase 0 : il doit rester le même pour toujours (avec le même Apple ID), sinon les données du Keychain sont perdues.
- Si l'app devient publique : nouvelle recherche de marque en classe 9 avant toute publication.
