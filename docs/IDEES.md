# Idées de fonctionnalités

Idées à ajouter petit à petit. **Aucune n'est validée** : Evan choisit, puis l'idée passe dans la [[ROADMAP]] et reçoit une spec. Classement : valeur (★ à ★★★) et effort (S = quelques heures, M = quelques jours, L = une semaine ou plus). Source : cahier, concurrents ([[Concurrents et projets open source]]) et maquettes.

## Phase 0 — Fondations (infra)
| Idée | Valeur | Effort | Pourquoi |
|---|---|---|---|
| Journal automatique des rafraîchissements SideStore (date + réussi) sur le serveur | ★★★ | S | Preuve de la porte de phase 0 sans compter à la main |
| Healthcheck Docker de l'anisette + alerte (ntfy ou e-mail) si elle tombe | ★★ | S | Une anisette morte = plus de rafraîchissement |
| Script `infra/` qui reconstruit le `.ipa` (pull + build + zip, voir [[Serveur]]) ; le servir sur le réseau local demande un port ouvert par Evan sur le pare-feu du serveur | ★★ | S | Installer une nouvelle version en 2 touches dans SideStore |
| Raccourci iOS : couper WireGuard → LocalDevVPN → Refresh All → remettre WireGuard (« Set VPN » marche avec LocalDevVPN, vérifié le 2026-10-31) | ★★ | S | iOS n'accepte qu'un VPN à la fois |
| Revenir à une anisette locale dès qu'un outil annonce Android pour la connexion et Mac pour le jeton (méthode Apparition) | ★★ | M | Ne plus dépendre de `mac-ani.jkcoxson.com` ([[ADR-0012 Anisette Mac publique]]) |

## Phase 1 — Socle
| Idée | Valeur | Effort | Pourquoi |
|---|---|---|---|
| ~~Code à 4 chiffres affiché des deux côtés après le scan~~ : **retenu** le 2026-10-31 ([[Core - Appairage QR]]) | ★★★ | S | Bloque un faux QR (attaque de l'homme du milieu) pour un coût minime |
| Rappel « SideStore à rafraîchir » quand le profil expire dans < 2 jours (date lue dans l'app) | ★★★ | S | Évite l'app qui ne s'ouvre plus |
| Icône dans la zone de notification Windows avec l'état de l'iPhone | ★★ | S | Pulse visible sans ouvrir la fenêtre |
| Reconnexion sans Bonjour (dernière IP connue) si le routeur bloque le multicast | ★★ | S | Certains routeurs/box filtrent Bonjour |
| Appairage par câble (pas de QR) quand l'iPhone est branché | ★ | M | Pratique, mais le QR suffit |

## Phase 2-3 — Drop
| Idée | Valeur | Effort | Pourquoi |
|---|---|---|---|
| « Tout ce qui est nouveau depuis la dernière fois » en un bouton | ★★★ | S | Le cas d'usage n°1 : vider le téléphone |
| Bouton « Libérer l'iPhone » : liste ce qui est sauvegardé (hash vérifié) et propose de le supprimer dans Photos | ★★★ | M | Le vrai but de la sauvegarde ; la suppression reste faite par Evan dans Photos |
| Envoi d'un lien ou d'un texte PC ↔ iPhone (presse-papiers manuel) | ★★ | S | Très demandé, petit effort sur le canal existant |
| Glisser-déposer d'un dossier PC vers le dossier Hyphn de l'iPhone | ★★ | S | PC → iPhone simple |
| Sauvegarde vers le serveur Linux (en plus du PC) | ★★ | M | Le serveur est allumé 24/7 |
| Conversion HEIC → JPEG en option côté PC | ★ | S | Compatibilité avec de vieux logiciels |

## Phase 4-5 — Cam
| Idée | Valeur | Effort | Pourquoi |
|---|---|---|---|
| Profils (Appel, Stream, Cours) applicables en un clic | ★★★ | S | Prévu par le cahier, gros confort |
| Test réseau avant le stream (débit, latence) → résolution conseillée | ★★★ | S | Évite de lancer un 4K60 qui va saccader |
| Mesure de latence « verre à verre » (chronomètre filmé) | ★★ | S | Preuve chiffrée de la phase 4 |
| Micro de l'iPhone comme micro Windows | ★★ | L | Il faut aussi un micro virtuel |
| Deux iPhone en même temps (deux caméras) | ★ | M | Neon montre que plusieurs caméras virtuelles sont possibles |
| Sortie NDI ou SRT pour d'autres logiciels | ★ | M | Idée prise à NDI HX Camera |
| Cadrage automatique (suivi du visage) | ★ | L | Coûte en calcul, contraire aux règles d'énergie : seulement si l'iPhone le fait en matériel |

## Phase 6 — Finition
| Idée | Valeur | Effort | Pourquoi |
|---|---|---|---|
| Rapport « énergie » par session (batterie consommée, temps chaud) | ★★ | S | Prouve que le budget est tenu |
| Page d'aide intégrée (brouillons TikTok, chauffe, SideStore) | ★★ | S | Déjà dans les maquettes |

## Plus tard
| Idée | Valeur | Effort | Pourquoi |
|---|---|---|---|
| Partage d'écran de l'iPhone (ReplayKit) | ★★ | L | Bloqué par les extensions xtool |
| App Linux (v4l2loopback) | ★ | M | Le serveur et d'autres PC Linux |
| Android (Samsung) | ★★★ | L | Phase 7, prévu |

Liens : [[00-Accueil]]
