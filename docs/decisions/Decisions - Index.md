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
| [[ADR-0015 Lien permanent et connexion au premier plan]] | Appairage permanent jusqu'à « Oublier » ; connexion et Pulse seulement quand l'app iPhone est ouverte | accepte (2026-10-31) |
| [[ADR-0016 Design visuel V2]] | Maquettes visuelles cliquables ; fond « trame », couleurs, Geist, menus ; écrans concis | accepte (2026-10-31) |
| [[ADR-0017 Pulse integre sans page]] | Pas de page Pulse : infos sur l'Accueil PC et sur l'aperçu Cam | accepte (2026-10-31) |
| [[ADR-0018 Cam image seule et demarrage en pause]] | Pas de son ; Cam démarre en pause (écran d'attente) ; aperçu plein écran sur l'iPhone + écran noir | accepte (2026-10-31) |

Liens : [[00-Accueil]]
