# Sprint 05 — Rapport

## Résultat

SERVICE_SLOWDOWN approfondit désormais les dépendances sélectionnées par preuves, réutilise les contrats et collecte p95, key requests liées et CPU/mémoire d’un hôte explicite. Les conclusions restent descriptives et les pistes conditionnelles. Aucun collecteur de traces brutes, serveur, endpoint, tool MCP, LLM ou playbook supplémentaire. Aucun commit ni activation de 4318.

## Audit et écarts

Sprint 04 : trois comparaisons primaires, deux dépendances triées par ID avec latence uniquement, événements avant/pendant, budget commun de 18 lectures. Les contrats et le rendu permettaient l’enrichissement sans changement d’architecture. Les lacunes utiles étaient la sélection des dépendances, leurs erreurs/volume, la latence de queue, les key requests, l’infrastructure liée et la distinction des changements postérieurs.

Managed vérifié : `1.346.84.20260921-100102`. Voir SPRINT_05_CAPABILITY_MATRIX.md. Les descripteurs et filtres officiels classic répondent ; une réponse vide reste une absence de données dans le périmètre, jamais preuve d’absence d’incident. Documentation officielle et constat HTTP sont distingués.

## Fonctionnalités implémentées

- Candidates sortantes : entités également publiées dans le problème d’abord, puis ID, maximum 4 par défaut. Relation entrante jamais utilisée comme dépendance sortante.
- Screening de latence sur les deux fenêtres pour toutes les candidates. Approfondissement de deux candidates : priorité publiée, puis hausse mesurée, puis ID. Pas de tri par probabilité, amplitude ou root cause.
- Erreurs et volume approfondis pour une dépendance sélectionnée en hausse ou publiée dans le problème ; contrats primaires réutilisés, latence déjà collectée conservée.
- Nature DB uniquement via serviceType DATABASE publié ; valeurs du service DB, aucun SQL ou accès direct à une base.
- p95 uniquement si aggregationTypes publie percentile. Requête Managed percentile(95), jamais percentile de moyennes. Comparaison de la moyenne des p95 de créneaux, pas percentile global.
- Une page de deux key requests par défaut, relation isServiceMethodOfService confirmée dans chaque entité. Latence puis erreurs/volume si la requête augmente. Aucun endpoint inventé ni contribution globale quantifiée sans preuve.
- Un hôte explicitement runsOnHost : CPU/mémoire, même paire temporelle. Process groups/instances uniquement comme identités reliées publiées. Aucun placement historique inféré.
- Événements : fenêtre bornée jusqu’à 30 minutes après l’observation, limitée au moment de collecte. Avant/pendant/après explicités ; un événement après la fenêtre ne devient pas une piste de changement.
- Explain conserve observations, hypotheses, comparisons, unknowns et remediation.immediate. Pistes avec preuves et vérification technique associée, aucune correction automatique.
- Paire de métriques identifiée par entité, metricId **et agrégation** : avg et p95 ne s’annulent ni ne se mélangent. Libellés CPU/mémoire/key request spécifiques.

Alignement temporel = fenêtres identiques, précédence = avant la fenêtre agrégée, relation topologique = lien actuel publié. Ces propriétés restent distinctes d’un mécanisme causal, qui demeure inconnu. Aucun début exact de dégradation n’est inféré. Les références des comparaisons pointent sur les séries et leurs références contractuelles/topologiques restent accessibles.

## Architecture et fichiers

Le Core reste indépendant du SDK MCP et de Chrome. Tous les enrichissements utilisent les ports existants entities, metrics, events et makeRequests. Aucun schéma public modifié : Evidence/Investigation 1.0, Explain 1, contrats MCP et historique inchangés. Les paramètres de collecte sont internes à InvestigationDependencies, sans nouvelle configuration locale.

| Fichier | Responsabilité |
|---|---|
| src/core/investigation-engine/collection-limits.ts | Validation des bornes et attente bornée de réponse |
| src/core/investigation-engine/service-enrichment.ts | Contrats réutilisés, paires strictes, p95, key requests, DB, infrastructure |
| src/core/investigation-engine/service-context.ts | Screening/sélection, erreurs/volume des dépendances, événements après fenêtre |
| src/core/investigation-engine/service-slowdown.ts | Orchestration existante et état partiel des enrichissements |
| src/core/investigation-engine/dependencies.ts | Limites internes facultatives |
| src/core/investigation-engine/provenance.ts | Source entities des listes, héritage des relations, somme de comptes |
| src/capabilities/problem-investigation.ts | Budget partagé, timeout, limites de volume et arrêt des lectures |
| src/capabilities/problem-explain-report.ts | Comparaisons par agrégation et pistes/vérifications contextualisées |
| src/core/__tests__/service-deep-investigation.test.ts | 20 scénarios et 5 tests transversaux |
| src/core/__tests__/service-context.test.ts | Attentes enrichies et plafond 18 explicite du test de budget |
| src/capabilities/__tests__/explain-investigation-quality.test.ts | Plafond 18 explicite du scénario de budget historique |

## Appels, budgets et limites opérationnelles

Par défaut : 48 tentatives API par Explain SERVICE/PERFORMANCE, plafond configurable 60 ; autres investigations gardent 18. Quatre candidates (plafond 8), deux approfondies (plafond 4), deux key requests (plafond 4), profondeur **1 fixe**. Pas de profondeur 2 faute de valeur démontrée. Un hôte, une page de key requests et dix événements par entité ; aucune pagination automatique. Fenêtres métriques bornées à deux heures et 5 minutes de résolution.

Temps global : 80 secondes par défaut (plafond 120), attente d’une réponse 12 secondes (plafond 30), y compris temps restant. Réponse acceptée au plus 3 MB, total au plus 10 MB ; plafonds configurables 5 MB/20 MB. Le contrôle de volume intervient après décodage par le connecteur : ce n’est pas un plafond de mémoire absolu du transport. Le port historique ne propage pas AbortSignal : une requête déjà lancée peut terminer après le timeout ; **aucune suivante n’est lancée**, et le résultat partiel conserve les preuves acquises. Aucune prétention d’annulation réseau.

Les contrats sont réutilisés par metricId pendant une investigation. Les métriques primaires et la topologie sont réutilisées ; dépendances stables non publiées ne déclenchent pas erreurs/volume/identité. Pas de cache inter-session ou de cache durable susceptible de masquer un changement de droits. Les plafonds sont des bornes opérationnelles, pas des seuils d’anomalie.

Fixtures : 7 à 34 lectures réussies selon les données ; scénario budget = 12, permissions = 3. Le nombre d’appels réussis ne compte pas les étapes bloquées avant requête. Dans tous les cas, tentatives réelles bornées par le budget partagé.

## Tests

531/531 tests Engine (38 suites), compilation TypeScript isolée réussie ; 4/4 tests MCP d’intégration locaux. Voir SPRINT_05_TEST_MATRIX.md. Un test historique exige l’écriture/suppression de ~/.test-dt-config.json ; vérifié absent avant/après, suite exécutée avec l’accès nécessaire. Le runtime temporaire inclut package.json pour les tests MCP. Aucun fichier dist de production remplacé.

Gateway/Chrome ne sont pas modifiés et les sections/champs consommés restent identiques ; leurs suites et la recette native ne sont pas nécessaires à ce changement de contrat (aucun). Les scénarios riches vérifient les schémas et le format Explain existant. La recette native du Sprint 04.1 reste le dernier contrôle Chrome utilisateur.

## Validation réelle Managed

Audit : 47 GET au total en deux passes (21 puis 26), 46 HTTP 200 et une requête de filtre de problèmes HTTP 400, corrigée avec le filtre severityLevel documenté. Deux inspections de scopes via le lookup de métadonnées existant, sans écriture. Validation : **55 GET, tous HTTP 200** : 26 pour observation ordinaire de service, 14 lors d’un premier passage aux scopes conservateurs, puis 15 pour l’acceptation finale avec les scopes réellement vérifiés. Le premier passage conservateur ne sert pas à conclure à une permission manquante sur Managed. Total : 102 GET de ce sprint, sans charge ni événement créé.

Sur un service existant : six comparaisons complètes (trois signaux primaires, p95, CPU, mémoire), deux dépendances sondées mais non évaluables dans cette fenêtre ; deux séries p95 et quatre séries hôte. Aucune key request configurée retournée. Cette observation ordinaire est **réelle**, ne représente pas un incident artificiel ni une validation causale. Couverture contextuelle partielle explicitée malgré les six paires complètes.

Problème réel déjà capturé : 15 GET lors du passage final, partial, neuf preuves, deux observations, aucune piste, une prochaine vérification, mécanisme unknown et snapshot valide. Origine naturelle du problème non certifiée. La page de problèmes PERFORMANCE retourne un problème, sans garantie d’un incident SERVICE/PERFORMANCE riche adapté ; aucun tel cas n’a été utilisé pour valider la causalité.

Les captures, payloads, IDs, scopes et métriques internes sont conservés uniquement dans validation/sprint-05 ignoré. Les rapports publics ne reproduisent pas les payloads, noms/URLs de production, tokens ou mesures internes.

## Exemples avant/après

Avant = périmètre fonctionnel du code Sprint 04 audité, pas une prétendue exécution du nouveau collecteur sur un incident ancien. Après = sorties complètes des fixtures Sprint 05 ci-dessous. Ces comparaisons illustrent l’enrichissement ; aucun A/B réel causal n’est revendiqué.

- Dépendance ralentie : avant, latence de la dépendance et piste de traces ; après, latence + erreurs + volume + p95 primaire, mêmes fenêtres et preuves contractuelles réutilisées.
- Dépendance stable : avant, comparaison de latence et prochaine lecture de traces ; après, stabilité explicite conservée, aucune piste de dépendance, contrôle spécifique de queue p95.
- Données insuffisantes : avant, unknowns et lecture des preuves publiées ; après, aucune comparaison/hypothèse inventée, limitation de contrats, key requests, traces et infrastructure clairement distincte.

### Service et dépendance ralentis — fixture synthétique

Statut : completed. Environnement fictif managed.example ; toutes les valeurs suivantes sont simulées. Début/fin publiés : 2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z. Gravité publiée de la fixture : PERFORMANCE. Impact utilisateur non quantifié.

#### Observations

- **builtin:service.response.time** : SERVICE-1111111111111111 · Temps de réponse moyen : 0,1 ms → 0,2 ms. Baseline 2023-11-14T21:45:00.000Z → 2023-11-14T22:15:00.000Z ; observation 2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z ; agrégation avg. Limites : Comparaison descriptive ; aucune anomalie ni causalité démontrée. Baseline précédente non garantie saine ou représentative ; agrégation conservée. [preuves : E4, E5]
- **builtin:service.errors.server.rate** : SERVICE-1111111111111111 · Erreurs côté serveur : 1 % → 1 %. Baseline 2023-11-14T21:45:00.000Z → 2023-11-14T22:15:00.000Z ; observation 2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z ; agrégation avg. Limites : Comparaison descriptive ; aucune anomalie ni causalité démontrée. Baseline précédente non garantie saine ou représentative ; agrégation conservée. [preuves : E7, E8]
- **builtin:service.requestCount.total** : SERVICE-1111111111111111 · Volume de requêtes : 600 Count → 600 Count. Baseline 2023-11-14T21:45:00.000Z → 2023-11-14T22:15:00.000Z ; observation 2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z ; agrégation value. Limites : Comparaison descriptive ; aucune anomalie ni causalité démontrée. Baseline précédente non garantie saine ou représentative ; agrégation conservée. [preuves : E10, E11]
- **builtin:service.response.time** : SERVICE-1111111111111111 · Latence de queue · moyenne des p95 par créneau : 0,3 ms → 0,6 ms. Baseline 2023-11-14T21:45:00.000Z → 2023-11-14T22:15:00.000Z ; observation 2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z ; agrégation percentile(95). Limites : Comparaison descriptive ; aucune anomalie ni causalité démontrée. Baseline précédente non garantie saine ou représentative ; agrégation conservée. [preuves : E21, E22]
- **builtin:service.response.time** : SERVICE-2222222222222222 · Temps de réponse moyen : 0,1 ms → 0,2 ms. Baseline 2023-11-14T21:45:00.000Z → 2023-11-14T22:15:00.000Z ; observation 2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z ; agrégation avg. Limites : Comparaison descriptive ; aucune anomalie ni causalité démontrée. Baseline précédente non garantie saine ou représentative ; agrégation conservée. [preuves : E13, E14]
- **builtin:service.errors.server.rate** : SERVICE-2222222222222222 · Erreurs côté serveur : 1 % → 1 %. Baseline 2023-11-14T21:45:00.000Z → 2023-11-14T22:15:00.000Z ; observation 2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z ; agrégation avg. Limites : Comparaison descriptive ; aucune anomalie ni causalité démontrée. Baseline précédente non garantie saine ou représentative ; agrégation conservée. [preuves : E16, E17]
- **builtin:service.requestCount.total** : SERVICE-2222222222222222 · Volume de requêtes : 600 Count → 600 Count. Baseline 2023-11-14T21:45:00.000Z → 2023-11-14T22:15:00.000Z ; observation 2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z ; agrégation value. Limites : Comparaison descriptive ; aucune anomalie ni causalité démontrée. Baseline précédente non garantie saine ou représentative ; agrégation conservée. [preuves : E18, E19]
- **Dépendance directe publiée** : SERVICE-1111111111111111 → SERVICE-2222222222222222 : relation sortante calls collectée 2026-10-14T12:01:34.927Z → 2026-10-14T12:01:34.927Z. Limites : présence historique et flux effectif pendant l’incident non attestés. [preuves : E2-calls]

#### Pistes

- **Latence également augmentée sur la dépendance** : Faits : SERVICE-1111111111111111 et SERVICE-2222222222222222 augmentent sur les mêmes fenêtres (2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z). Piste à vérifier ; aucune causalité démontrée. Manque : chemin réel des appels, durée passée dans la dépendance et chronologie des requêtes [preuves : E2-calls, E4, E5, E13, E14]

#### Prochaines vérifications

- **Latence également augmentée sur la dépendance** : Examiner les traces distribuées SERVICE-1111111111111111 → SERVICE-2222222222222222 sur 2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z ; vérifier les durées des spans et les erreurs de cet appel. Raison : SERVICE-1111111111111111 et SERVICE-2222222222222222 augmentent sur les mêmes fenêtres (2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z). Manque : chemin réel des appels, durée passée dans la dépendance et chronologie des requêtes [preuves : E2-calls, E4, E5, E13, E14]
- **Examiner les requêtes de queue** : Comparer les requêtes lentes de SERVICE-1111111111111111 sur 2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z à la baseline ; examiner les traces disponibles dans Managed. Raison : Hausse de la moyenne des p95 de créneaux ; percentile global, échantillonnage et mécanisme inconnus. [preuves : E21, E22]

#### Inconnues et limitations

- Baseline immédiatement antérieure au début publié, non garantie saine ni représentative de la saisonnalité. Moyennes de créneaux non pondérées par les requêtes ; aucune causalité déduite.
- Topologie collectée à présent ; la présence historique de la relation pendant l’incident n’est pas attestée. Contexte descriptif ; proximité temporelle et relation calls ne démontrent aucune causalité.
- Aucun événement contextuel qualifié dans la page collectée pour SERVICE-1111111111111111 ; absence de changement ou de panne non démontrée.
- Aucun événement contextuel qualifié dans la page collectée pour SERVICE-2222222222222222 ; absence de changement ou de panne non démontrée.
- Traces/PurePaths/spans bruts non collectés : aucune API publique Managed vérifiée. Vérification manuelle nécessaire ; représentativité et rétention inconnues.
- p95 retourné par Managed par créneau ; moyenne des p95 de créneaux, pas percentile global ni percentile calculé à partir de moyennes.
- Aucune key request explicitement liée dans la page collectée ; endpoints réels et requêtes lentes inconnus.
- Aucun hôte explicitement lié au service ; corrélation infrastructure non évaluée.
- Cause technique non déduite d’une simple corrélation. Lectures bornées ; aucun accès direct au filesystem, aucune commande exécutée.
- Traces brutes non accessibles via une API publique Managed vérifiée ; les vérifications de traces proposées sont manuelles dans Managed.

#### Catalogue des preuves

| ID | API | Entité | Mesure/fenêtre |
|---|---|---|
| E1 | /api/v2/problems/deep-slow | problème | problem |
| impact | /api/v2/problems/deep-slow | problème | impact |
| E2 | /api/v2/entities/SERVICE-1111111111111111 | SERVICE-1111111111111111 | entity |
| E3 | /api/v2/metrics/builtin%3Aservice.response.time | SERVICE-1111111111111111 | builtin:service.response.time · MicroSecond · avg |
| E4 | /api/v2/metrics/query | SERVICE-1111111111111111 | builtin:service.response.time · incident · MicroSecond · avg |
| E5 | /api/v2/metrics/query | SERVICE-1111111111111111 | builtin:service.response.time · baseline · MicroSecond · avg |
| E6 | /api/v2/metrics/builtin%3Aservice.errors.server.rate | SERVICE-1111111111111111 | builtin:service.errors.server.rate · Percent · avg |
| E7 | /api/v2/metrics/query | SERVICE-1111111111111111 | builtin:service.errors.server.rate · incident · Percent · avg |
| E8 | /api/v2/metrics/query | SERVICE-1111111111111111 | builtin:service.errors.server.rate · baseline · Percent · avg |
| E9 | /api/v2/metrics/builtin%3Aservice.requestCount.total | SERVICE-1111111111111111 | builtin:service.requestCount.total · Count · value |
| E10 | /api/v2/metrics/query | SERVICE-1111111111111111 | builtin:service.requestCount.total · incident · Count · value |
| E11 | /api/v2/metrics/query | SERVICE-1111111111111111 | builtin:service.requestCount.total · baseline · Count · value |
| E2-calls | /api/v2/entities/SERVICE-1111111111111111 | SERVICE-1111111111111111 | service-relations |
| E12 | /api/v2/events | SERVICE-1111111111111111 | events |
| E13 | /api/v2/metrics/query | SERVICE-2222222222222222 | builtin:service.response.time · incident · MicroSecond · avg |
| E14 | /api/v2/metrics/query | SERVICE-2222222222222222 | builtin:service.response.time · baseline · MicroSecond · avg |
| E15 | /api/v2/entities/SERVICE-2222222222222222 | SERVICE-2222222222222222 | entity |
| E16 | /api/v2/metrics/query | SERVICE-2222222222222222 | builtin:service.errors.server.rate · incident · Percent · avg |
| E17 | /api/v2/metrics/query | SERVICE-2222222222222222 | builtin:service.errors.server.rate · baseline · Percent · avg |
| E18 | /api/v2/metrics/query | SERVICE-2222222222222222 | builtin:service.requestCount.total · incident · Count · value |
| E19 | /api/v2/metrics/query | SERVICE-2222222222222222 | builtin:service.requestCount.total · baseline · Count · value |
| E20 | /api/v2/events | SERVICE-2222222222222222 | events |
| E21 | /api/v2/metrics/query | SERVICE-1111111111111111 | builtin:service.response.time · incident · MicroSecond · percentile(95) |
| E22 | /api/v2/metrics/query | SERVICE-1111111111111111 | builtin:service.response.time · baseline · MicroSecond · percentile(95) |
| E23 | /api/v2/entities | SERVICE-1111111111111111 | entity-list |

### Service ralenti, dépendance stable — fixture synthétique

Statut : completed. Environnement fictif managed.example ; toutes les valeurs suivantes sont simulées. Début/fin publiés : 2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z. Gravité publiée de la fixture : PERFORMANCE. Impact utilisateur non quantifié.

#### Observations

- **builtin:service.response.time** : SERVICE-1111111111111111 · Temps de réponse moyen : 0,1 ms → 0,2 ms. Baseline 2023-11-14T21:45:00.000Z → 2023-11-14T22:15:00.000Z ; observation 2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z ; agrégation avg. Limites : Comparaison descriptive ; aucune anomalie ni causalité démontrée. Baseline précédente non garantie saine ou représentative ; agrégation conservée. [preuves : E4, E5]
- **builtin:service.errors.server.rate** : SERVICE-1111111111111111 · Erreurs côté serveur : 1 % → 1 %. Baseline 2023-11-14T21:45:00.000Z → 2023-11-14T22:15:00.000Z ; observation 2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z ; agrégation avg. Limites : Comparaison descriptive ; aucune anomalie ni causalité démontrée. Baseline précédente non garantie saine ou représentative ; agrégation conservée. [preuves : E7, E8]
- **builtin:service.requestCount.total** : SERVICE-1111111111111111 · Volume de requêtes : 600 Count → 600 Count. Baseline 2023-11-14T21:45:00.000Z → 2023-11-14T22:15:00.000Z ; observation 2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z ; agrégation value. Limites : Comparaison descriptive ; aucune anomalie ni causalité démontrée. Baseline précédente non garantie saine ou représentative ; agrégation conservée. [preuves : E10, E11]
- **builtin:service.response.time** : SERVICE-1111111111111111 · Latence de queue · moyenne des p95 par créneau : 0,3 ms → 0,6 ms. Baseline 2023-11-14T21:45:00.000Z → 2023-11-14T22:15:00.000Z ; observation 2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z ; agrégation percentile(95). Limites : Comparaison descriptive ; aucune anomalie ni causalité démontrée. Baseline précédente non garantie saine ou représentative ; agrégation conservée. [preuves : E16, E17]
- **builtin:service.response.time** : SERVICE-2222222222222222 · Temps de réponse moyen : 0,1 ms → 0,1 ms. Baseline 2023-11-14T21:45:00.000Z → 2023-11-14T22:15:00.000Z ; observation 2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z ; agrégation avg. Limites : Comparaison descriptive ; aucune anomalie ni causalité démontrée. Baseline précédente non garantie saine ou représentative ; agrégation conservée. [preuves : E13, E14]
- **Dépendance directe publiée** : SERVICE-1111111111111111 → SERVICE-2222222222222222 : relation sortante calls collectée 2026-10-14T12:01:34.885Z → 2026-10-14T12:01:34.885Z. Limites : présence historique et flux effectif pendant l’incident non attestés. [preuves : E2-calls]

#### Pistes

Aucune piste étayée dans ce périmètre.

#### Prochaines vérifications

- **Localiser le temps passé dans le service** : Examiner les traces de SERVICE-1111111111111111 sur 2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z et comparer les durées des spans à la baseline 2023-11-14T21:45:00.000Z → 2023-11-14T22:15:00.000Z. Raison : Hausse mesurée de latence ; mécanisme technique et répartition du temps inconnus. [preuves : E4, E5]
- **Examiner les requêtes de queue** : Comparer les requêtes lentes de SERVICE-1111111111111111 sur 2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z à la baseline ; examiner les traces disponibles dans Managed. Raison : Hausse de la moyenne des p95 de créneaux ; percentile global, échantillonnage et mécanisme inconnus. [preuves : E16, E17]

#### Inconnues et limitations

- Baseline immédiatement antérieure au début publié, non garantie saine ni représentative de la saisonnalité. Moyennes de créneaux non pondérées par les requêtes ; aucune causalité déduite.
- Topologie collectée à présent ; la présence historique de la relation pendant l’incident n’est pas attestée. Contexte descriptif ; proximité temporelle et relation calls ne démontrent aucune causalité.
- Aucun événement contextuel qualifié dans la page collectée pour SERVICE-1111111111111111 ; absence de changement ou de panne non démontrée.
- Aucun événement contextuel qualifié dans la page collectée pour SERVICE-2222222222222222 ; absence de changement ou de panne non démontrée.
- Traces/PurePaths/spans bruts non collectés : aucune API publique Managed vérifiée. Vérification manuelle nécessaire ; représentativité et rétention inconnues.
- p95 retourné par Managed par créneau ; moyenne des p95 de créneaux, pas percentile global ni percentile calculé à partir de moyennes.
- Aucune key request explicitement liée dans la page collectée ; endpoints réels et requêtes lentes inconnus.
- Aucun hôte explicitement lié au service ; corrélation infrastructure non évaluée.
- Cause technique non déduite d’une simple corrélation. Lectures bornées ; aucun accès direct au filesystem, aucune commande exécutée.
- Traces brutes non accessibles via une API publique Managed vérifiée ; les vérifications de traces proposées sont manuelles dans Managed.

#### Catalogue des preuves

| ID | API | Entité | Mesure/fenêtre |
|---|---|---|
| E1 | /api/v2/problems/deep-stable | problème | problem |
| impact | /api/v2/problems/deep-stable | problème | impact |
| E2 | /api/v2/entities/SERVICE-1111111111111111 | SERVICE-1111111111111111 | entity |
| E3 | /api/v2/metrics/builtin%3Aservice.response.time | SERVICE-1111111111111111 | builtin:service.response.time · MicroSecond · avg |
| E4 | /api/v2/metrics/query | SERVICE-1111111111111111 | builtin:service.response.time · incident · MicroSecond · avg |
| E5 | /api/v2/metrics/query | SERVICE-1111111111111111 | builtin:service.response.time · baseline · MicroSecond · avg |
| E6 | /api/v2/metrics/builtin%3Aservice.errors.server.rate | SERVICE-1111111111111111 | builtin:service.errors.server.rate · Percent · avg |
| E7 | /api/v2/metrics/query | SERVICE-1111111111111111 | builtin:service.errors.server.rate · incident · Percent · avg |
| E8 | /api/v2/metrics/query | SERVICE-1111111111111111 | builtin:service.errors.server.rate · baseline · Percent · avg |
| E9 | /api/v2/metrics/builtin%3Aservice.requestCount.total | SERVICE-1111111111111111 | builtin:service.requestCount.total · Count · value |
| E10 | /api/v2/metrics/query | SERVICE-1111111111111111 | builtin:service.requestCount.total · incident · Count · value |
| E11 | /api/v2/metrics/query | SERVICE-1111111111111111 | builtin:service.requestCount.total · baseline · Count · value |
| E2-calls | /api/v2/entities/SERVICE-1111111111111111 | SERVICE-1111111111111111 | service-relations |
| E12 | /api/v2/events | SERVICE-1111111111111111 | events |
| E13 | /api/v2/metrics/query | SERVICE-2222222222222222 | builtin:service.response.time · incident · MicroSecond · avg |
| E14 | /api/v2/metrics/query | SERVICE-2222222222222222 | builtin:service.response.time · baseline · MicroSecond · avg |
| E15 | /api/v2/events | SERVICE-2222222222222222 | events |
| E16 | /api/v2/metrics/query | SERVICE-1111111111111111 | builtin:service.response.time · incident · MicroSecond · percentile(95) |
| E17 | /api/v2/metrics/query | SERVICE-1111111111111111 | builtin:service.response.time · baseline · MicroSecond · percentile(95) |
| E18 | /api/v2/entities | SERVICE-1111111111111111 | entity-list |

### Problème sans mesures exploitables — fixture synthétique

Statut : partial. Environnement fictif managed.example ; toutes les valeurs suivantes sont simulées. Début/fin publiés : 2023-11-14T22:15:00.000Z → 2023-11-14T22:45:00.000Z. Gravité publiée de la fixture : PERFORMANCE. Impact utilisateur non quantifié.

#### Observations


#### Pistes

Aucune piste étayée dans ce périmètre.

#### Prochaines vérifications

- **Examiner les preuves publiées du problème** : Relire les événements et les entités explicitement associés au problème ; identifier la mesure et sa fenêtre avant une investigation ciblée. Raison : Peu de preuves exploitables ; cause et comparaison non établies. [preuves : E1]

#### Inconnues et limitations

- Baseline immédiatement antérieure au début publié, non garantie saine ni représentative de la saisonnalité. Moyennes de créneaux non pondérées par les requêtes ; aucune causalité déduite.
- Contrat Managed absent ou incompatible (unité/agrégation/dimension) : builtin:service.response.time
- Contrat Managed absent ou incompatible (unité/agrégation/dimension) : builtin:service.errors.server.rate
- Contrat Managed absent ou incompatible (unité/agrégation/dimension) : builtin:service.requestCount.total
- Topologie collectée à présent ; la présence historique de la relation pendant l’incident n’est pas attestée. Contexte descriptif ; proximité temporelle et relation calls ne démontrent aucune causalité.
- Aucune dépendance sortante SERVICE dans la réponse ; les relations entrantes ne sont pas utilisées comme dépendances sortantes.
- Aucun événement contextuel qualifié dans la page collectée pour SERVICE-1111111111111111 ; absence de changement ou de panne non démontrée.
- Aucune donnée contextuelle exploitable dans ce périmètre borné.
- Traces/PurePaths/spans bruts non collectés : aucune API publique Managed vérifiée. Vérification manuelle nécessaire ; représentativité et rétention inconnues.
- Latence de queue non évaluée : agrégation percentile non confirmée par le contrat.
- Aucune key request explicitement liée dans la page collectée ; endpoints réels et requêtes lentes inconnus.
- Aucun hôte explicitement lié au service ; corrélation infrastructure non évaluée.
- Cause technique non déduite d’une simple corrélation. Lectures bornées ; aucun accès direct au filesystem, aucune commande exécutée.
- Traces brutes non accessibles via une API publique Managed vérifiée ; les vérifications de traces proposées sont manuelles dans Managed.
- Aucune variation métrique qualifiée ; les preuves publiées ne suffisent pas à établir un mécanisme technique.

#### Catalogue des preuves

| ID | API | Entité | Mesure/fenêtre |
|---|---|---|
| E1 | /api/v2/problems/deep-no-evidence | problème | problem |
| impact | /api/v2/problems/deep-no-evidence | problème | impact |
| E2 | /api/v2/entities/SERVICE-1111111111111111 | SERVICE-1111111111111111 | entity |
| E2-calls | /api/v2/entities/SERVICE-1111111111111111 | SERVICE-1111111111111111 | service-relations |
| E6 | /api/v2/events | SERVICE-1111111111111111 | events |
| E7 | /api/v2/entities | SERVICE-1111111111111111 | entity-list |

### Problème réel Managed pauvre en preuves — exemple expurgé

La restitution réelle reste partial. Deux observations : logs de stockage retournés dans leur périmètre et mesure isolée sans comparaison qualifiée. Les périodes, identités et valeurs internes sont volontairement omises ici ; elles restent accessibles dans le rapport privé avec provenance. Aucune hypothèse. Prochaine vérification : compléter la comparaison temporelle, car série incomplète ou baseline absente/ambiguë. Cause racine et mécanisme non confirmés. Huit limitations de collecte ; aucune recommandation intrusive.

Catalogue expurgé : E1 problème, published-event-0 déclaration, trigger déclencheur, E2 contrat métrique, E3 entité, E4 disque, rule règle, E7 série, E11 logs. Le snapshot 1.0 et toutes les références sont validés. Ce cas ne valide aucune nouvelle analyse SERVICE/PERFORMANCE riche.

## Limites restantes et capacités non opérationnelles

- Traces/PurePaths/spans bruts : NOT_VERIFIED par API officielle Managed ; aucune abstraction/collecteur hypothétique. Vérification manuelle dans Managed.
- Key requests : uniquement configurées et reliées, deux premières de la page ; pas de classement exhaustif de tous les endpoints. Les métriques collectées ne quantifient pas une contribution au temps global.
- DB riche et key request dégradée : pas de cas réel approprié observé ; fixtures uniquement.
- Infrastructure : un hôte, CPU/mémoire et identités PG/PGI. Pas de métriques de saturation/availability/processus ni collecte automatique des événements hôte.
- Baseline précédente non garantie saine ; moyennes non pondérées et p95 par créneau non global. Historique des relations et causalité restent inconnus.
- Dépendances au-delà du périmètre ou non évaluables restent explicites ; une hausse ne désigne pas une cause.
- Scope d’API, pagination, séries vides, timeout et budgets limitent la complétude. L’ordre présenté est une priorité de vérification par preuve, jamais une probabilité causale.

## État Git et activation

Engine : branche codex/sprint-02-service-slowdown, HEAD 8c9a644, modifications Sprint 05 non committées. Aucun push/merge/rebase/changement de branche. Gateway et extension conservent leurs sources et worktrees propres. Les anciens rapports/scripts privés non suivis restent exclus. Les trois livrables de ce sprint sont nouveaux et non committés.

Gateway 127.0.0.1:4318 : processus 65270, MCP 65276, démarrés le 14 octobre à 11:23:41/42 Europe/Paris (Sprint 04.1), inchangés. API workbench HTTP 200, idle, 30 jobs accessibles. Aucun nouveau job ni modification de l’historique par ce sprint ; aucune configuration/credential modifiée. Build de validation exclusivement temporaire sous /private/tmp. Le nouveau Core n’est **pas activé** sur 4318.

## Recommandation prochain sprint

Consolider les changements après revue, puis activer le build sur 4318 uniquement avec une autorisation spécifique de redémarrage. Recette utilisateur sur un vrai incident SERVICE/PERFORMANCE lorsque disponible, avec preuve et budget visibles, ainsi que key request/DB si configurées. Priorité suivante : ergonomie de navigation entre constats et preuves/chronologie, sans moteur supplémentaire ni laboratoire de charge.
