# Sprint 05 — Capacités Managed

Audit read-only du 14 octobre 2026. Managed retourne `1.346.84.20260921-100102`. Captures et identifiants restent dans `validation/sprint-05/` ignoré. Aucun endpoint interne ni cookie de session utilisé.

| Domaine | État | API GET / permission | Preuve, limites et décision |
|---|---|---|---|
| Version | AVAILABLE | `/api/v1/config/clusterversion`, ReadConfig | HTTP 200, version ci-dessus. |
| Métriques service | PARTIALLY_AVAILABLE | `/api/v2/metrics/{id}`, `/api/v2/metrics/query`, metrics.read | Descripteurs 200 : response.time MicroSecond avg/percentile, errors.server.rate Percent avg, requestCount.total Count value. Réponses vides sur le premier service et la fenêtre récente : disponibilité du contrat ≠ disponibilité des données. Réutiliser les comparaisons strictes. |
| Latence p95 | PARTIALLY_AVAILABLE | Même API | Agrégation percentile publiée et requête percentile(95) HTTP 200 ; pas de série récente sur le service sondé. Collecter uniquement avec contrat confirmé. Moyenne de p95 de créneaux, jamais p95 global ni percentile des moyennes. |
| Topologie | AVAILABLE | `/api/v2/entities/{id}`, entities.read | SERVICE et relations calls sortantes/entrantes HTTP 200. État actuel, présence historique inconnue. Sélection bornée : entités publiées par le problème puis hausse mesurée puis IDs ; aucun classement causal. |
| Key requests | PARTIALLY_AVAILABLE | `/api/v2/entityTypes/SERVICE_METHOD`, `/api/v2/entities`, metrics service.keyRequest.*, entities.read + metrics.read | Type et trois contrats HTTP 200, dimension dt.entity.service_method. N'expose que les key requests configurées, aucune exhaustivité des URLs/SQL. Collecteur uniquement pour relation officielle isServiceMethodOfService. |
| DB | PARTIALLY_AVAILABLE | Entités SERVICE, mêmes métriques | Métadonnées publient serviceType/databaseVendor/databaseName. Identifier DATABASE via type publié, ne pas inférer par nom. Latence/erreurs/volume du service DB, aucune requête SQL précise. |
| Infrastructure | PARTIALLY_AVAILABLE | Entités SERVICE/PROCESS_GROUP_INSTANCE et métriques host.cpu.usage/host.mem.usage | Relations runsOnHost, runsOnProcessGroupInstance, runsOn publiées ; contrats hôte Percent avg HTTP 200. Collecter au plus un hôte explicitement lié, sans playbook HOST supplémentaire. Process groups/instances : identité relationnelle, pas de collecteur général de métriques processus. |
| Événements | AVAILABLE | `/api/v2/events`, events.read | HTTP 200, page récente vide. Page 10, aucun suivi de pagination. Avant/pendant/après fenêtre distingués, aucun début exact de dégradation inféré. |
| Traces/PurePaths/spans bruts | NOT_VERIFIED | Aucune API publique Managed identifiée dans la documentation consultée | Pas de collecteur opérationnel. Aucune tentative sur endpoints internes. Vérification manuelle contextualisée ; cela ne prouve pas l'absence de toute API sur tous les Managed. |
| Grail/DQL | UNAVAILABLE pour ce sprint | Aucun endpoint utilisé | Non applicable au chemin classic Managed retenu ; aucune supposition de disponibilité SaaS. |

Les permissions requises sont présentes dans les métadonnées du token configuré ; seules les lectures nécessaires sont utilisées. Les permissions d'écriture ne sont pas exploitées. L'inspection des scopes utilise le mécanisme existant de lookup de métadonnées, distinct des GET métier.

Sources officielles : [Environment API](https://docs.dynatrace.com/docs/dynatrace-api/environment-api), [Metrics query](https://docs.dynatrace.com/docs/dynatrace-api/environment-api/metric-v2/get-data-points), [Metric selector et agrégations](https://docs.dynatrace.com/docs/dynatrace-api/environment-api/metric-v2/metric-selector), [Entity selector et relations](https://docs.dynatrace.com/docs/dynatrace-api/environment-api/entity-v2/entity-selector), [Built-in classic metrics](https://docs.dynatrace.com/docs/analyze-explore-automate/metrics-classic/built-in-metrics). Les observations HTTP locales priment sur les possibilités décrites pour d'autres environnements.

Plan minimal : compléter SERVICE_SLOWDOWN avec screening borné de dépendances, réutilisation des contrats, p95 officiel, key requests reliées et CPU/mémoire d'un hôte lié ; enrichir les sections Explain existantes et garder les mêmes contrats publics. Budget partagé, résultats partiels et tests déterministes. Aucun serveur/tool/playbook supplémentaire, aucune activation de 4318 pendant ce sprint.

## Filtres, données et coûts

| Lecture | Filtres/paramètres retenus | Données retenues | Coût/bornes |
|---|---|---|---|
| Descripteur métrique | ID exact | metricId, unit, aggregationTypes, dimensionDefinitions | 1 GET par contrat, réutilisé pendant la collecte |
| Série service/dépendance/DB | entityId exact, metricSelector avg/value, from/to, resolution 5m | Une série non ambiguë, dimension exacte, créneaux complets, valeurs/unité | 2 GET par métrique/entité ; 24 créneaux maximum par période |
| Série p95 | builtin:service.response.time:percentile(95), mêmes paramètres | p95 calculés par Managed par créneau | 2 GET supplémentaires si contrat existant autorise percentile |
| Relations SERVICE | entityId exact | calls FROM/TO, runsOnHost, runsOn/runsOnProcessGroupInstance, serviceType | Identité primaire réutilisée ; 100 calls examinés au maximum, topologie tronquée signalée |
| Key requests | type(SERVICE_METHOD), fromRelationships.isServiceMethodOfService(type(SERVICE),entityId(...)), pageSize, fields +fromRelationships | IDs dont le lien de propriété est confirmé, métriques keyRequest.* dimension service_method | 1 page de deux IDs, 3 GET latence initialement, erreurs/volume seulement si latence augmente ; contrats réutilisés entre IDs |
| Infrastructure | HOST explicitement runsOnHost, entityId exact | CPU/mémoire Percent avg ; identité PG/PGI via relations déjà retournées | 1 hôte, 2 contrats + 4 requêtes de séries ; autres hôtes non évalués |
| Events | entityId, from/to, pageSize 10 | Événements qualifiés, dates, catégorie et déclaration synthétique | 1 page par service sélectionné ; 30 minutes avant/après, bornée par now ; aucune pagination |
| Problèmes | from now-30d, to now, severityLevel PERFORMANCE, pageSize 10 | Page de problèmes publiés | 1 page ; un résultat ne garantit pas un problème SERVICE riche |

Toutes les requêtes sont GET sauf le lookup de scopes existant (métadonnées read-only). Les scopes entities.read, metrics.read, events.read et problems.read ont été effectivement vérifiés. Aucun ReadConfig/WriteConfig utilisé pour créer des métriques calculées : aucune configuration n'est modifiée.

## Résultats complémentaires

La validation ultérieure du build isolé confirme deux séries p95 complètes et quatre séries CPU/mémoire complètes sur un hôte explicitement lié. Les séries service sont disponibles sur les services actifs sondés, malgré une réponse récente vide sur le premier service : disponibilité PARTIALLY_AVAILABLE dépendant de l'entité/fenêtre. Une page de key requests liée est HTTP 200 mais vide ; API/filtre vérifiés, cas key request dégradée non validé en réel. Deux dépendances sont découvertes sur le service validé, mais leurs paires métriques ne sont pas complètes dans la fenêtre.

Coût réellement observé : audit 47 GET (46 HTTP 200, 1 filtre invalide HTTP 400 corrigé) ; validation 55 GET HTTP 200, dont 26 pour l'observation ordinaire et 15 pour l'acceptation finale du problème réel. Les 14 GET intermédiaires avec un jeu de scopes conservateur sont comptabilisés mais ne servent pas à affirmer un manque de droits sur Managed. Deux lookups de scopes distincts de ces GET. Captures privées ignorées ; aucune donnée interne détaillée dans cette matrice.
