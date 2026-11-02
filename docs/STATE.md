# État du projet

Mis à jour : 2026-11-02 (session « latence et fluidité de la Cam »). Réécrit à chaque `/session-end`.

## Phase
**1 — Socle**, depuis le 2026-10-31 ([[ADR-0020 Phase 1 sans attendre le rafraichissement]]). Cam v1, Cam v2 et Drop v1 commencés en avance. Porte de la phase 1 : [[ROADMAP]].

## Fait (confirmé par Evan sur son iPhone 16 Pro Max et son PC)
- App iPhone `apps/ios/` (xtool sur le serveur, SideStore) et app PC `apps/desktop/` : appairage QR + code à 4 chiffres, TLS 1.3 épinglé, reconnexion, infos de l'iPhone.
- Liaison par câble USB ([[ADR-0031 Liaison par cable USB]]), avec l'app 0.8.0 (13).
- Cam dans la fenêtre et dans la webcam Windows « Hyphn » (Discord), écran d'attente néon, miroir, tourner, aperçu en pause.
- Webcam en HEVC même pendant un appel : l'app décode pour la webcam et lui envoie des images NV12 ([[ADR-0035 Webcam sans forcer le H.264]]).
- Temps par étape dans « Infos du flux » (E2 de [[Cam - Latence et fluidite]]), app iPhone 0.8.1 (14).
- Mesures (câble, HEVC) : 83 ms en 720p30, 127 ms en 4K60 de bout en bout ; détail dans [[Latence et debit Cam]].

## Fait, pas encore confirmé par Evan
- **Drop v1** ([[ADR-0029 Drop guide avec anti-doublon des la v1]], [[ADR-0030 Drop commence sur l'iPhone et le PC confirme]]).
- Info-bulles sur chaque réglage, bouton et chiffre de l'app PC (règle dans [[RULES]], PC) : vues sur une page d'essai seulement.
- SPS H.264 réécrit sur le PC (décodage sans attente) et H.264 plafonné à 1080p : utiles seulement quand le H.264 est encore utilisé.
- Tests : `cargo test` dans `apps/desktop/src-tauri/` → 92 passent. DLL webcam et plugin OBS : `tools/build-native.ps1` → OK.

## Pas fait
- Specs en brouillon à valider : [[Cam - Reglages avances]], [[Cam - Filtres et effets]], [[Cam - Ecrans d'attente]] ; dans [[Cam - Latence et fluidite]] : E3 (débit qui suit le lien), E4 (encodeur iPhone faible latence), E5, E6.
- ADR à trancher : [[ADR-0033 Traduction locale du message d'attente]]. Tranchés : [[ADR-0034 Ou appliquer les filtres de la Cam]] (tout sur le PC), [[ADR-0032 Profils de puissance au lieu de la protection batterie]] (Max par défaut, une liste de profils).
- Mesure en Wi-Fi ; but chiffré de latence (à fixer par Evan).
- Porte phase 1 : iPhone visible en moins de 3 s après le scan. Batterie par câble ([[ADR-0006 Sante batterie par cable]]) ; notification Windows de batterie faible.
- Notes texte de `docs/maquettes/` en retard sur l'app. `CLAUDE.md` (Commandes) ne cite pas `tools/build-native.ps1` : à ajouter par Evan.

## Non vérifié
- Chiffres de latence avec Discord après l'option A (Evan : « parfait », sans capture). Un SPS réel de l'iPhone réécrit.
- OBS avec la nouvelle DLL ; webcam dans Teams et le navigateur ; installateur lancé pour de vrai.
- Coût batterie et CPU pendant le flux ; 1 h de stream (porte phase 5).

## Pièges à retenir
- Build iOS : pousser d'abord, puis `git -C src pull` sur le serveur ; `.ipa` zippé en Python, copié par `scp` dans `F:\Hyphn\out` ([[Serveur]]).
- Hyphn qui tourne verrouille son `.exe` : `cargo build` et `npm run build` échouent (`cargo test` passe). La quitter par l'icône près de l'horloge ; Claude n'a pas le droit de la fermer.
- Nouvelle DLL webcam : `tools/build-native.ps1`, puis relancer l'app, qui la réinstalle (un « Oui » admin).
- « Aller-retour » dans « Infos du flux » = ping du lien, pas le retard de l'image (voir « Total »).
- Mesure verre à verre : `tools/latency-chrono.html` à côté de la fenêtre Hyphn, l'iPhone filme les deux, capture d'écran.
- Interface sans Tauri : page d'essai avec un faux `__TAURI__`, servie en local (le navigateur intégré n'exécute pas un fichier hors du projet).
- Journaux : `C:\ProgramData\Hyphn\vcam.log` (webcam) ; iPhone : Réglages › « Journal de la liaison ».
- Heredocs et Python cassent sur les apostrophes et les `\` : outil d'écriture.

## Prochaine étape
Session « réglages avancés et effets de la Cam » (demande d'Evan) :
1. Valider [[Cam - Reglages avances]] et trancher [[ADR-0032 Profils de puissance au lieu de la protection batterie]] ; maquette du panneau par-dessus l'image (aperçu en direct, Auto et Reset sur chaque réglage, un maximum de réglages de l'iPhone, info-bulle sur chacun).
2. Valider [[Cam - Filtres et effets]] : filtres caméra, flou ou remplacement du fond (comme Teams et Discord), puis effets façon Snapchat.
3. Code dans cet ordre : réglages, filtres, fond, effets visage.

Commande pour commencer : `/session-start Réglages avancés et effets de la Cam : panneau en direct, Auto/Reset, filtres, flou du fond, effets Snapchat`.
