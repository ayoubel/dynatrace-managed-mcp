# Sprint 09 — Investigation Engine Independence & Integration Readiness

14 octobre 2026, Europe/Paris. Travail local, Managed uniquement, aucune activation.

## Résultat

Le même Investigation Engine est réutilisable par une API publique documentée et par un programme TypeScript/Node exécuté dans un processus indépendant. Les 22 scénarios du corpus passent via ce client sans MCP/Gateway/Chrome, sans serveur, sans instance Managed et sans réseau. Le module public ne démarre aucun transport. Aucun second moteur SERVICE_SLOWDOWN, outil MCP, endpoint HTTP produit, CLI de production ou package publié n'est créé.

Validation finale : **584 Engine réussis, zéro échec, 47 ignorés** ; **175 Gateway**, **24 extension**, zéro échec/ignoré pour ces deux dépôts. TypeScript PASS. Les 23 tests Sprint 08 restent inclus, ainsi que 21 nouveaux tests Sprint 09. Les neuf intégrations MCP/proxy locales restent incluses dans Engine. Les **196 empreintes protégées**, PID/date de démarrage et **30 jobs dont 22 investigations** restent identiques. Aucun push/déploiement/refresh/appel Managed réel.

## A — Audit constaté

Voir [architecture et matrice](SPRINT_09_ARCHITECTURE.md). explainProblem et les ports existaient avant ce sprint ; MCP était déjà leur consommateur. Les collecteurs/règles dans capabilities ne dépendaient pas du SDK MCP au runtime. Gateway portait HTTP applicatif, jobs, accès et persistance ; Web et extension rendaient les rapports sans moteur diagnostique.

Couplages réels : import statique du modèle local optionnel, fixtures liées à Jest, limites non transmises par la projection MCP et manque de façade/contrat public consolidé. L'import modèle est devenu différé, les fixtures sont sans framework, les limites sont transmises et la façade est documentée. Les sessions mémoire bornées restent dans le collecteur historique ; elles ne nécessitent aucune session MCP. Imports de paramètres connecteurs type-only, Map et payloads any restent acceptables et documentés.

## B — Finalisation Sprint 08 et provenance

Avant tout changement Sprint 09 : trois états Git/branches examinés. Engine HEAD afa075a, branche codex/sprint-02-service-slowdown ; Gateway et extension propres sur codex/history-timeline. Rapport Sprint 08 concordant avec cinq fichiers suivis modifiés et sept nouveaux fichiers.

Secret/token scan ciblé sans correspondance, revue des diffs et fixtures synthétiques managed.example. Validation isolée relancée : 563/47 Engine, 175 Gateway, 24 extension, corpus 23/23 et compilation PASS, 196 empreintes conservées. Logs privés : /var/folders/xt/8s1wy5w50kv1qb943xzkkgvc0000gn/T/daybreak-sprint08-RzOlD8.

Commit local Sprint 08 : **edff85b**, douze fichiers uniquement. Fichiers antérieurs non suivis exclus : SPRINT_02_REPORT.md, SPRINT_02_5_VALIDATION_REPORT.md, SPRINT_03_REPORT.md, SPRINT_03_5_E2E_REPORT.md, SPRINT_05_1_ACTIVATION_REPORT.md ; scripts/replay-e2e.mjs, validate-e2e.mjs, validate-extension-dom.mjs, validate-real-metrics.cjs, validate-service-context.cjs. Aucun fichier de provenance ambiguë inclus.

## C — Modifications Sprint 09

| Fichier(s)                                                           | Modification et rôle                                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| src/core/investigation-engine/index.ts                               | Point d'entrée public, exports fonctions/types/contrats                                                                              |
| execute.ts                                                           | Même use case, options de limites explicites et outcome completed/partial/error assaini ; profil incident-intelligence forcé         |
| report.ts                                                            | Types et validateurs des rapports existants, Explain v1, références, snapshot et concordance des provenances ; aucun format remplacé |
| explain.ts                                                           | Validation de sortie du use case commun ; signature/type de retour legacy conservés                                                  |
| src/capabilities/problem-investigation.ts                            | Import modèle type-only et chargement différé exclusivement dans ancien chemin conversationnel                                       |
| src/capabilities/problem-explain.ts                                  | Adaptateur MCP consomme la façade publique, réponse legacy inchangée                                                                 |
| src/adapters/mcp/investigation-dependencies.ts, src/tools/context.ts | Projection de investigationLimits optionnelles vers Core                                                                             |
| src/core/**tests**/fixtures/quality-managed.ts                       | Ports fictifs sans jest.fn ; lectures inattendues rejetées                                                                           |
| src/core/**tests**/fixtures/diagnostic-ports.ts                      | Simulation commune extraite du corpus, instrumentation des lectures, aucune logique diagnostique                                     |
| src/core/**tests**/diagnostic-corpus.test.ts                         | Même 23 tests/assertions ; simulation réutilisée, call history Jest localement                                                       |
| src/core/**tests**/independent-api.test.ts                           | 21 tests architecture, client autonome, API, contrats, budgets, erreurs et compatibilité MCP                                         |
| examples/reference-client.ts, tsconfig.reference.json                | Programme TypeScript indépendant utilisant uniquement API publique et fixtures                                                       |
| scripts/run-reference-client.mjs                                     | Compilation temporaire et exécution Node, aucune dépendance réseau installée                                                         |
| scripts/validate-sprint09.mjs                                        | Build temporaire, trois suites, client autonome, empreintes/PID et compteurs persistés                                               |
| docs/core-public-api.md, examples/REFERENCE_CLIENT.md                | Contrat d'intégration, commandes, entrées/sorties et limites                                                                         |
| SPRINT_09_ARCHITECTURE.md, REPORT.md, TEST_MATRIX.md                 | Audit, livraison et preuves de validation                                                                                            |

Aucune modification des contrats sous src/contracts, de package.json/lockfile, du playbook SERVICE_SLOWDOWN, de Gateway ou de l'extension. README d'exemples préexistant conservé ; documentation dédiée ajoutée. Aucun déplacement gratuit de la logique existante.

## D — Démonstration et tests

Depuis la racine Engine :

```sh
.poc-runtime/bin/node scripts/run-reference-client.mjs S01
.poc-runtime/bin/node scripts/run-reference-client.mjs --all --json
.poc-runtime/bin/node scripts/validate-sprint09.mjs
```

Pour comparer également au début de ce sprint, la validation effectuée a utilisé --baseline /var/folders/xt/8s1wy5w50kv1qb943xzkkgvc0000gn/T/daybreak-sprint09-rCEpg0/baseline.json. Les chemins temporaires sont locaux à cette machine ; sans cet argument, le script compare avant/après sa propre exécution.

Entrée S01 : prod / quality-complete, ports simulés, paceMs:0. Sortie observée : completed, 15 preuves, 13 lectures, latence 100 → 300 ms, erreurs 1 → 1 %, requêtes 60 → 60 Count ; aucune hypothèse causale, mechanism unknown et LLM disabled. S08-budget : partial, sept lectures, neuf preuves et paire latence conservée. Références résolues pour les 22 scénarios ; aucune sortie diagnostique préconstruite injectée.

| Validation finale                       |      Réussis | Échecs |                   Ignorés |
| --------------------------------------- | -----------: | -----: | ------------------------: |
| Engine total (44 suites PASS)           |          584 |      0 | 47, trois suites externes |
| Dont unitaires                          |          575 |      0 |                         0 |
| Dont MCP/proxy loopback                 |            9 |      0 |                         0 |
| Dont corpus Sprint 08                   |           23 |      0 |                         0 |
| Dont indépendance Sprint 09             |           21 |      0 |                         0 |
| Gateway                                 |          175 |      0 |                         0 |
| Extension                               |           24 |      0 |                         0 |
| Client autonome                         | 22 scénarios |      0 |                         0 |
| Compilation Engine et client TypeScript |         PASS |      0 |                         0 |

MCP : incident-profile 4, token-refresh 2, token-passthrough 2, proxy 1. Les 47 ignorés externes sont capabilities 26, sorting-parameters 18, managed-auth 3, jamais comptés comme succès. D08-01/02/03 et les variantes restent protégés par le corpus et la nouvelle API. Timeouts/volumes/p95/key requests/DATABASE/HOST et anciens contrats passent via les suites existantes.

Tests d'import : graphe statique AST sans cycle runtime, exclusion SDK/transports/configuration/LLM ; cold process bloquant ces imports, fetch et timers à l'import. Les imports type-only réciproques ne constituent pas des cycles JavaScript. Le client neutralise même un flag LLM true dans son propre processus synthétique.

Pendant développement : erreurs de typage du partage des fixtures corrigées ; comparaison JSON sensible à l'ordre des clés remplacée par égalité structurelle ; nouvelle annotation typée de la fonction legacy rejetée par quatre suites historiques, donc retour legacy rétabli et type fort réservé à executeInvestigation. Aucun test historique affaibli. La première validation complète échouée est conservée dans les logs privés ; la validation finale passe. Avertissements ts-jest/util._extend et forceExit existants conservés.

Logs finaux et summary.json privés : **/var/folders/xt/8s1wy5w50kv1qb943xzkkgvc0000gn/T/daybreak-sprint09-validation-B2spSj**. Le validateur ne remplace jamais dist ; les transports d'intégration utilisent des loopbacks isolés.

## E — Préservation du runtime actif

Référence initiale privée : daybreak-sprint09-rCEpg0/baseline.json, SHA-256 de 196 fichiers (dist actif, poc, données Gateway, .env et config locale). Comparaison finale identique à cette référence et à celle du début de validation. Les empreintes des données garantissent la conservation des payloads et historiques, pas seulement du nombre de jobs.

Gateway **98536**, parent 1, démarrage 14 octobre 18:41:30 ; MCP **98541**, parent 98536, démarrage 18:41:31. PID, parents, dates et commandes inchangés. lsof confirme toujours Gateway en écoute 127.0.0.1:4318. Le build actif reste le build antérieur ; **Sprint 08 et Sprint 09 non activés sur 4318**. Les dépôts voisins restent propres, HEAD Gateway 8db37b0 et extension 048433e.

Zéro endpoint HTTP de production appelé par ce sprint. Aucun lancement/actualisation d'investigation réelle, redémarrage, remplacement de build, écriture de job/historique/config professionnelle, changement de credential, LLM actif ou remédiation. Pas de push/merge/rebase/reset/clean ni suppression de fichier utilisateur ; aucune installation réseau.

## F — Git

Engine reste sur codex/sprint-02-service-slowdown. Sprint 08 identifié par edff85b. Le commit local Sprint 09 accompagne ce rapport après validation des critères ; son hash se lit avec git log -1 et figure dans la restitution finale (pas de hash autoréférentiel dans le commit). Seuls les 21 fichiers de la table Sprint 09 sont sélectionnés. Le statut final attendu ne contient que les dix fichiers préexistants non suivis listés ci-dessus. Gateway/extension restent sur codex/history-timeline, sans nouveau commit ni changement.

## G — Limites et suite

Indépendance fonctionnelle démontrée dans un même dépôt, pas distribution d'un SDK/paquet npm autonome. HTTP Engine direct et CLI future restent à concevoir. Les sessions globales, TTL et owner historique sont indépendants de MCP mais non injectables/durables ; normalisation complète des payloads et authentification/ACL d'un pilote partagé restent à traiter.

Les limites diagnostiques du Sprint 08 restent réelles : baseline non certifiée saine, différences descriptives non statistiques, moyennes non pondérées et p95 par créneau, topologie actuelle sans flux historique ni causalité, absence de traces brutes Managed vérifiées, chemin ERROR limité à deux métriques sans volume. Timeout sans annulation réseau garantie ; limites de taille après décodage. Le contrat collection_unavailable ne distingue pas finement toutes les classes HTTP ; réponse métrique malformée réussie reste une limitation de normalisation, pas une erreur de transport inventée.

Les incidents riches réels, l'évaluation opérateur et la recette Chrome native ne sont pas exécutés. Les anciens replays assainis/privés disponibles passent hors ligne ; leur présence ne valide aucun incident réel nouveau. Un incident Managed naturel assaini et une évaluation indépendante sont nécessaires avant des promesses diagnostiques de production. Aucun mécanisme causal certain n'est affirmé.
