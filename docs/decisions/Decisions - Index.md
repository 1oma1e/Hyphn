# Décisions (ADR)

Une décision par fichier, numérotée. Modèle : `_modele.md`. Statuts : `propose` (attend Evan), `accepte`, `remplace`.

| ADR | Sujet | Statut |
|---|---|---|
| [[ADR-0001 Methode de travail]] | STATE unique, journal par session, skills, hooks, reviewer | accepte (2026-10-29) |
| [[ADR-0002 Docs dans le vault Obsidian]] | `Hyphn/docs` = vault Obsidian | accepte (2026-10-29) |
| [[ADR-0003 Commits sans attribution]] | Hook git qui refuse `Co-Authored-By: Claude` | propose |
| [[ADR-0004 Nom Hyphn]] | Garder le nom Hyphn | propose |
| [[ADR-0005 Drop par HTTPS et blocs]] | Drop Wi-Fi en HTTPS par blocs, envoi qui continue en arrière-plan | propose |
| [[ADR-0006 Sante batterie par cable]] | Valeurs brutes de la batterie, pas de « % santé » inventé | propose |
| [[ADR-0007 Porte de la phase 0]] | Phase 1 dès le premier rafraîchissement auto réussi | accepte (2026-10-31) |
| [[ADR-0008 Une spec par fonctionnalite]] | Spec avant code, relue par le reviewer | propose |
| [[ADR-0009 Serveur et Mac]] | Build sur le Debian 192.168.1.63 ; Mac + Xcode seulement à la fin | accepte (2026-10-29) |
| [[ADR-0010 Rangement du serveur]] | `~/hyphn/<service>`, noms `hyphn-`, ports LAN seulement | propose |
| [[ADR-0011 xtool en Docker]] | Image officielle xtool 1.24.0 figée, `~/hyphn/xtool`, SDK dans un volume | accepte (2026-10-30) |
| [[ADR-0012 Anisette Mac publique]] | Anisette `mac-ani.jkcoxson.com` (Apple refuse l'anisette Android), exception au « tout local » | accepte (2026-10-30) |
| [[ADR-0013 Build iOS par clone Git]] | Clone du repo sur le serveur (clé de déploiement lecture seule), bundle ID `io.github.1oma1e.hyphn`, `.ipa` zippé en Python | accepte (2026-10-31) |
| [[ADR-0014 Pas de plan B AltServer]] | Pas d'AltServer-Linux + netmuxd ; on surveille le rafraîchissement SideStore | accepte (2026-10-31) |
| [[ADR-0015 Lien permanent et connexion au premier plan]] | Appairage permanent jusqu'à « Oublier » ; connexion et infos de l'iPhone seulement quand l'app iPhone est ouverte | accepte (2026-10-31) |
| [[ADR-0016 Design visuel V2]] | Maquettes visuelles cliquables ; fond « trame », couleurs, Geist, menus ; écrans concis | accepte (2026-10-31) |
| [[ADR-0017 Pulse integre sans page]] | Pas de page Pulse : infos sur l'Accueil PC et sur l'aperçu Cam | accepte (2026-10-31) |
| [[ADR-0018 Cam image seule et demarrage en pause]] | Pas de son ; Cam démarre en pause (écran d'attente) ; aperçu plein écran sur l'iPhone + écran noir | accepte (2026-10-31) |
| [[ADR-0019 App PC en premier avec iPhone simule]] | App PC complète avant la phase 1, iPhone simulé dans un module `demo` | accepte (2026-10-31), simulation retirée par ADR-0020 |
| [[ADR-0020 Phase 1 sans attendre le rafraichissement]] | Phase 1 tout de suite ; appairage validé sur l'iPhone seul ; ordre appairage, Accueil, Cam ; Drop vide | accepte (2026-10-31) |
| [[ADR-0021 Plus de module Pulse]] | Le nom Pulse disparaît : deux modules (Cam, Drop) + les infos de l'iPhone | accepte (2026-10-31) |
| [[ADR-0023 Connexion gardee et reconnexion facile]] | Liaison gardée en arrière-plan (~30 s), essais toutes les 5 s, « Reconnecter » des deux côtés, reprise du direct en 5 min, écran d'attente en miroir dans la webcam | accepte (2026-11-01), miroir retiré par ADR-0024 |
| [[ADR-0022 Webcam Windows par DLL qui decode]] | Phase 5 en avance : DLL Media Foundation qui décode le flux compressé reçu par tuyau nommé ; plugin OBS ; écran d'attente Animé ou Minimal | accepte (2026-10-31) |
| [[ADR-0024 Ecran d'attente a l'endroit dans la webcam]] | La webcam envoie l'écran d'attente à l'endroit : les autres le lisent sur Discord (plus de miroir) | accepte (2026-11-01) |
| [[ADR-0025 Tourner applique par l'iPhone]] | Bouton « Tourner » (90° par clic) à côté du miroir, appliqué par l'iPhone (`CamControl.turn`) | accepte (2026-11-01) |
| [[ADR-0026 Recharger le service camera de Windows]] | Le service caméra de Windows garde l'ancienne DLL : arrêté après l'installation, et au lancement si la DLL chargée n'est pas la bonne (A+) | accepte (2026-11-01) |
| [[ADR-0027 Apercu en coin pendant la pause]] | En pause, petit aperçu (15 images/s, 1,5 Mb/s) dans un coin de la fenêtre PC seulement, quand la page Cam est visible ; jamais vers la webcam ni OBS | accepte (2026-11-01) |
| [[ADR-0028 QR plus petit et lecture rapide]] | QR 25×25 (empreinte 96 bits, jeton 48 bits, 1 min), zoom selon la mise au point, caméra coupée après la lecture | accepte (2026-11-01) |

Liens : [[00-Accueil]]
