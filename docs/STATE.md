# État du projet

Mis à jour : 2026-10-31 (session « Maquettes visuelles »). Réécrit à chaque `/session-end`.

## Phase
**0 — Fondations**, en attente du premier rafraîchissement automatique (lundi 2026-11-02, 20 h). S'il réussit, la phase 1 peut commencer avec l'accord écrit d'Evan ([[ADR-0007 Porte de la phase 0]], accepté). La phase 0 n'est close qu'au 2026-11-14 (14 jours). Porte : [[ROADMAP]].

## Fait
- Préparation (2026-10-29) : cahier figé ([[CAHIER]]), recherche ([[Points a tester]]), méthode, docs, maquettes texte, ADR ([[Decisions - Index]]).
- Serveur `evan@192.168.1.63` : tout Hyphn dans `~/hyphn/<service>/` ([[Serveur]]). xtool 1.24.0 + SDK iOS 27.2 en Docker ([[ADR-0011 xtool en Docker]]).
- iPhone 16 Pro Max (iOS 27.0.1, **en anglais**) : SideStore 0.7.0-alpha + LocalDevVPN, anisette `mac-ani.jkcoxson.com` ([[ADR-0012 Anisette Mac publique]]). xtool connecté avec l'Apple ID secondaire (jeton jusqu'au 2027-10-30).
- **Hello SwiftUI** : `apps/ios/`, bundle ID `io.github.1oma1e.hyphn`, construit sur le serveur, installé par SideStore ([[ADR-0013 Build iOS par clone Git]]).
- **Raccourci `Refresh SideStore`**, automatisation lundi et jeudi à 20 h. Suivi : [[Journal des rafraichissements]]. Plan B AltServer abandonné ([[ADR-0014 Pas de plan B AltServer]]).
- **Specs phase 1 en brouillon** : [[Core - Appairage QR]], [[Core - Reconnexion]], [[Pulse - Batterie et thermique]] ([[ADR-0015 Lien permanent et connexion au premier plan]]).
- **Maquettes visuelles V2 validées par Evan** (2026-10-31) : PC (5 pages) et iPhone (7 écrans) cliquables, liens dans [[Maquettes - Index]] ([[ADR-0016 Design visuel V2]]). Choix d'Evan : pas de page Pulse ([[ADR-0017 Pulse integre sans page]]) ; pas de son, Cam démarre en pause avec un écran d'attente, aperçu plein écran et écran noir sur l'iPhone ([[ADR-0018 Cam image seule et demarrage en pause]]) ; après l'appairage, animation « liés » d'environ 8 s puis Accueil ; pas de QR si une vérification réseau échoue (spec appairage E8, E11).

## Pas fait
- Premier rafraîchissement automatique (2026-11-02), puis 14 jours notés dans le journal.
- Notes texte de `docs/maquettes/` à remettre à jour d'après la V2 (retirer `PC - Pulse`, le micro ; Cam, Drop et onglets à refaire). En attendant, la V2 a raison.
- Où afficher les cycles batterie lus par câble, sans page Pulse ([[ADR-0017 Pulse integre sans page]]).
- Spec `Pulse - Batterie par cable` : après un essai `idevicediagnostics ioregentry AppleSmartBattery` ([[ADR-0006 Sante batterie par cable]]).
- Décider d'arrêter ou non le conteneur `hyphn-anisette` (inutilisé, tourne encore).
- VISION dit « appairage en 2 s », la porte dit « < 3 s » : à trancher.

## En attente d'Evan
- Après lundi 20 h : remplir la ligne du 2026-11-02 dans [[Journal des rafraichissements]] (SideStore → My Apps, jours restants).
- Valider les 3 specs (statut `validee` dans [[Specs - Index]]).
- Valider les ADR `propose` : 0003, 0004, 0005, 0006, 0008, 0010.
- Confirmer « écran noir automatique après 30 s, activé par défaut » ([[ADR-0018 Cam image seule et demarrage en pause]]).
- Optionnel : supprimer `F:\Downloads\Xcode_27.2.xip`.

## Non vérifié
- Automatisation iPhone verrouillé (au-delà de 27 s, SideStore demande le premier plan).
- Specs : certificat auto-signé sur iPhone (`swift-certificates`), Bonjour depuis Rust sous Windows (`mdns-sd`), lecture du stockage iOS, noms des notifications iOS de Pulse.
- Plantage `swift-package` (signal 11) au premier build, pas reproduit. Comportement si `mac-ani.jkcoxson.com` tombe.
- Hook git `commit-msg` : jamais déclenché par une vraie ligne `Co-Authored-By`.
- Maquettes V2 : rendu jamais ouvert par Claude (vu par Evan) ; passage automatique Appairage → Accueil dans le canevas pas testé.
- Coût batterie de l'aperçu plein écran sur l'iPhone : inconnu, à mesurer en phase 4.

## Pièges à retenir
- iPhone en USB : couper son partage de connexion, sinon Windows route `192.168.1.x` par l'iPhone (erreur 10060).
- Un seul VPN actif sur iOS : LocalDevVPN coupe WireGuard.
- 2FA xtool sans code : compte secondaire dans Mail sur l'iPhone, connexion sur account.apple.com, recopier le code (xtool-org/xtool#368).
- Pas de `xtool dev build --ipa` (`zip` absent) : zip en Python ([[Serveur]]). Build : pousser d'abord (accord d'Evan), puis `git -C src pull` sur le serveur.
- Pare-feu du serveur : on n'y touche pas ; le `.ipa` passe par `scp` puis Evan.
- Pas de Python sur le PC : éditer avec l'outil d'édition.
- Canevas des maquettes : un texte variable `{{…}}` est rendu dans un `<span>` ; ne jamais styler « `.x span` » (bug du bouton Pause en V1). Le hook d'édition interdit `edits` à la publication : Edit puis publier.

## Prochaine étape
Session suivante (après lundi 2026-11-02, 20 h) — **phase 1 : premier code de `Core - Appairage QR` côté PC** :
1. Noter le rafraîchissement de lundi dans le journal. S'il a raté : corriger le raccourci d'abord, pas de phase 1.
2. Accord écrit d'Evan pour la phase 1 et validation des 3 specs.
3. `protocol/hyphn.proto` + `apps/desktop/` (Rust) : identité et certificat (E1), QR (E2), jeton (E3), TLS épinglé (E4), `PairRequest` (E5).
4. Preuve : `cargo test` vert sur les refus (jeton expiré, réutilisé, mauvaise empreinte, mauvaise version).

Commande pour commencer : `/session-start phase 1 : Core - Appairage QR côté PC`.
