# Règles

Source unique des règles du projet. Les règles **sans exception** sont aussi imposées par la machine (colonne « Imposée par ») ; les autres sont des consignes que Claude applique avec jugement. Une règle ignorée deux fois devient un hook ou un `deny`.

## Méthode
| Règle | Imposée par |
|---|---|
| Ordre : doc → maquette → spec → code. Pas de code sans spec validée par Evan ([[ADR-0008 Une spec par fonctionnalite]], proposé) | — |
| Chaque fonctionnalité a une preuve : un test, une mesure ou une capture, notée dans le journal | — |
| Une session = un objectif + sa preuve, annoncés au début | skill `/session-start` |
| `docs/STATE.md` est réécrit à chaque fin de session | skill `/session-end` |
| `docs/CAHIER.md` ne change jamais ; on le corrige par un ADR | `deny Edit(./docs/CAHIER.md)` |
| Liens du vault valides, chaque ADR a un statut et est dans l'index | `tools/check-docs.ps1` (hook SessionStart) |
| Une idée non demandée va dans [[IDEES]] et se propose ; elle ne se code pas | — |
| Chercher avant de créer (docs, code, projets open source) : zéro doublon | — |

## Git
| Règle | Imposée par |
|---|---|
| Aucune ligne `Co-Authored-By: Claude` | hook git `.githooks/commit-msg` |
| Commit seulement avec l'accord d'Evan ; push seulement s'il le demande | `ask` sur `git push` |
| Conventional Commits en anglais (`feat:`, `fix:`, `docs:`…) | — |
| Rien de lourd, généré ou secret dans git | `.gitignore` |

## Sécurité
| Règle | Imposée par |
|---|---|
| Aucun secret (Apple ID, mot de passe, données anisette, certificats) dans le repo, les logs, les docs ou les réponses | `deny Read` sur `.env`, `secrets/`, `*.p12`, `*.mobileprovision` |
| Tout est local : aucun compte, aucun cloud, rien d'ouvert sur internet. Seule exception : l'anisette publique pour signer ([[ADR-0012 Anisette Mac publique]]) | — |
| Appairage par QR avec jeton à usage unique ; certificat de l'autre appareil épinglé ; une empreinte qui change = refus + message clair | — |
| Tout ce qui passe sur le réseau est chiffré (pas de mode « HTTP clair » comme LocalSend) | — |
| Sur le serveur : ne jamais toucher aux autres conteneurs, au pare-feu ni à Nginx Proxy Manager | `ask` sur `ssh * docker rm`, `ssh * sudo` |

## Énergie (iPhone) — obligatoires dans le code
1. Aucune boucle de polling : tout sur événements (notifications batterie et thermique).
2. Bonjour actif seulement quand l'app est ouverte ; connexion de contrôle et Pulse seulement quand l'app est au premier plan ; sockets de données (Cam, Drop) fermées après 30 s d'inactivité ([[ADR-0015 Lien permanent et connexion au premier plan]]).
3. Encodage et décodage **matériels** uniquement ; jamais de traitement d'image sur le CPU.
4. Envois groupés : gros blocs plutôt que milliers de petits messages.
5. Mode économie d'iOS respecté : qualité réduite automatiquement.
6. Budget mesuré en phase 1 (% de batterie par heure et température, par mode) ; chaque version comparée au budget.
7. Sous 15 % sans charge : alerte sur le PC et qualité réduite.
8. Pendant un stream : pas d'aperçu sur l'iPhone, mode écran noir, luminosité au minimum, HDR coupé par défaut.
9. Adaptation thermique : nominal/fair = réglages demandés ; serious = 60 → 30 fps et débit −30 % ; critical = 1080p30 + alerte sur le PC.

## iOS
- Build et installation seulement par xtool sur le serveur ; rien ne suppose un Mac.
- Toujours le même Apple ID secondaire et le même identifiant d'app.
- Pas d'extension d'app tant que xtool ne les construit pas de façon fiable.
- `xtool.yml` relu à la main après chaque modification (les clés mal écrites sont ignorées sans erreur).
- Une API Apple dont on doute se vérifie dans la doc Apple, pas de mémoire.

## PC
- L'app PC tourne sans droits admin ; seule l'installation de la webcam virtuelle les demande, une fois.
- Une API Windows se vérifie sur Microsoft Learn.
- Pas de tampon vidéo par défaut côté PC (latence) ; tampon audio réglable.

## Infos et vérification
- Ne jamais inventer un chiffre : sans mesure, afficher « inconnu ». Pas de « % santé batterie » calculé ([[ADR-0006 Sante batterie par cable]]).
- Dire ce qui a réellement été lancé et son résultat ; ce qui n'est pas testé est « non vérifié ».

Liens : [[ARCHITECTURE]], [[00-Accueil]]
