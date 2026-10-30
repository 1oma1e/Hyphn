# Points « à tester » du cahier

Ce que la recherche du 2026-10-29 a confirmé, et ce qui reste à mesurer sur le vrai matériel. Liens dans [[SOURCES]].

| Point du cahier | Ce que dit la recherche | Statut | Quand on le teste |
|---|---|---|---|
| **Santé batterie et cycles par câble sur iOS 26** | Lisible par le service diagnostics (IORegistry, entrée `AppleSmartBattery`) avec libimobiledevice, pymobiledevice3 ou go-ios. Sur les iOS récents, les capacités sont rangées **dans `BatteryData`** et plus au premier niveau. Le « % de santé » des Réglages **n'est pas** un simple rapport de capacités : on ne doit pas l'inventer. Rien de publié sur iOS 26 exactement. | Probable, **non vérifié** | Phase 1 (Pulse), un essai `idevicediagnostics ioregentry AppleSmartBattery` sur l'iPhone d'Evan → [[ADR-0006 Sante batterie par cable]] |
| **Extensions avec xtool** (ReplayKit pour le partage d'écran) | Pas encore fiables : binaire vide (#313), signature qui échoue en 1.21.0 (#379) ; correctifs proposés (PR #320, #393), fusion non vérifiée. | Confirmé : **plus tard** | Revoir à chaque version de xtool (à noter dans STATE quand une version corrige) |
| **Débits HEVC** (1080p30 à 4K60) | Les fourchettes du cahier sont cohérentes avec le marché (DroidCam fait du 4K60 HEVC, NDI HX3 tourne vers 50 Mb/s). Aucune source fiable ne donne la latence de bout en bout. | À **mesurer** | Phase 4 (1080p30) et 5 (4K60), avec le débit réel et la latence notés dans `docs/research/` |
| **Caméra en arrière-plan** | Le cahier dit « non ». Rien trouvé qui change ça pour une app sans droits spéciaux. | Confirmé : non | — |
| **Envoi quand l'app passe en arrière-plan** (nouveau) | iOS tue vite une app en arrière-plan (≈ 30 s rapportés). Apple conseille, pour les gros fichiers, **une session URLSession d'arrière-plan avec des transferts reprenables**. Ça marche avec un serveur HTTP(S), pas avec un socket maison. | Piste forte, **non vérifié** | Phase 2 → [[ADR-0005 Drop par HTTPS et blocs]] |
| **Webcam virtuelle sans admin** (nouveau) | `MFCreateVirtualCamera` : Windows 11 build 22000+, un seul type (`SoftwareCameraSource`) ; « pour tous les utilisateurs » = admin. La DLL de VCamSample s'enregistre dans HKLM = admin **une fois** à l'installation. | Confirmé par la doc | Phase 5 |
| **SideStore sur iOS 26** | Guides de mars et juin 2026 : iloader une fois, puis SideStore + LocalDevVPN ; LocalDevVPN connecté pendant chaque rafraîchissement. | Confirmé par des guides | Phase 0 |
| **Serveur anisette perso** | `dadoum/anisette-v3-server` (port 6969, un volume, `--restart always`) est un des serveurs conseillés par SideStore ; HTTPS conseillé mais pas obligatoire. Testé le 2026-10-30 : v2.2.2 (image du 2026-10-01) répond depuis le PC. Piège : monter tout `~/.config/anisette-v3/`, pas seulement `lib/` ([[Serveur]]). | **Vérifié** | Fait (phase 0) |
| **« Température » de l'iPhone** (nouveau) | Une app iOS n'a pas la température en °C : seulement `ProcessInfo.thermalState` (4 niveaux). Le cahier dit « température » : partout dans l'app on affichera l'**état thermique**, jamais des degrés. | Confirmé (API publique) | Phase 1 (Pulse) |
| **Limite d'apps gratuites** | 3 apps actives (SideStore compris) d'après le cahier et les guides. Une limite d'identifiants d'app par semaine est souvent citée pour les comptes gratuits : **non vérifiée** ici. | À vérifier | Phase 0 |

Liens : [[ROADMAP]], [[Concurrents et projets open source]]
