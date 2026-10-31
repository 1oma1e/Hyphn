# Journal des rafraîchissements SideStore

Preuve de la porte de la phase 0 : l'app Hyphn se rafraîchit **toute seule** pendant 14 jours ([[ADR-0007 Porte de la phase 0]]). Une ligne par passage de l'automatisation `Refresh SideStore` (lundi et jeudi à 20 h).

**Comment relever** (sur l'iPhone, après 20 h) : ouvrir SideStore → onglet **My Apps** → noter le nombre de jours restants affiché sous **Hyphn** et sous **SideStore**. Un rafraîchissement réussi remet le compteur à 7 jours. Noter aussi si l'iPhone était verrouillé à 20 h, et si une notification d'erreur est apparue.

| Date | Lancé par | iPhone verrouillé ? | Jours restants Hyphn / SideStore | Résultat | Remarque |
|---|---|---|---|---|---|
| 2026-10-31 | à la main | non | non relevé | réussi | Test du raccourci (confirmé par Evan) |
| 2026-11-02 20 h | automatisation | | | | Premier passage automatique : s'il réussit, la phase 1 peut commencer (ADR-0007) |
| 2026-11-05 20 h | automatisation | | | | |
| 2026-11-09 20 h | automatisation | | | | |
| 2026-11-12 20 h | automatisation | | | | |
| 2026-11-14 | relevé à la main | | | | Fin des 14 jours : porte de la phase 0 |

Échec que SideStore ne sait pas corriger → rouvrir le plan B ([[ADR-0014 Pas de plan B AltServer]]).

Liens : [[ROADMAP]], [[STATE]]
