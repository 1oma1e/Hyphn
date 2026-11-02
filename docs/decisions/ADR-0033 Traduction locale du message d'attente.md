---
type: decision
date: 2026-11-02
statut: propose
---
# ADR-0033 Traduction locale du message d'attente

## Contexte
Evan veut que le message de l'écran d'attente, tapé une fois, s'affiche traduit dans les 18 langues ([[Cam - Ecrans d'attente]], E1). Hyphn n'a ni compte ni cloud : la traduction doit tourner sur le PC, sans internet.

## Options
| Option | Pour | Contre |
|---|---|---|
| A. **Bergamot** (moteur de traduction locale de Firefox, open source), modèles téléchargés une fois par langue | Fait pour tourner sur un PC, rapide sur le processeur, qualité correcte ; une version C# existe (BergamotTranslatorSharp) | Paires de langues limitées (souvent via l'anglais) ; quelques dizaines de Mo par langue ; licences des modèles à vérifier |
| B. Petit modèle de langue local (LLM) | Toutes les langues d'un coup | Plusieurs centaines de Mo à quelques Go, lent sans bonne carte graphique |
| C. Pas de traduction libre : phrases prêtes traduites à la main, au choix | Zéro poids, qualité parfaite | Pas le message libre qu'Evan veut |

## Décision
Proposé : **A**, avec **C** pour les messages prêts (déjà en place pour le message par défaut). Langues sans modèle Bergamot : message laissé dans sa langue, avec le signal « non traduit ». À vérifier en début de session : la liste des langues couvertes, la taille, la licence, et l'appel depuis Rust (lib C++ ou exécutable à côté).

## Conséquences
- Téléchargement des modèles au premier usage : ce n'est pas du cloud, mais c'est un accès internet. À dire clairement à l'utilisateur ; possible aussi avec l'installateur.
- Les traductions sont gardées dans les réglages : pas de nouveau calcul à chaque lancement.
- Bon choix si les 18 langues s'affichent en moins de 5 s sur le PC d'Evan.

Liens : [[Decisions - Index]]
