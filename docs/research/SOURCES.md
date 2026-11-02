# Sources

Toutes les sources consultées le 2026-10-29 pour préparer le projet. Chaque note de recherche renvoie ici. Une source qui n'est qu'un agrégateur ou un site de téléchargement est marquée *(secondaire)* : à confirmer avant de s'en servir pour une décision.

## Claude Code
- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) — CLAUDE.md court, skills, hooks, deny, sous-agents, `/clear`.
- [Memory / CLAUDE.md](https://code.claude.com/docs/en/memory) — moins de 200 lignes, règles par chemin dans `.claude/rules/`.
- [Skills](https://code.claude.com/docs/en/skills.md) — `disable-model-invocation: true`.
- [Hooks](https://code.claude.com/docs/en/hooks) — SessionStart, PreToolUse, Stop (code 2 = bloque).
- [Subagents](https://code.claude.com/docs/en/sub-agents.md) — `tools: Read, Grep, Glob`, `model`.
- [Permissions](https://code.claude.com/docs/en/permissions.md) — `deny` vaut dans tous les modes.

## Build et installation sans Mac
- [xtool — GitHub](https://github.com/xtool-org/xtool)
- [xtool — installation Linux](https://xtool.sh/documentation/xtool/installation-linux) (lue le 2026-10-30 : Swift 6.4, usbmuxd, Xcode 27)
- [xtool — Dockerfile et image `ghcr.io/xtool-org/xtool`](https://github.com/xtool-org/xtool/blob/main/Dockerfile)
- [xtool #313 — extension widget vide puis plantage](https://github.com/xtool-org/xtool/issues/313)
- [xtool #379 — signature des extensions qui échoue (xtool 1.21.0)](https://github.com/xtool-org/xtool/issues/379)
- [xtool #353 — clés mal écrites de xtool.yml ignorées sans erreur](https://github.com/xtool-org/xtool/issues/353)
- [xtool PR #320 — correctif des extensions](https://github.com/xtool-org/xtool/pull/320) · [PR #393](https://github.com/xtool-org/xtool/pull/393)
- [iloader — installe SideStore et le fichier d'appairage](https://github.com/nab138/iloader)
- [LocalDevVPN — App Store](https://apps.apple.com/vn/app/localdevvpn/id6755608044)
- [Guide iOS 26 : SideStore + LiveContainer (iPhoneSoft, mars 2026)](https://iphonesoft.fr/2026/03/11/guide-ios-26-installer-sidestore-livecontainer-sideloader-apps-jailbreak)
- [SideStore sur iOS (Gigazine, juin 2026)](https://gigazine.net/gsc_news/en/20260628-sidestore-sideloading-ios/)
- [anisette-v3-server (Dadoum) — Docker Hub](https://hub.docker.com/r/dadoum/anisette-v3-server)
- [omnisette-server — Docker Hub](https://hub.docker.com/r/lentin/omnisette-server)

## iPhone : batterie, câble
- [libimobiledevice](https://libimobiledevice.org/)
- [idevicediagnostics — man page](https://dyn.manpages.debian.org/jessie/libimobiledevice-utils/idevicediagnostics.1)
- [pymobiledevice3 #324 — santé batterie via ioregistry](https://github.com/doronz88/pymobiledevice3/issues/324)
- [capax #2 — iPhone 15 Pro : champs batterie imbriqués dans BatteryData](https://github.com/rnihesh/capax/issues/2)
- [orange-drink PR #8 — où iOS range les capacités selon la version](https://github.com/promptctl/orange-drink/pull/8)
- [go-ios — package diagnostics](https://pkg.go.dev/github.com/danielpaulus/go-ios/ios/diagnostics)

## Webcam et vidéo
- [Microsoft — MFCreateVirtualCamera](https://learn.microsoft.com/en-us/windows/win32/api/mfvirtualcamera/nf-mfvirtualcamera-mfcreatevirtualcamera)
- [Microsoft — MFVirtualCameraType](https://learn.microsoft.com/en-us/windows/win32/api/mfvirtualcamera/ne-mfvirtualcamera-mfvirtualcameratype)
- [VCamSample (smourier)](https://github.com/smourier/VCamSample) · [Neon, caméras multiples basées sur VCamSample](https://github.com/newdee/neon)
- [scrcpy — doc développeur](https://github.com/Genymobile/scrcpy/blob/master/doc/develop.md) · [Présentation de scrcpy (rom1v)](https://blog.rom1v.com/2018/03/introducing-scrcpy/)
- [DroidCam Pro — comparatif des offres](https://droidcam.app/pro-info.html) · [DroidCam — App Store](https://apps.apple.com/us/app/-/id1510258102) · [Plugin OBS DroidCam](https://obsproject.com/forum/resources/droidcam-obs-camera.1308/)
- [iVCam — App Store](https://apps.apple.com/jp/app/ivcam-%E3%82%B3%E3%83%B3%E3%83%94%E3%83%A5%E3%83%BC%E3%82%BF%E3%82%AB%E3%83%A1%E3%83%A9/id1164464478) · [iVCam — AlternativeTo](https://alternativeto.net/software/ivcam/about) · [Guide Univ. Saitama (PDF)](https://www.itc.saitama-u.ac.jp/contents_open/tips/PhoneCamera.pdf)
- [Camo — annonce](https://reincubate.com/blog/camo-beta) · [Revue iMore de Camo Studio](https://www.imore.com/reincubate-camo-studio-review-turn-your-iphone-webcam-your-dreams) · [Guide Camo 2026](https://www.codegenes.net/blog/camo-studio-download/) *(secondaire)*
- [Elgato — EpocCam n'est plus vendu ni mis à jour](https://help.elgato.com/hc/zh-cn/articles/360048912471)
- [Iriun — App Store](https://apps.apple.com/app/id1439303579) · [Iriun sur Linux (Ubunlog)](https://en.ubunlog.com/iriun-mobile-web-camera-linux/)
- [NDI — app NDI HX Camera (doc)](https://docs.ndi.video/all/using-ndi/using-ndi-with-software/how-to-use-ndi-hx-camera-app-ios) · [NDI — formats](https://ndi.video/tech/formats) · [NDICam — App Store](https://apps.apple.com/app/id1074065391)

## Transfert et appairage
- [Protocole LocalSend v2](https://github.com/localsend/protocol) · [Changelog LocalSend](https://localsend.org/changelog)
- [Forum Apple — peu de gros transferts, transferts reprenables](https://developer.apple.com/forums/thread/14853) · [Forum Apple — limites BGProcessingTask pour l'envoi](https://developer.apple.com/forums/thread/777033)
- [KDE Connect — App Store](https://apps.apple.com/app/id1580245991) · [KDE Connect iOS 0.5.5 (mai 2026)](https://releasebot.io/updates/kde/kde-connect-ios) *(secondaire)* · [Forum KDE — KDE Connect sur iOS](https://discuss.kde.org/t/is-kde-connect-good-for-ios-devices/11968)

## Noms
- [TMview (EUIPO) — recherche « hyphn »](https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=hyphn)
- [RDAP du registre .app / .dev (Google Registry)](https://pubapi.registry.google/rdap/domain/hyphn.app)
- [API GitHub — compte hyphn](https://api.github.com/users/hyphn)
- [API iTunes Search (App Store FR)](https://itunes.apple.com/search?term=hyphn&entity=software&country=fr)

## Cam : latence, effets, traduction (2026-11-02)
- [VideoToolbox — EnableLowLatencyRateControl](https://developer.apple.com/documentation/videotoolbox/kvtvideoencoderspecification_enablelowlatencyratecontrol)
- [WWDC21 — Explore low-latency video encoding with VideoToolbox](https://developer.apple.com/videos/play/wwdc2021/10158/)
- [ARKit — Tracking and visualizing faces](https://developer.apple.com/documentation/arkit/tracking-and-visualizing-faces)
- [Bergamot — traduction locale](https://browser.mt/) ; [BergamotTranslatorSharp](https://github.com/Freeesia/BergamotTranslatorSharp)

Liens : [[00-Accueil]]

## Filtres et effets de la Cam
Voir [[Filtres et effets existants]] (consultées le 2026-11-02).
