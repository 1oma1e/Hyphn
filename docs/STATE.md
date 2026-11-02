# État du projet

Mis à jour : 2026-11-02 (session « liaison par câble USB, première passe sur la latence »). Réécrit à chaque `/session-end`.

## Phase
**1 — Socle**, depuis le 2026-10-31 ([[ADR-0020 Phase 1 sans attendre le rafraichissement]]). Cam v1, Cam v2 et Drop v1 commencés en avance. Porte de la phase 1 : [[ROADMAP]].

## Fait (confirmé par Evan sur son iPhone 16 Pro Max et son PC)
- App iPhone `apps/ios/` (xtool sur le serveur, SideStore) et app PC `apps/desktop/` : appairage QR + code à 4 chiffres, TLS 1.3 épinglé, reconnexion, infos de l'iPhone.
- Cam en direct dans la fenêtre et dans la webcam Windows « Hyphn » (Discord) ; miroir, tourner, écran d'attente néon en 18 langues ; aperçu en coin pendant la pause.
- Service caméra de Windows rechargé quand il garde une vieille DLL ([[ADR-0026 Recharger le service camera de Windows]]).
- Liaison gardée en arrière-plan, « Reconnecter », journal de la liaison des deux côtés.

## Fait, pas encore confirmé par Evan
- **Drop v1** (commits du 2026-11-01) : part de l'iPhone, le PC confirme, tri par mois, anti-doublon ([[ADR-0029 Drop guide avec anti-doublon des la v1]], [[ADR-0030 Drop commence sur l'iPhone et le PC confirme]]).
- **Liaison par câble USB** ([[ADR-0031 Liaison par cable USB]], [[Core - Liaison par cable]]) : premier essai raté (iPhone sur l'écran d'accueil, écoute arrêtée), corrigé dans 0.8.0 (13).
- **Latence** : files plus courtes sur l'iPhone et le PC, débit « Auto » relevé (×1,5 par câble). Evan voit encore un petit retard voix / lèvres et des micro-saccades (1080p60 à 80 Mb/s en Wi-Fi).
- Tests : `cargo test` dans `apps/desktop/src-tauri/` → 80 passent. App iPhone 0.8.0 (13) dans `F:\Hyphn\out\Hyphn.ipa`.

## Pas fait
- Mesure de latence verre à verre (porte phase 4) ; iPhone visible en moins de 3 s après le scan (porte phase 1).
- Specs en brouillon à valider par Evan : [[Cam - Latence et fluidite]], [[Cam - Reglages avances]], [[Cam - Filtres et effets]], [[Cam - Ecrans d'attente]].
- ADR proposés à trancher : [[ADR-0032 Profils de puissance au lieu de la protection batterie]], [[ADR-0033 Traduction locale du message d'attente]], [[ADR-0034 Ou appliquer les filtres de la Cam]].
- Notification Windows de batterie faible ; batterie par câble ([[ADR-0006 Sante batterie par cable]]).
- Notes texte de `docs/maquettes/` en retard sur l'app (V2, néon, Drop).
- `CLAUDE.md` (Commandes) ne cite pas `tools/build-native.ps1` : à ajouter par Evan.

## Non vérifié
- Câble avec 0.8.0 (13) ; débit réel de usbmux ; faut-il « Trust » pour usbmux.
- Gain de latence en ms (aucune mesure chiffrée).
- Source « Hyphn (iPhone) » dans OBS ; webcam dans Teams et le navigateur ; installateur lancé pour de vrai.
- Coût batterie et CPU pendant le flux ; 1 h de stream (porte phase 5).

## Pièges à retenir
- Build iOS : pousser d'abord, puis `git -C src pull` sur le serveur ; `.ipa` zippé en Python, copié par `scp` dans `F:\Hyphn\out` ([[Serveur]]). Essai sans pousser : copier `Sources` et `Info.plist` dans `~/hyphn/xtool/try/ios` **sans supprimer**.
- `npm run build` échoue si Hyphn tourne : la quitter par l'icône près de l'horloge. Claude n'a pas le droit de la fermer. Les changements Rust ne s'appliquent qu'après relance.
- Journal de la webcam : `C:\ProgramData\Hyphn\vcam.log`. Journal iPhone : Réglages › « Journal de la liaison ».
- Popup « Trust This Computer » : une seule fois par PC ; pour la revoir, Settings › General › Transfer or Reset iPhone › Reset › Reset Location & Privacy.
- Câble : il faut iTunes ou « Apple Devices » sur le PC (service usbmux, port 27015).
- Port 8765 pris par « Drivn », 9333 par un `ssh.exe`.

## Prochaine étape
Session « latence, fluidité, qualité » :
1. Essai du câble avec 0.8.0 (13), puis mesure verre à verre en Wi-Fi et en câble ([[Latence et debit Cam]]).
2. Evan tranche ADR-0032 (profils) et valide [[Cam - Latence et fluidite]] ; puis code : débit qui suit le lien, mode faible latence de VideoToolbox, temps par étape dans « Infos du flux ».
3. Maquette des réglages par-dessus l'image ([[Cam - Reglages avances]]).
4. Ensuite, dans l'ordre d'Evan : filtres ([[Cam - Filtres et effets]]), puis écrans d'attente ([[Cam - Ecrans d'attente]]).

Commande pour commencer : `/session-start Latence et fluidité de la Cam : mesurer, profils de puissance, débit qui suit le lien`.
