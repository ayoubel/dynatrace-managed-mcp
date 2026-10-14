# Sprint 08 — Constats diagnostiques

## Défauts avérés du moteur

| ID     | Reproduction               | Avant                                                                                                            | Correction / non-régression                                                                                                         |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| D08-01 | S01/S02/S06-unit-boundary  | Hausse brute 900000 → 1800000 MicroSecond, mais valeurs affichées 900 ms → 1,8 s ; pistes/vérifications absentes | Décisions sur séries référencées en unités brutes ; trois cas passent ; baisse inverse S07-unit-boundary-decrease sans fausse piste |
| D08-02 | S03-error-invalid-contract | Descripteur Byte, sum et HOST accepté pour erreurs ; rapport completed                                           | Métadonnées confirmées avant query ; partial et aucune comparaison de cette métrique                                                |
| D08-03 | S03-error-invalid-values   | Taux d'erreur 150 % comparé, rapport completed                                                                   | Série partial, aucune comparaison qualifiée ; preuve invalide conservée avec limite                                                 |

D08-02/03 constituent la même famille de qualification du chemin ERROR. Les signatures publiques et formats versionnés restent compatibles. La preuve du descripteur ERROR est maintenant conservée et reliée aux séries ; les nombres de preuves peuvent augmenter de façon additive.

## Limitations liées aux données

- Baseline précédente non garantie saine ou représentative de la saisonnalité.
- Six buckets complets permettent une comparaison descriptive, sans significativité statistique ni preuve d'anomalie intrinsèque.
- Topologie actuelle et événements déclarés ne prouvent ni présence historique, ni flux effectif, ni causalité.
- Moyennes par créneau non pondérées ; moyenne des p95 différente d'un percentile global.
- Séries vides, ambiguës, partielles, paginées ou de dimensions/résolutions incompatibles restent non comparables. S04/S05/S09 et variantes vérifient leur exclusion.
- HTTP en échec et timeout produisent une erreur de collecte assainie ; réponse malformée reçue avec succès produit une limitation de normalisation. S08-malformed ne doit pas inventer une erreur de transport.
- Le lecteur ne propage pas AbortSignal : arrêt des lectures suivantes, aucune annulation réseau garantie. Budget de volume vérifié après décodage.

## Limitations liées aux fixtures

- Les 22 scénarios sont synthétiques et déterministes. Ils réutilisent des formes API déjà validées, mais ne certifient pas chaque variante contre une instance Managed actuelle.
- Une HTTP 503 est simulée par le rejet du port connecteur ; le corpus n'exerce pas un serveur Dynatrace. Les tests API et MCP existants couvrent séparément le transport local.
- S05 oppose une latence comparable à une série d'erreurs de dimension supplémentaire ; il valide l'absence de fusion, pas une adjudication médicale/statistique de tous les conflits possibles.
- S10 partage les données de S01 : les symptômes sont nets mais dépourvus de preuve discriminante. Il vérifie surtout l'absence de mécanisme inventé et la proposition de traces.
- Le timeout du corpus utilise une promesse de port qui ne termine pas et un délai court. Les propriétés vérifiées sont la conservation des preuves et l'arrêt des lancements, pas le comportement réel du réseau.
- Le replay historique pauvre dépend d'une capture privée locale préexistante ; absent ailleurs, il est ignoré explicitement. Les fixtures assainies publiques restent disponibles.
- p95/key requests/DB/HOST restent couverts par les suites existantes ; pas de nouvelle validation réelle riche sur ces capacités.

## Capacités non encore implémentées ou non démontrées

- Modèle de significativité, certification d'une baseline saine, pondération temporelle/par volume.
- Causalité autonome, mécanisme technique établi, traces/PurePaths bruts via une API Managed publique vérifiée.
- Topologie ou placement historique prouvés, contribution chiffrée d'une dépendance au temps global.
- Le chemin ERROR transversal collecte au plus deux métriques pour le rapport et ne collecte pas le volume : il constate la hausse d'erreurs mais ne démontre pas une hausse sans hausse de trafic. S03 PERFORMANCE couvre les trois signaux ; aucun nouveau playbook créé.
- Les métadonnées retournées valides n'impliquent pas que les données historiques soient disponibles.

## Améliorations recommandées hors Sprint 08

- Captures d'incidents naturels assainies avec évaluation indépendante opérateur et attentes annotées.
- Mesure de pertinence des prochaines vérifications en exploitation et analyse de faux positifs/négatifs sur incidents réels.
- Amélioration éventuelle du chemin ERROR fondée sur le besoin de volume constaté, sans nouveau playbook automatique.
- Distinction contractuelle plus précise entre erreur de transport et erreur de normalisation, uniquement si nécessaire aux consommateurs ; aucun changement de schéma entrepris ici.

## Conclusion limitée

Les défauts reproduits sont corrigés et les scénarios du corpus passent. Ces résultats démontrent la qualité sur les fixtures couvertes et des invariants de prudence/provenance. Ils ne permettent pas de déclarer le moteur validé sur incidents réels ni d'affirmer une cause racine.
