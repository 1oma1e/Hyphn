---
type: spec
phase: 1
statut: brouillon
---
# Pulse — Batterie et thermique

## But
Quand Evan utilise Hyphn, il voit **sur le PC** la batterie, la chaleur et le stockage de l'iPhone, sans avoir à regarder l'iPhone. Surtout pendant la caméra : l'écran de l'iPhone est noir et on ne sait pas quand la batterie va lâcher (le défaut d'iVCam, choix d'Evan du 2026-10-31).

## Principe
Pulse ne marche **que quand l'app iPhone est ouverte**. À chaque ouverture, l'iPhone envoie tout ; pendant que l'app est ouverte, il envoie les changements ; dès qu'on la quitte, il n'envoie plus rien. Pas de suivi en arrière-plan, et c'est voulu : rien ne coûte de batterie quand Hyphn ne sert pas.

## Hors périmètre
- Santé et cycles de la batterie par câble : spec à part, `Pulse - Batterie par cable` ([[ADR-0006 Sante batterie par cable]]).
- Historique 24 h, débit réseau, latence affichée : plus tard.
- Le coin batterie dans l'aperçu de la caméra : écrit ici (E8), codé avec Cam v1 (phase 4).

## Parcours
Écrans [[PC - Pulse]] et [[PC - Cam]] ; résumé sur [[iPhone - Accueil]] (bloc « Pulse : partagé »).

## Exigences
- **E1 — Valeurs.** Niveau de batterie (%), état de charge (en charge, pleine, sur batterie), mode économie d'énergie, état thermique (`nominal`, `fair`, `serious`, `critical`), stockage libre et total. Jamais de degrés : iOS ne les donne pas ([[Points a tester]]).
- **E2 — Quand on envoie.** Tout, à chaque connexion (donc à chaque ouverture de l'app). Ensuite, batterie, charge, économie et chaleur seulement quand iOS signale un changement : `UIDevice.batteryLevelDidChangeNotification`, `batteryStateDidChangeNotification`, `ProcessInfo.thermalStateDidChangeNotification`, `NSProcessInfoPowerStateDidChange`. Le stockage n'a pas d'événement : lu seulement à la connexion. **Aucune boucle de relevé** ([[RULES]], Énergie 1).
- **E3 — Message.** Un `PulseUpdate` Protobuf dans la connexion de [[Core - Reconnexion]], avec l'heure de la mesure sur l'iPhone.
- **E4 — Écran Pulse du PC.** Cartes Batterie, Chaleur et Stockage de [[PC - Pulse]], « Mis à jour … » dans l'en-tête. Chaleur en français : `nominal` → normal, `fair` → tiède, `serious` → chaud, `critical` → critique. Le bloc Réseau, les cycles par câble et l'historique restent vides en phase 1. Une valeur jamais reçue s'affiche « inconnu ».
- **E5 — App fermée.** Dernières valeurs grisées + « Vu il y a … ».
- **E6 — Alerte.** Sous 15 % et pas en charge : notification Windows une fois, et bandeau rouge ([[RULES]], Énergie 7). Case pour la couper.
- **E7 — Budget.** Mesurer la consommation de l'app ouverte et connectée, écran allumé, sur 1 h : % de batterie perdu et état thermique, comparé à la même heure sans Hyphn. Résultat noté dans `docs/research/` : c'est le premier budget ([[RULES]], Énergie 6).
- **E8 — Coin batterie dans l'aperçu Cam** (phase 4). Dans l'aperçu vidéo de [[PC - Cam]], un petit badge dans un coin : batterie en %, éclair si en charge, chaleur si elle n'est pas « normal ». Rouge sous 15 % sans charge. Il n'apparaît **que dans la fenêtre Hyphn**, jamais dans l'image envoyée à la webcam Windows ou à OBS (les autres ne doivent pas le voir).

## Cas limites
| Cas | Ce qui se passe |
|---|---|
| iOS renvoie un niveau `-1` (inconnu) | « inconnu », pas 0 % |
| Branchement / débranchement | Mise à jour en moins de 2 s |
| iPhone qui chauffe pendant le test | L'état thermique change sur le PC |
| Mode économie activé | « Éco : oui » sur le PC |
| Photos prises pendant que l'app est ouverte | Stockage pas mis à jour avant la prochaine ouverture (accepté) |

## Preuve
1. Brancher puis débrancher l'iPhone : le PC change d'état en moins de 2 s (journaux horodatés des deux apps). Capture.
2. Activer le mode économie (Settings → Battery → Low Power Mode) : « Éco : oui » sur le PC.
3. Tests automatiques côté PC (`cargo test`) avec des `PulseUpdate` simulés : niveau `-1` → « inconnu » ; 14 % sur batterie → une seule alerte ; chaque état thermique → son libellé.
4. Quitter l'app iPhone : valeurs grisées + « Vu il y a… » sur le PC ; la rouvrir : tout est à jour, stockage compris. Captures.
5. État thermique réel : noté s'il change pendant la mesure E7 (on ne force pas la chauffe).
6. Mesure E7 notée avec ses chiffres.
7. E8 (en phase 4) : capture de l'aperçu avec le badge, et capture d'OBS **sans** le badge.

## À vérifier avant le code
- Lire le stockage libre : `volumeAvailableCapacityForImportantUsageKey` (Foundation). Non vérifié.

Liens : [[Specs - Index]], [[ROADMAP]]
