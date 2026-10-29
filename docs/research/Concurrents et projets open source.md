# Concurrents et projets open source

Recherche du 2026-10-29. Liens dans [[SOURCES]]. Les prix et limites viennent souvent de fiches App Store ou de sites secondaires : **à revérifier** avant de s'en servir comme argument.

## Webcam avec un téléphone

| Projet | Ce qu'il fait bien | Points faibles | Ce qu'on fait mieux |
|---|---|---|---|
| **iVCam** (e2eSoft) | Windows, USB et Wi-Fi, beaucoup de tailles (jusqu'à 4K selon le téléphone), latence faible par USB | Version gratuite limitée (640×480, 15 fps, logo, pubs selon un guide universitaire non daté) ; pilote à installer ; coupures signalées en Wi-Fi instable ; pas de macOS ni Linux | Gratuit et sans logo, qualité qui baisse toute seule au lieu de couper, télémétrie sur le PC |
| **Camo** (Reincubate) | Rendu très soigné, réglages fins, très bon sur Mac | Abonnement Pro ; gratuit limité à 720p avec filigrane (sources anciennes) ; 4K pas sur tous les iPhone ; Windows peu documenté | Pas d'abonnement, 4K60 visée sur l'iPhone d'Evan, Windows d'abord |
| **EpocCam** (Elgato) | A été une référence | **Plus vendu ni mis à jour** (Elgato) ; gratuit en 640×480, Pro en 1080p | Projet vivant, au-delà du 1080p |
| **DroidCam** (Dev47) | **Plugin OBS** ; **HEVC** ; 4K60 et HDR 10 bits en Pro (preuve que c'est faisable sur iPhone) | Gratuit en définition standard, HD avec filigrane ; options utiles payantes | Tout inclus, plus Drop et Pulse dans la même app |
| **Iriun** | Simple, iPhone jusqu'à 4K selon le modèle, sans filigrane sur iPhone d'après des avis | Réglages manuels (ISO, exposition, balance) payants ; peu d'infos techniques | Réglages complets gratuits, profils enregistrés |
| **NDI HX Camera** / NDICam | Standard pro du réseau vidéo (NDI), HX3 vers 50 Mb/s, très basse latence annoncée | Payant ; il faut l'écosystème NDI sur le PC ; pas de vraie webcam Windows sans outil en plus | Webcam Windows native + OBS, sans écosystème à installer |

**Idée à garder de NDI** : un mode « réseau pro » plus tard (exposer le flux en NDI ou SRT pour d'autres logiciels) → [[IDEES]].

## Les briques open source

| Projet | Ce qu'il fait bien | Points faibles / limites | Ce qu'on en tire |
|---|---|---|---|
| **scrcpy** | Très faible latence : encodage matériel sur le téléphone, paquets bruts envoyés **sans tampon** côté PC, un fil par socket, en-têtes qui donnent la taille des paquets tout de suite | Android seulement ; l'audio demande un petit tampon | Même recette pour Cam : pas de tampon par défaut, découpage clair des paquets, un fil par socket, tampon audio réglable |
| **VCamSample** | Exemple propre de webcam virtuelle Windows 11 avec `MFCreateVirtualCamera` (DLL + petit programme) | Windows 11 seulement (build 22000) ; la DLL s'enregistre dans **HKLM** (admin une fois) ; un seul type de caméra (`SoftwareCameraSource`) ; une caméra « pour tous les utilisateurs » demande l'admin | Point de départ de `apps/desktop-vcam` ; caméra créée pour l'utilisateur courant → l'app tourne sans admin |
| **LocalSend** | Protocole REST simple sans serveur externe, découverte multicast (port 53317) avec repli HTTP, empreinte SHA-256 du certificat, envoi en parallèle, hash optionnel | **Pas de reprise** (tout ou rien par fichier) ; PIN dans l'URL ; mode téléchargement en HTTP clair ; découverte non authentifiée ; sur iOS, gros envois fragiles si l'app passe en arrière-plan | Notre différence : **reprise par blocs**, hash obligatoire, appairage par QR (pas de PIN), aucune partie en clair |
| **KDE Connect** | Appairage avec acceptation sur les deux appareils, TLS de bout en bout, app iOS maintenue (0.5.5 en mai 2026 d'après un agrégateur) | Sur iOS : fonctions réduites, soucis d'appairage après des mises à jour d'iOS (cache de certificats à vider) | Certificat épinglé à l'appairage + bouton « oublier cet appareil » clair, et un message précis quand l'empreinte change |
| **xtool** | Construit, signe et installe une app iOS depuis Linux sans Xcode ; paquet SwiftPM + `xtool.yml` | **Extensions encore fragiles** (binaire vide, signature qui échoue : issues #313, #379, correctif en PR #320/#393) ; clés mal écrites de `xtool.yml` ignorées sans erreur (#353) | App en un seul binaire sans extension ; relire `xtool.yml` à la main ; ReplayKit reste « plus tard » |
| **SideStore** | Installe et rafraîchit depuis l'iPhone avec LocalDevVPN ; un ordinateur seulement une fois (iloader) ; marche sur iOS 26 d'après des guides de 2026 | Dépend d'un serveur anisette ; 3 apps actives max (compte gratuit) ; LocalDevVPN doit être connecté pendant le rafraîchissement | Serveur anisette chez Evan (Docker), raccourci quotidien, alerte si le dernier rafraîchissement date de plus de 5 jours → [[IDEES]] |
| **libimobiledevice** | Accès par câble sans ouvrir l'app : AFC (DCIM), infos de l'appareil, diagnostics (IORegistry) | Bibliothèque C, sous Windows il faut le service Apple Mobile Device (iTunes / Appareils Apple) ; les clés de batterie bougent selon la version d'iOS | Câble pour Drop (DCIM) et Pulse (santé batterie) côté PC ; voir [[Points a tester]] |

## Ce qui ressort
1. Personne ne propose **webcam + transfert + état de l'appareil** dans une même app gratuite et locale.
2. Le 4K60 HEVC sur iPhone est faisable (DroidCam le vend), donc notre objectif est réaliste ; ce qui manque ailleurs, c'est l'**adaptation automatique** à la chauffe.
3. LocalSend, référence du transfert local, **ne reprend pas** un fichier coupé : c'est notre meilleur argument pour Drop.
4. EpocCam est mort : signe que le marché bouge et que les apps payantes abandonnent leurs clients.

Liens : [[VISION]], [[Points a tester]], [[00-Accueil]]
