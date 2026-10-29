---
type: decision
date: 2026-10-29
statut: propose
---
# ADR-0005 Drop en Wi-Fi : envoi HTTPS par blocs vers un serveur sur le PC

## Contexte
Le cahier prévoit des « blocs TLS » de 4 à 8 Mo avec position de reprise. Mais iOS arrête vite une app passée en arrière-plan (≈ 30 s rapportés), et un gros transfert dure souvent plus longtemps que l'écran allumé. Apple conseille, pour les gros fichiers, une session **URLSession d'arrière-plan** avec des transferts reprenables. Ce mécanisme ne marche qu'avec HTTP(S), pas avec un socket maison. LocalSend, la référence, n'a pas de reprise du tout. Sources : [[Points a tester]].

## Options
| Option | Pour | Contre |
|---|---|---|
| Socket TLS maison (cahier) | Un seul canal pour tout, contrôle total | Le transfert s'arrête quand l'app passe en arrière-plan ou que l'écran se verrouille |
| HTTPS par blocs (`PUT` + `Content-Range`), serveur HTTPS sur le PC, certificat épinglé à l'appairage | iOS continue l'envoi en arrière-plan ; reprise simple (le PC dit quel octet il a déjà) ; outils de test standard (curl) | Deux canaux (contrôle + HTTPS) ; il faut vérifier que le certificat épinglé marche dans une session d'arrière-plan |

## Décision
Proposé : HTTPS par blocs pour Drop (le canal de contrôle reste en TLS). Reste à valider par Evan, et par un essai en phase 2 : 1 Go envoyé avec l'écran verrouillé au bout de 10 s.

## Conséquences
- Change la ligne « Drop : blocs TLS » du schéma d'architecture : voir [[ARCHITECTURE]].
- Le protocole décrit l'API de transfert (préparer, envoyer un bloc, demander la position, terminer avec le hash) dans `protocol/`.
- Si l'essai échoue (certificat épinglé refusé en arrière-plan), on revient au socket TLS et on garde l'app au premier plan pendant l'envoi.
