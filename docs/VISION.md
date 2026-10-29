# Vision

Version vivante de la vision. Le texte de départ est figé dans [[CAHIER]] (sections 1 et 2) ; toute différence avec lui est expliquée par un ADR.

## En une phrase
**Hyphn** est le trait d'union entre l'iPhone et le PC : on scanne un QR code une fois, et le PC a une webcam 4K, reçoit les photos triées et voit l'état du téléphone, sans compte, sans cloud, sans abonnement.

## Les trois modules
| Module | Ce que ça fait | Pour qui / quand |
|---|---|---|
| **Hyphn Cam** | L'iPhone devient une webcam virtuelle Windows (et une source OBS) jusqu'à 4K60 HEVC, avec tous les réglages | Appels, cours, stream |
| **Hyphn Drop** | Photos, vidéos et fichiers iPhone ↔ PC, en Wi-Fi ou câble, triés par Année/Mois et type, avec taille, vitesse, temps restant et reprise | Vider le téléphone, sauvegarder |
| **Hyphn Pulse** | Batterie, chauffe, stockage et réseau de l'iPhone affichés sur le PC | Toujours, en fond, sans coûter de batterie |

## Ce qui nous rend meilleurs
1. **Appairage en 2 secondes** par QR, 100 % local, chiffré, certificat épinglé.
2. **La qualité s'adapte** à la chauffe et au Wi-Fi au lieu de couper (personne ne le fait bien : voir [[Concurrents et projets open source]]).
3. **Télémétrie sur le PC** : débit, latence, batterie, état thermique (iOS ne donne pas de °C : [[Points a tester]]).
4. **Plugin OBS natif** en plus de la webcam, sans filigrane ni abonnement.
5. **Reprise après coupure** pour les transferts (LocalSend, la référence open source, ne l'a pas).
6. **Une seule app** pour webcam + transfert + état du téléphone.

## Ce qu'on ne promet pas (limites d'iOS)
- Caméra écran verrouillé ou app en arrière-plan : **non** (mode écran noir à la place).
- Données des autres apps (brouillons TikTok…) : **non** (petit guide pour les enregistrer dans Photos).
- Contrôle de l'iPhone depuis le PC : **abandonné**.
- Partage d'écran (ReplayKit) : **plus tard**, quand xtool saura construire les extensions.
- Santé batterie et cycles : **par câble seulement**, valeurs brutes ([[ADR-0006 Sante batterie par cable]]).
- Sauvegarde à heure fixe : **en partie** (iOS choisit l'heure ; Raccourcis pour forcer).

## Contraintes fixes
Pas d'abonnement Apple payant, pas de Mac. Build par xtool sur le serveur Linux, installation par SideStore + LocalDevVPN, serveur anisette perso en Docker, AltServer-Linux en plan B. Usage perso. PC sous Windows 11.

## Nom
Hyphn, proposé après vérification : [[Noms]], [[ADR-0004 Nom Hyphn]].

Liens : [[ROADMAP]], [[ARCHITECTURE]], [[00-Accueil]]
