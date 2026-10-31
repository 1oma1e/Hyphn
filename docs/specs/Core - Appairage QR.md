---
type: spec
phase: 1
statut: brouillon
---
# Core — Appairage QR

## But
Relier l'iPhone d'Evan à son PC en scannant un QR code, sans compte, en local, chiffré. Après ça, chaque appareil connaît le certificat de l'autre et refuse tout autre appareil.

## Hors périmètre
- Reconnexion aux lancements suivants : [[Core - Reconnexion]].
- Pulse et tout autre module.
- « Saisir le code à la main » (sans caméra) : plus tard ; il devra transmettre l'empreinte du PC autrement que par le QR.
- Plusieurs PC ou plusieurs iPhone : un seul de chaque en phase 1.
- Android, câble USB.

## Parcours
[[Parcours - Scan QR]] (premier appairage), écrans [[PC - Appairage]] et [[iPhone - Scan QR]].

## Exigences
- **E1 — Identités.** Au premier lancement, chaque app crée une paire de clés et un certificat auto-signé, gardés pour toujours : dans le Keychain sur l'iPhone, dans un fichier lisible seulement par l'utilisateur sur le PC. L'empreinte, c'est le SHA-256 du certificat.
- **E2 — QR.** Le PC affiche un QR qui contient : version du protocole, IP et port du PC, empreinte du PC, jeton aléatoire de 128 bits. Préfixe `hyphn://pair?` pour reconnaître un QR Hyphn. Rien de secret à long terme.
- **E3 — Jeton.** Il sert une seule fois et expire au bout de 2 minutes. « Nouveau QR » l'annule et en crée un autre.
- **E4 — Connexion.** L'iPhone ouvre un TCP + TLS 1.3 vers l'IP et le port du QR. Il accepte le certificat du PC **seulement** si son empreinte est celle du QR, et présente son propre certificat (TLS mutuel).
- **E5 — Échange.** Dans le tunnel, l'iPhone envoie `PairRequest` (jeton, nom de l'appareil, modèle, version de l'app). Le PC vérifie le jeton. Format : Protobuf préfixé par sa longueur, fichier `protocol/hyphn.proto`.
- **E6 — Code à 4 chiffres** (choix d'Evan, 2026-10-31). Les deux côtés affichent le même code, tiré des deux empreintes. L'appareil n'est gardé que si Evan touche « Oui, relier » sur l'iPhone **et** clique « Oui » sur le PC.
- **E7 — Mémoire.** Après accord, le PC garde l'empreinte de l'iPhone et son nom. L'iPhone garde l'empreinte du PC, son nom et sa dernière IP et son port (Keychain).
- **E8 — Fin.** Le PC affiche la carte « iPhone d'Evan » sur [[PC - Accueil]] ; l'iPhone passe à l'écran « Appairé » de [[iPhone - Accueil]].
- **E9 — Permissions iOS.** `Info.plist` : `NSCameraUsageDescription`, `NSLocalNetworkUsageDescription`, `NSBonjourServices` = `_hyphn._tcp` (sert à [[Core - Reconnexion]]). À ajouter par `xtool.yml`, relu à la main ([[RULES]]).
- **E10 — Lien permanent.** Une fois relié, l'iPhone et le PC restent liés pour toujours : on ne re-scanne jamais, même après un redémarrage ou une mise à jour. Le lien ne se défait **qu'à la main**, par le bouton « Oublier » dans les Réglages ([[iPhone - Reglages]], [[PC - Reglages]]) ; il efface l'empreinte de l'autre, et l'autre côté le voit à la connexion suivante (choix d'Evan, 2026-10-31).

## Cas limites
| Cas | Ce qui se passe |
|---|---|
| Caméra ou réseau local refusé | Messages de [[iPhone - Scan QR]] + bouton qui ouvre Réglages |
| QR qui ne commence pas par `hyphn://` | « Ce QR code ne vient pas de Hyphn. » |
| Jeton expiré ou déjà utilisé | Le PC refuse ; l'iPhone affiche « Ce QR a expiré… » |
| Empreinte du PC ≠ celle du QR | Connexion coupée avant tout envoi ; « PC introuvable ou faux QR » |
| Version du protocole différente | « Mets à jour Hyphn sur le PC / l'iPhone » |
| Plusieurs cartes réseau sur le PC | On met dans le QR l'IP de la carte choisie ; on ignore VPN, Docker, Hyper-V ([[PC - Appairage]]) |
| Pare-feu Windows / réseau public | Messages de [[PC - Appairage]] |
| Evan touche « Non » | Rien n'est gardé, des deux côtés |

## Preuve
1. Tests automatiques côté PC (`cargo test`) : jeton expiré, jeton réutilisé, mauvaise empreinte, mauvaise version → refus.
2. Sur le vrai matériel : scan → carte sur le PC. **Moins de 3 s sans compter le temps de décision d'Evan** (porte de la phase 1) : (lecture du QR → code affiché) + (dernier « Oui » → carte affichée). Lu dans les journaux horodatés des deux apps, 5 essais, notés dans le journal de session.
3. Faux QR (empreinte modifiée à la main) → refus. Capture.

## À vérifier avant le code
- Créer un certificat auto-signé sur l'iPhone : le Security framework ne le fait pas seul. Piste : `swift-certificates` d'Apple (paquet SwiftPM, donc compatible xtool). Non vérifié.
- Épinglage côté iPhone : `sec_protocol_options_set_verify_block` de Network.framework (doc Apple « Creating an Identity for Local Network TLS »). Côté PC : vérificateur personnalisé de `rustls`. Non vérifié.

Le port : fixe, avec repli au hasard s'il est pris ([[Core - Reconnexion]], E8).

Liens : [[Specs - Index]], [[ROADMAP]]
