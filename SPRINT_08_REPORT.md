# Sprint 08 — Investigation Quality & Evidence Validation

14 octobre 2026. Dynatrace Managed uniquement. Travail local, sans activation.

## Résumé exécutif

Le corpus versionné exécute le véritable Investigation Engine sur **22 scénarios et variantes synthétiques**, avec un test supplémentaire de replay déterministe. Les dix scénarios demandés passent. Deux familles de défauts ont été reproduites puis corrigées : décisions prises sur des valeurs d'affichage dans des unités différentes ; qualification trop permissive des métriques sur le chemin SERVICE/ERROR.

Résultat final : **563 tests Engine réussis, 0 échec, 47 ignorés** (43 suites réussies, 3 ignorées) ; **175 Gateway**, **24 extension**, aucun échec ni ignoré dans ces deux dépôts. TypeScript compile dans un répertoire temporaire. Les 23 tests du corpus passent également après renforcement du comptage de toutes les lectures.

Cette validation démontre des propriétés diagnostiques sur fixtures et le maintien des non-régressions existantes. **Elle ne valide pas le moteur sur des incidents réels.** Aucun appel à Dynatrace ou à 4318, aucun nouveau job, aucune actualisation, aucun redémarrage, aucune activation LLM, aucune remédiation.

## Audit initial et référence

- Engine : branche existante codex/sprint-02-service-slowdown, HEAD afa075a ; fichiers suivis initialement propres. Rapports Sprint 02/02.5/03/03.5/05.1 et cinq scripts replay/validation déjà non suivis : conservés, sans modification ni ajout à un commit.
- Gateway et extension : branches codex/history-timeline, worktrees initialement propres, aucun fichier modifié par ce sprint.
- Documents examinés : rapports pertinents Sprint 02 à 05.1 dans Engine ; Sprint 06 dans extension ; SPRINT_07_REPORT.md et SPRINT_07_TEST_MATRIX.md dans Gateway ; ADR 0001/0003, managed-explain-spec.md, contrats et suites Core/Explain/API/MCP.
- Avant modifications : **531 tests unitaires Engine réussis**. La référence 540 du Sprint 07 inclut neuf tests d'intégration locaux ; la validation finale retrouve ces neuf tests. Les 47 tests externes restent ignorés, hors réussites.
- Stockage actuel lu hors ligne : **30 jobs, 22 investigations**. Le manifeste Gateway validation/sprint07/activation.json confirme Sprint 07 activé, profil incident-intelligence, 20 outils read-only et LLM désactivé. Ces propriétés sont également couvertes par la politique Core et les intégrations MCP locales. Aucun appel live de discovery n'a été effectué sur l'instance habituelle.

### Cartographie vérifiée

| Composant                      | Fonction réelle / fichiers                                                                                                                                  | Tests réutilisés                                                               | Lacunes / action Sprint 08                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Collecte Managed               | recordingDependencies et attachInvestigationContract dans provenance.ts ; read dans capabilities/problem-investigation.ts ; ports InvestigationDependencies | tests API, investigation-foundations, problem-investigation, MCP locaux        | Corpus d'échec au milieu de la collecte ; lectures comptées à tous les ports                        |
| Metric analysis                | metricWindows, summarizeMetricPoints, scopedMetricSeries dans core/investigation-engine/metric-analysis.ts                                                  | metric-analysis, managed-real-metrics, fixtures managed-metrics-sanitized.json | Variantes résolution, bucket absent, dimension supplémentaire et entité étrangère                   |
| SERVICE_SLOWDOWN               | runServiceSlowdown dans service-slowdown.ts ; collectExplainServiceEvidence dans capabilities/explain-service-evidence.ts                                   | service-slowdown, explain-investigation-quality                                | Scénarios S01–S10 explicites ; ERROR transversal moins strict corrigé                               |
| Dependency analysis            | directServiceRelations et collectServiceContext dans service-context.ts ; collectServiceEnrichment dans service-enrichment.ts                               | service-context, service-deep-investigation                                    | Piste dépendance omise lors du passage ms → s ; correction des règles Explain                       |
| Event correlation              | qualifyServiceEvents dans service-context.ts ; normalizeExplainEvent dans explain-event-context.ts                                                          | service-context, explain-event-context, service-deep-investigation             | Piste de changement omise lors du passage ms → s ; proximité reste hypothèse                        |
| Evidence model                 | EvidenceSchemaV1, InvestigationSnapshotSchemaV1, assertEvidenceReferences ; attachInvestigationContract                                                     | investigation-foundations et suites qualité                                    | Conservation de la preuve du descripteur ERROR et référence depuis les séries                       |
| Findings / Explain             | explainProblem dans core/investigation-engine/explain.ts → investigateManagedProblem → buildExplainReport / enrichInvestigationPresentation                 | problem-explain, explain-investigation-quality                                 | Décisions numériques sur mesures brutes, sortie Explain inchangée                                   |
| Next Checks                    | enrichInvestigationPresentation et explain-remediation.ts                                                                                                   | suites qualité, service-deep-investigation                                     | Vérifications justifiées par les paires, cohérence au changement d'échelle et en collecte partielle |
| Key Requests / DATABASE / HOST | collectServiceEnrichment, service-context ; liens explicites, serviceType DATABASE, CPU/mémoire, p95 par créneau                                            | service-deep-investigation et service-context                                  | Suites existantes conservées ; pas de nouveau collecteur ni de nouvelle promesse causale            |

Chemins ci-dessus relatifs à src/. Le Core consomme des ports structurels ; aucun besoin de Gateway, serveur MCP, CLI ou navigateur pour lancer le corpus. L'implémentation historique de collecte reste dans capabilities/, conformément à ADR 0001. Le stockage de sessions en mémoire reste un couplage historique borné, sans extraction supplémentaire nécessaire pour ce sprint.

## Architecture de validation

1. La fixture Managed de la suite qualité existante est extraite, sans modification de ses données, vers src/core/**tests**/fixtures/quality-managed.ts. L'ancienne suite conserve tous ses scénarios et assertions.
2. sprint-08-scenarios.json versionne les paramètres synthétiques, la sévérité et les perturbations. Horloge fixe, périodes absolues, six buckets de cinq minutes, IDs et URL publics fictifs.
3. diagnostic-corpus.test.ts simule uniquement les ports connecteurs (problèmes, entités, descripteurs, séries, événements, listes de key requests). Aucune sortie d'analyse ou rapport préconstruit n'est injecté.
4. Chaîne exécutée : explainProblem → collecte et provenance réelles → runServiceSlowdown ou chemin ERROR existant → analyses métriques/contextuelles réelles → Explain v1 → Evidence/Investigation 1.0.
5. Assertions indépendantes de la rédaction complète : valeurs/sommes/moyennes, périodes, agrégation, entités, références résolues, sources GET, limites/états, statut causal unknown, pistes hypothesis, vérifications conditional. Le test de replay compare les données diagnostiques et Explain à horloge fixe ; il exclut les identifiants UUID de session et n'utilise pas de snapshot textuel de référence.

Les formes Managed réutilisent les conventions déjà vérifiées : Map par alias au port, EntityStub imbriqué pour les événements, metricId avec agrégation, dimensionMap, timestamps/values et resolution. Les anciennes captures assainies restent exercées par leurs suites. Les valeurs, événements et incidents du nouveau corpus sont synthétiques, jamais présentés comme une capture de production.

## Scénarios et portée diagnostique

Voir SPRINT_08_TEST_MATRIX.md pour les 22 lignes et le replay. S03 utilise le playbook SERVICE_SLOWDOWN lorsque le problème publié est PERFORMANCE : latence stable, erreurs 1 % → 5 %, volume 60 → 60. S03-error démontre séparément le chemin transversal ERROR existant, sans nouveau playbook. Ce chemin conserve son plafond de deux métriques et ne collecte pas le volume ; il ne peut donc produire la piste qualifiée « sans hausse du volume ».

S05 conserve la hausse de latence, mais exclut une série d'erreurs possédant une dimension supplémentaire : rapport partial, aucune fusion. S09 et variantes excluent les comparaisons de données non comparables. S10 présente des symptômes mais aucune preuve discriminante : mécanisme unknown et lecture manuelle des traces à proposer.

Le moteur constate des écarts descriptifs ; il ne dispose pas d'un modèle statistique de significativité ou d'une baseline certifiée saine. Un statut completed indique la complétude du périmètre collecté, pas la vérité d'une cause ou la couverture exhaustive du problème.

## Défauts démontrés et corrections

### D08-01 — Décisions sur valeurs formatées

Avant : baseline 900000 MicroSecond affichée 900 ms ; incident 1800000 MicroSecond affiché 1,8 s. Comparer 1,8 à 900 supprimait trois vérifications légitimes : traces du service, dépendance également ralentie, changement publié proche. Le cas inverse risquait une fausse hausse.

Après : la fonction interne isIncreased retrouve les séries via evidenceRefs et compare leurs mesures dans la même unité collectée, avec l'agrégation appropriée. Les valeurs et unités de présentation restent compatibles. Les règles dépendance, changement, key request/hôte, erreurs/volume, traces et p95 utilisent cette qualification. Tests de reproduction : S01-unit-boundary, S02-unit-boundary, S06-unit-boundary ; S07-unit-boundary-decrease protège le cas inverse.

### D08-02 — Contrat et valeurs ERROR insuffisamment validés

Avant : un descripteur Byte/sum/HOST pour le taux d'erreur ou une série à 150 % étaient comparés, avec rapport completed.

Après : ID, unité autorisée, avg publié et dimension dt.entity.service requis ; sinon aucune requête de cette métrique. Valeurs négatives ou erreurs >100 % rendent la série partial et interdisent sa comparaison. Les séries déjà obtenues restent dans les preuves avec leurs limites. Le descripteur confirmé est conservé et référencé depuis les séries et findings. Tests : S03-error-invalid-contract, S03-error-invalid-values ; cas valide S03-error.

La fixture historique problem-explain.test.ts a reçu les deux champs de descripteur Managed qu'elle omettait (aggregationTypes, dimensionDefinitions) ; ses attentes restent intactes.

### Distinction importante

Le premier passage des 21 cas initiaux donnait 15 réussites et 6 échecs : cinq reproduisaient les défauts ci-dessus ; le sixième exigeait à tort une erreur de transport pour une réponse structurée malformée. Le moteur signalait déjà cette dernière comme série absente/ambiguë et rapport partial. L'assertion a été corrigée pour vérifier cette limite plutôt que changer le contrat des erreurs. Des erreurs temporaires d'import/export et de collision de nom introduites pendant l'extraction ont été corrigées avant la validation finale ; elles ne sont pas des défauts antérieurs du moteur.

## Compatibilité et architecture

Evidence/Investigation **1.0**, enveloppe legacy **version 1**, Explain **v1**, champs de présentation et requête publique inchangés. Le chemin ERROR ajoute une preuve de descripteur ; aucun consommateur ne doit supposer un nombre fixe de preuves. Les contrats Zod et les références récursives sont vérifiés sur tous les scénarios. Les intégrations MCP testent le build corrigé dans un répertoire temporaire, avec les vrais transports stdio/HTTP et une API loopback simulée.

Aucune dépendance ajoutée, aucun nouveau playbook ou outil, aucun changement de profil read-only, aucune logique métier déplacée vers Gateway/extension. LLM désactivé dans le corpus ; les tests MCP existants vérifient aussi son blocage par le profil même quand le processus de fixture essaie de l'activer.

## Validation finale et limites

| Validation                                        | Réussis | Échoués | Ignorés / non exécutés                |
| ------------------------------------------------- | ------: | ------: | ------------------------------------- |
| Engine complet : unitaires + intégrations locales |     563 |       0 | 47 ignorés, 3 suites externes         |
| Dont unitaires                                    |     554 |       0 | 0                                     |
| Dont MCP / proxy locaux                           |       9 |       0 | 0                                     |
| Dont corpus (inclus dans les unitaires)           |      23 |       0 | 0                                     |
| Gateway                                           |     175 |       0 | 0                                     |
| Extension                                         |      24 |       0 | 0                                     |
| TypeScript, build temporaire                      |    PASS |       0 | Aucun dist actif remplacé             |
| Captures/exemples historiques existants           |    PASS |       0 | Replay hors ligne, inclus dans Engine |
| Incidents réels riches / appels Managed           |       — |       — | NON EXÉCUTÉ                           |
| Recette Chrome native / activation Sprint 08      |       — |       — | NON EXÉCUTÉ                           |

Les neuf intégrations locales : incident-profile 4, token-refresh 2, token-passthrough 2, proxy 1. Les 47 externes : capabilities 26, sorting-parameters 18, managed-auth 3 ; aucune credential professionnelle configurée dans l'environnement isolé. Les tests historiques incluent le replay de capture pauvre disponible localement et les formes assainies métriques/topologie. Si la capture privée pauvre est absente sur une autre machine, son test se marque explicitement ignoré.

Les suites existantes de budgets, timeouts, volumes, p95, DB, key requests et HOST passent. Des avertissements préexistants ts-jest/util._extend et forceExit restent visibles dans les logs ; aucun test ignoré n'est compté comme réussite. Les logs isolés et JSON Jest sont privés sous le chemin affiché par le script, sans ajout à Git.

## Préservation de l'environnement

196 empreintes SHA-256 du build actif, données Gateway et configurations locales surveillées identiques avant/après la validation, et identiques aux empreintes relevées au début du sprint. Workbench et historique n'ont subi aucune écriture ; 30 jobs dont 22 investigations restent présents. Aucun endpoint de 4318 appelé, aucun job/refresh lancé, aucun processus de production redémarré. Les ports utilisés par les intégrations sont éphémères, leurs API et tokens fictifs. Le fichier personnel temporaire du test de configuration est absent après exécution.

Aucune donnée Managed privée n'est ajoutée aux nouveaux fichiers. Les trois dépôts restent sur leurs branches ; seul Engine comporte les changements Sprint 08. Aucun commit créé, push, merge, rebase, reset ou suppression de fichier utilisateur. Le Sprint 08 n'est pas activé sur 4318 ; le build Sprint 07 reste en place.

## Relance automatique

Depuis Engine, avec Node 26.5.1 et les dépendances locales déjà présentes :

```sh
export PATH="$PWD/.poc-runtime/bin:$PATH"
npm run test:diagnostic
node scripts/validate-sprint08.mjs
```

La première commande relance les 23 assertions du corpus via Jest existant, sans MCP ni réseau. La seconde compile dans un dossier temporaire privé, exécute les suites Engine/MCP contre ce build puis Gateway/extension si les dépôts voisins existent, compare les empreintes et produit summary.json et les logs. Elle n'utilise ni ne remplace dist/ de production et n'importe pas les configurations DT professionnelles. Les dépendances/runtimes doivent être préinstallés ; aucun téléchargement automatique. L'autorisation d'écriture temporaire et d'écoute loopback peut être requise par le sandbox.

Les assertions diagnostiques vivent dans diagnostic-corpus.test.ts ; les données versionnées dans fixtures/sprint-08-scenarios.json. Aucun serveur de fixture à démarrer et aucun job à créer. UUID de session non reproductible par conception ; contenu diagnostique reproductible à horloge fixe.

## Sprint 09 recommandé

1. Recueillir, avec autorisation bornée, un incident Managed naturel adapté et un avis opérateur indépendant, sans injection ; rejouer une capture assainie avec attentes diagnostiques annotées.
2. Évaluer la représentativité de la baseline, la pondération par requêtes et les limites d'une moyenne des p95 ; ne pas transformer un seuil de différence en preuve causale.
3. Documenter le plafond de deux métriques du chemin ERROR et décider sur preuves si un volume de requêtes supplémentaire apporte une valeur suffisante.
4. Obtenir une capacité Managed vérifiée pour traces et placement historique avant d'affirmer des mécanismes ou des contributions de dépendances.
