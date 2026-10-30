# État du projet

Mis à jour : 2026-10-31 (session « Hello SwiftUI avec xtool »). Réécrit à chaque `/session-end`.

## Phase
**0 — Fondations.** Une app « Hello » existe (`apps/ios/`), pas encore le vrai code. Porte de sortie : [[ROADMAP]].

## Fait
- Préparation (2026-10-29) : cahier figé ([[CAHIER]]), recherche ([[Points a tester]]), méthode, docs, maquettes ([[Maquettes - Index]]), ADR ([[Decisions - Index]]).
- Serveur `evan@192.168.1.63` : tout Hyphn dans `~/hyphn/<service>/` ([[Serveur]]). xtool 1.24.0 + SDK iOS 27.2 en Docker ([[ADR-0011 xtool en Docker]]).
- iPhone 16 Pro Max (iOS 27.0.1, **en anglais**) : SideStore 0.7.0-alpha + LocalDevVPN, anisette `mac-ani.jkcoxson.com` ([[ADR-0012 Anisette Mac publique]]).
- **xtool connecté** avec l'Apple ID secondaire (jeton jusqu'au 2027-10-30) ; xtool utilise la même anisette jkcoxson (codée en dur).
- **Hello SwiftUI** (2026-10-31) : `apps/ios/`, bundle ID `io.github.1oma1e.hyphn`, construit sur le serveur, installé par SideStore, s'ouvre (confirmé par Evan). Recette de build : [[Serveur]], choix : [[ADR-0013 Build iOS par clone Git]].
- **Raccourci `Refresh SideStore`** : Set VPN Connect LocalDevVPN → Wait 3 s → Refresh All Apps → Wait 30 s → Set VPN Disconnect ; test à la main OK. Automatisation **lundi et jeudi à 20 h**.

## Pas fait
- Plan B testé une fois : AltServer-Linux + netmuxd.
- Premier rafraîchissement par l'automatisation (lundi 2026-11-02, 20 h), puis 14 jours sans action manuelle avec un journal des rafraîchissements.
- Décider d'arrêter ou non le conteneur `hyphn-anisette` (inutilisé, tourne encore).

## En attente d'Evan
- Valider les ADR `propose` : 0003, 0004, 0005, 0006, 0007 (phase 1 dès le 1er rafraîchissement auto), 0008, 0010.
- Valider les maquettes ; confirmer que « Xcode à la fin » vise Xcode sur le Mac.
- Après lundi 20 h : dire ce qu'affiche SideStore → My Apps (jours restants).
- Optionnel : supprimer `F:\Downloads\Xcode_27.2.xip`.

## Non vérifié
- Automatisation iPhone verrouillé (au-delà de 27 s, SideStore demande le premier plan).
- Plantage `swift-package` (signal 11) au premier build, pas reproduit.
- Comportement si `mac-ani.jkcoxson.com` tombe ; volumes du serveur après un redémarrage complet.
- Hook git `commit-msg` : jamais déclenché par une vraie ligne `Co-Authored-By`.

## Pièges à retenir
- iPhone en USB : couper son partage de connexion, sinon Windows route `192.168.1.x` par l'iPhone (erreur 10060).
- Un seul VPN actif sur iOS : LocalDevVPN coupe WireGuard.
- 2FA xtool sans code : ajouter l'Apple ID secondaire dans Mail sur l'iPhone, déclencher une connexion sur account.apple.com, recopier le code affiché (xtool-org/xtool#368).
- Pas de `xtool dev build --ipa` : `zip` absent de l'image, le `.app` est effacé. Zip en Python ([[Serveur]]).
- Pare-feu du serveur : un port de test n'est pas joignable depuis le PC ; on n'y touche pas. Le `.ipa` passe par `scp` puis Evan.
- Build : pousser d'abord (accord d'Evan), puis `git -C src pull` sur le serveur.

## Prochaine étape
Session suivante — **phase 0, plan B : AltServer-Linux + netmuxd testé une fois** :
1. Chercher l'existant (projets, images Docker), expliquer à Evan, puis compose dans `infra/altserver/`.
2. Preuve : un rafraîchissement de Hyphn fait par AltServer depuis le serveur.
3. Noter le résultat du rafraîchissement automatique de lundi 2026-11-02.

Commande pour commencer : `/session-start phase 0 : plan B AltServer-Linux + netmuxd`.
