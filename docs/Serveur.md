# Serveur de build

Ce que Hyphn fait tourner sur le serveur Linux d'Evan, et comment c'est rangé. Choix du serveur : [[ADR-0009 Serveur et Mac]].

## Machine (relevé du 2026-10-30, lecture seule)
- `evan@192.168.1.63`, Debian 13 (trixie), x86_64, Wi-Fi (`wlp2s0`).
- Disque 226 Go (183 Go libres), RAM 7,6 Go (5,8 Go dispo), swap 7,8 Go.
- Docker 28.5.2, Docker Compose v2.40.3.
- Autres conteneurs d'Evan (on n'y touche **jamais**) : Home Assistant, Nginx Proxy Manager (seul à écouter sur 80/443 publics), cloudflare-ddns, pairdrop, ollama, tv-accueil, apphome.

## Rangement
- Tout Hyphn vit dans `~/hyphn/` (droits 700), **un dossier par service** : `~/hyphn/anisette/`, `~/hyphn/xtool/`, plus tard `~/hyphn/altserver/`.
- Chaque dossier contient le `docker-compose.yml` copié depuis `infra/<service>/` du repo. Le repo est la source : on modifie dans le repo, puis on copie.
- Noms Docker préfixés `hyphn-` (projet, conteneur, volume, réseau) pour les reconnaître d'un coup d'œil.
- Ports liés à `192.168.1.63` seulement, jamais `0.0.0.0` : rien n'est joignable depuis internet, même si un port était transféré sur la box.

## Anisette
- Conteneur `hyphn-anisette`, image `dadoum/anisette-v3-server:latest` (v2.2.2, image du 2026-10-01), port `192.168.1.63:6969`, `restart: always`.
- Rôle : fournir les en-têtes `X-Apple-I-MD*` qu'Apple exige pour se connecter avec un Apple ID hors d'un appareil Apple. xtool et SideStore les demandent ici.
- Volume `hyphn-anisette_data` monté sur **tout** `~/.config/anisette-v3/` du conteneur. Le README officiel ne monte que `lib/` : l'identité (`adi.pb`, `device.json`) serait alors perdue à chaque recréation et Apple verrait un nouvel appareil. Vérifié : identité identique après `restart` et après `up -d --force-recreate`.
- Ce volume et les logs du conteneur contiennent des données anisette : **secrets**, ils ne quittent jamais le serveur. Logs limités à 3 × 10 Mo.
- Durcissement : `no-new-privileges`, toutes les capacités Linux retirées, mémoire limitée à 512 Mo (≈ 155 Mo utilisés).

### Commandes (dans `~/hyphn/anisette/`)
| But | Commande |
|---|---|
| État | `docker compose ps` |
| Logs | `docker compose logs --tail 50` |
| Mettre à jour l'image | `docker compose pull && docker compose up -d` |
| Tester depuis le PC | `curl http://192.168.1.63:6969` → JSON avec `X-Apple-I-MD` et `X-Apple-I-MD-M` |

À ne **pas** faire : `docker compose down -v` (efface l'identité ; SideStore devrait se reconnecter).

## xtool
- Image officielle `ghcr.io/xtool-org/xtool:1.24.0` (Swift 6.4.1 + xtool, 4,4 Go), version **figée** dans le compose : on la monte exprès. Pas un service permanent : un conteneur jetable par commande (`docker compose run --rm`).
- Pourquoi Docker plutôt qu'une installation directe : rien n'est installé sur le système du serveur (Swift reste dans l'image), on supprime tout en une commande, et c'est le même rangement que l'anisette ([[ADR-0010 Rangement du serveur]]).
- Volume `hyphn-xtool_home` monté sur `/root` : le SDK iOS (`/root/.swiftpm/swift-sdks/darwin.artifactbundle`, ≈ 7 Go) et plus tard la session Apple de xtool. **Secret** dès qu'on s'y connecte.
- `~/hyphn/xtool/` est monté sur `/work` : il contient `Xcode_27.2.xip` (SHA-256 `c28b0552…f01978`, gardé pour reconstruire le SDK) et contiendra les sources de l'app.
- SDK installé le 2026-10-30 depuis Xcode 27.2 (iPhoneOS 27.2, mode `normal`, donc `xtool sdk update` possible), sans connexion Apple, en 2 min 38 s. L'installation télécharge aussi `OpenAppleMacros` sur internet.
- usbmuxd de l'hôte (1.1.1) n'est **pas** relié au conteneur : inutile tant que l'installation sur l'iPhone passe par SideStore.

### Commandes (dans `~/hyphn/xtool/`)
| But | Commande |
|---|---|
| Aide | `docker compose run --rm xtool --help` |
| État du SDK | `docker compose run --rm xtool sdk status` |
| SDK visible par Swift | `docker compose run --rm --entrypoint swift xtool sdk list` → `darwin` |
| Mettre à jour xtool | changer le tag dans `infra/xtool/docker-compose.yml`, copier, `docker compose pull` |

Liens : [[ARCHITECTURE]], [[ROADMAP]], [[00-Accueil]]
