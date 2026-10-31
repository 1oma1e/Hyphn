# État du projet

Mis à jour : 2026-10-31 (session « App PC complète, iPhone simulé »). Réécrit à chaque `/session-end`.

## Phase
**0 — Fondations**, en attente du premier rafraîchissement automatique (lundi 2026-11-02, 20 h). S'il réussit, la phase 1 peut commencer avec l'accord écrit d'Evan ([[ADR-0007 Porte de la phase 0]]). Phase 0 close au 2026-11-14 (14 jours). Porte : [[ROADMAP]].
Exception : l'app PC est déjà codée avec un iPhone simulé ([[ADR-0019 App PC en premier avec iPhone simule]]). Ce n'est pas le début de la phase 1.

## Fait
- Préparation, serveur, xtool en Docker, SideStore, « Hello » SwiftUI, raccourci `Refresh SideStore` lundi et jeudi 20 h : voir [[Serveur]], ADR 0011 à 0014, [[Journal des rafraichissements]].
- Specs phase 1 en brouillon : [[Core - Appairage QR]], [[Core - Reconnexion]], [[Infos iPhone - Batterie et chaleur]].
- Maquettes visuelles V2 validées ([[Maquettes - Index]], ADR 0016 à 0018).
- **App PC** `apps/desktop/` (Rust + Tauri 2, commit `c34222f`) : 5 pages au design V2 (Accueil, Appairage, Cam, Drop, Réglages).
  - Réel : identité et certificat du PC, QR `hyphn://pair?` (jeton 2 min, usage unique), code à 4 chiffres, appareil gardé jusqu'à « Oublier », réglages, règle thermique de Cam, dossiers année/mois de Drop.
  - Simulé : l'iPhone, dans `src-tauri/src/demo.rs`, le seul fichier à remplacer quand l'app iPhone existera.
  - Lancer : `npm run dev` dans `apps/desktop/`. Tests : `cargo test` dans `apps/desktop/src-tauri/` → 27 passent.

## Pas fait
- Premier rafraîchissement automatique (2026-11-02), puis 14 jours notés dans le journal.
- App PC, côté réseau : TLS épinglé (E4), `protocol/hyphn.proto` et `PairRequest` (E5), écoute sur le port, Bonjour, vérifications réseau E11 (seul « pas de réseau local » est géré), notification Windows de batterie faible.
- Notes texte de `docs/maquettes/` à remettre à jour d'après la V2.
- Où afficher les cycles batterie lus par câble ([[ADR-0017 Pulse integre sans page]]) ; spec `Pulse - Batterie par cable` après un essai `idevicediagnostics` ([[ADR-0006 Sante batterie par cable]]).
- Décider d'arrêter ou non le conteneur `hyphn-anisette` (inutilisé).
- VISION dit « appairage en 2 s », la porte dit « < 3 s » : à trancher.

## En attente d'Evan
- Après lundi 20 h : remplir la ligne du 2026-11-02 dans [[Journal des rafraichissements]].
- Valider les 3 specs et les ADR `propose` : 0003, 0004, 0005, 0006, 0008, 0010.
- Confirmer « écran noir automatique après 30 s, activé par défaut » ([[ADR-0018 Cam image seule et demarrage en pause]]).
- Essayer l'app PC lui-même et dire ce qui ne va pas.
- Optionnel : supprimer `F:\Downloads\Xcode_27.2.xip`.

## Non vérifié
- App PC : icône près de l'horloge, « Lancer avec Windows », fenêtres de choix de dossier et de fichiers, glisser-déposer depuis l'Explorateur, « Ouvrir le dossier », installateur (`npm run build`).
- Automatisation iPhone verrouillé ; plantage `swift-package` (signal 11) pas reproduit ; comportement si `mac-ani.jkcoxson.com` tombe.
- Specs : certificat auto-signé sur iPhone (`swift-certificates`), Bonjour depuis Rust (`mdns-sd`), lecture du stockage iOS.
- Hook git `commit-msg` jamais déclenché par une vraie ligne `Co-Authored-By`.
- Coût batterie de l'aperçu plein écran sur l'iPhone (phase 4).

## Pièges à retenir
- iPhone en USB : couper son partage de connexion (erreur 10060). Un seul VPN actif sur iOS.
- 2FA xtool sans code : compte secondaire dans Mail, account.apple.com, recopier le code (xtool-org/xtool#368).
- Build iOS : pousser d'abord (accord d'Evan), puis `git -C src pull` sur le serveur ; `.ipa` zippé en Python ([[Serveur]]).
- Tauri : le nonce de la CSP annule `'unsafe-inline'` → `dangerousDisableAssetCspModification: ["style-src"]`. `tauri dev` recharge la page à chaque modification de `ui/`.
- Captures de l'app sans outil de bureau : config de dev avec `additionalBrowserArgs: "--remote-debugging-port=9333"` (hors repo) + script CDP. La variable `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` est ignorée par Tauri.
- `CARGO_TARGET_DIR` global = `F:\safesweep-target` (partagé avec SafeSweep).
- Après un redémarrage de l'app, l'iPhone simulé a une nouvelle empreinte : normal en démo.

## Prochaine étape
Session suivante (après lundi 2026-11-02, 20 h) :
1. Noter le rafraîchissement de lundi dans le journal. S'il a raté : corriger le raccourci d'abord.
2. Retours d'Evan sur l'app PC, à corriger.
3. Accord écrit pour la phase 1, puis côté PC : `protocol/hyphn.proto`, écoute TLS épinglée (E4) et `PairRequest` (E5), avec des tests `cargo test` sur les refus par le réseau.

Commande pour commencer : `/session-start retours sur l'app PC puis phase 1 : TLS et PairRequest côté PC`.
