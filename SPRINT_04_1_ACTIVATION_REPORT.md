# Daybreak — Sprint 04.1 : Activation & Functional Acceptance

14 octobre 2026, Europe/Paris. **Consolidation et activation réussies ; recette Chrome native restante.** L’utilisateur a explicitement autorisé toutes les actions, y compris le redémarrage, sans attente d’un nouveau GO.

## 1. Consolidation Git

Dépôt Engine : `dynatrace-managed-mcp-poc`. Branche conservée : `codex/sprint-02-service-slowdown`. HEAD initial : `6dd8ff90937f11ea3e4f38bc5f42b76dafe9e6d9`.

Commit Sprint 04 : **81cb9e78d6a0c1215353f903269693e23b01ac27**, `feat: make Explain findings actionable with evidence-backed checks`.

Sept fichiers sélectionnés explicitement :

- `src/capabilities/problem-explain-report.ts` : seul fichier de production, modifications Sprint 04 et formatage.
- `src/capabilities/__tests__/explain-investigation-quality.test.ts` : scénarios déterministes embarqués, test de rendu immuable et replay privé optionnel.
- `src/capabilities/__tests__/general-investigation.test.ts` et `problem-investigation.test.ts` : régressions CPU/disque.
- `src/capabilities/__tests__/problem-explain.test.ts` et `src/core/__tests__/service-context.test.ts` : attentes de restitution Sprint 04.
- `SPRINT_04_REPORT.md` : audit et exemples assainis, état historique avant activation.

Pas de nouvelle fixture privée nécessaire : les scénarios synthétiques sont embarqués dans les tests, les fixtures assainies antérieures restent versionnées. Le replay réel est optionnel si sa capture locale est absente après un clone neuf.

Revue des sept fichiers contre les secrets configurés et formats de tokens/clés privées : zéro correspondance. Aucun secret affiché ; contrôle du diff indexé réussi. Aucun `git add .`.

Exclusions conservées : `validation/` entier (captures Managed, exports, logs et runtime), credentials et configurations locales, `.poc-runtime/`, `dist/`, `node_modules/`, données Gateway. Les rapports et scripts de recette privés non suivis des sprints antérieurs restent exclus. Les nouvelles preuves/sauvegardes sont hors des trois dépôts, dans `/Users/ayoubelyagoubi/Documents/daybreak-sprint04-1-private/`.

Aucun push, merge, rebase ou changement de branche. Gateway et Chrome propres, HEAD inchangés : respectivement `381bf03634cb19760d475d7053a25a790d7910ac` et `9d94e9a9eac6fcabf9d684ff2767880b67bf106a`. Ce rapport fait l’objet d’un commit documentaire séparé, identifiable avec `git log -- SPRINT_04_1_ACTIVATION_REPORT.md`.

## 2. Tests et compilation

- Engine rejoué avant consolidation : **506/506**, **37 suites**.
- Gateway : **148/148** et extension : **15/15**, résultats du Sprint 04 conservés ; sources inchangées, pas de répétition inutile des mêmes suites pendant 04.1.
- Compilation complète `tsc --build --force` : réussie.
- Validation fonctionnelle supplémentaire : quatre cas avec les renderers existants, références de preuves, historique simulé et statuts distincts : réussie.

Le test config-loader nécessite l’accès hors sandbox à son fichier temporaire personnel ; absence de `~/.test-dt-config.json` vérifiée avant/après. Journal de tests : `/private/tmp/daybreak-sprint04-1-engine.log`.

Versions conservées : Node **26.5.1**, Engine/MCP **1.1.1**, Gateway **0.2.0**, extension **0.1.0**. Pas de changement de contrat : Explain v1, Evidence/Investigation 1.0.

## 3. Build réellement activé

Build produit le 14/10 à **11:22:58 Europe/Paris**, depuis le commit 81cb9e7. Présence vérifiée dans le JS compilé de `enrichInvestigationPresentation`, « Prochaines vérifications », piste d’erreurs sans hausse de volume et piste de dépendance lente.

| Fichier | SHA-256 |
|---|---|
| dist/index.js | 1e31ff6c7e5777eb4799ccfb87eca148b577a97152d2393e02660a1c833ab392 |
| dist/capabilities/problem-explain-report.js | 2a625d6be3ddb09d3fd91e93503384b46d7dd4ba9b9c408e85ac35a31fc581b1 |
| dist/core/investigation-engine/service-slowdown.js | 917a3197c51fde65e64d7a6a1b4f19af23cdae2bcf037cbe70e37b55d62fa9e4 |
| dist/core/investigation-engine/service-context.js | fccd96494c8427c31ac35cfd2f361d9b95229ff083e954dbc51fd37a9169a2e4 |

L’entrée et les collecteurs n’ont pas changé de contenu ; le module de restitution Explain contient les modifications du Sprint 04. Empreintes reconfirmées après redémarrage. Les nouveaux processus MCP démarrent après ce build et chargent le `dist/index.js` du dépôt existant.

## 4. Redémarrage et état Gateway/MCP

Avant arrêt : Gateway **58037**, MCP **58043**, démarrés lors du Sprint 03.6. Aucun job Workbench actif, aucune découverte en cours. Sauvegarde actualisée immédiatement avant arrêt.

Plan annoncé et exécuté avec accord : SIGTERM sur Gateway, attente de sortie du Gateway et de son enfant MCP, contrôle de libération du port, puis même `scripts/start-extension.sh` lancé en processus détaché. Aucun arrêt forcé. Répertoire de travail conservé : `/Users/ayoubelyagoubi/Documents/sre-morning-check`. Origine d’extension conservée, port explicitement 4318, sorties dans le journal privé `gateway-4318.log`.

Après activation :

- Gateway **65270**, parent 1, démarré à **11:23:41 Europe/Paris**.
- MCP **65276**, enfant de Gateway, démarré à **11:23:42**, Node local et env-file existants, chemin absolu du moteur `dist/index.js`.
- Écoute uniquement **127.0.0.1:4318** ; aucun listener 4319 observé.
- `/api/status`, `/api/workbench`, `/api/capabilities`, `/api/extension/context` : **HTTP 200**.
- Profil Gateway et MCP **incident-intelligence** ; LLM désactivé dans les deux processus ; télémétrie MCP désactivée.
- **20 outils exposés, tous readOnly=true**, dont Explain. Aucun outil d’écriture exposé.
- Processus encore actifs lors du contrôle final ; aucune opération en cours après relance.

Les empreintes de `poc/.env`, `poc/dt-config.yaml`, `.vscode/mcp.json` et des configurations locales Gateway sont inchangées. Ni credentials, ni configuration, ni ports, ni sources Gateway/Chrome modifiés.

## 5. Sauvegarde et historique

Sauvegardes privées `data-before/` puis `data-at-stop/`, cinq fichiers : environments.json, history.json, preferences.json, workbench.json, workbench.json.slo-gates. Fichiers de sauvegarde en mode 0600 ; manifeste SHA-256 conservé.

Après relance : **30 jobs**, **10 étapes d’actualisation**, **12 instantanés d’historique** accessibles. Les 30 jobs ont chacun été relus par HTTP 200 et leur payload complet comparé exactement à la sauvegarde, incluant rapports initiaux et étapes historiques : identiques.

workbench.json, history.json, preferences.json et workbench.json.slo-gates sont identiques octet par octet. Seul `updatedAt` change dans environments.json à la redécouverte ; catalogue inchangé. Aucune réinitialisation ni éviction de job. Les sessions MCP en mémoire sont renouvelées au redémarrage ; cette limite existante n’efface pas les rapports persistés.

## 6. Explain sur Managed existant

Test **réel, en lecture**, terminé à **11:24:44 Europe/Paris**. Utilisation du problème existant de la recette 03.5, pauvre en données, sans publier ses identifiants internes. Son intitulé de test et l’absence de marqueur synthétique ne permettent pas de certifier une origine naturelle ; aucun incident naturel revendiqué.

Client MCP direct avec la définition de lancement habituelle et le build activé ; processus de test fermé proprement. Aucun job créé dans Gateway, afin de préserver les 30 jobs. Cela vérifie la collecte et restitution MCP réelle, tandis que l’écoute/capacités Gateway et la conservation des rapports sont vérifiées séparément ; ce n’est pas une nouvelle exécution Explain HTTP persistée dans Gateway.

Résultat :

- Rapport **partial**, version 1 ; mécanisme causal **unknown** ; LLM disabled.
- **15 lectures métier toutes réussies**, sources tracées GET ; **9 preuves**.
- **2 constats**, **0 piste non étayée**, **1 prochaine vérification** : compléter la comparaison temporelle à partir du contrat et de la couverture des données, sans affirmer une variation.
- **8 limitations de collecte**, **10 inconnus/limites** dans la restitution enrichie.
- Schéma InvestigationSnapshotV1 et références de preuves valides.
- shortTerm et prevention vides ; aucune purge, extension, redémarrage, rollback ou correction de configuration recommandée.

L’initialisation MCP existante peut effectuer l’introspection read-only de token via POST apiTokens/lookup ; ce n’est pas une mutation de configuration ni une lecture métier GET.

Recherche SERVICE bornée : une page, maximum 20 problèmes, dernières 30 journées, filtre type(SERVICE). Un problème retourné, **aucun candidat PERFORMANCE** dans cette page. Aucune absence globale extrapolée, aucune création d’incident ou d’événement. La recette réelle des pistes SERVICE_SLOWDOWN riches reste manquante.

## 7. Compatibilité de la restitution Chrome

Renderers existants `renderExplain`, `renderExplainEvidence` et `renderHistory`, exécutés avec un **DOM simulé** ; aucun changement de source UI.

| Rapport | Constats | Pistes | Vérifications | Références des boutons |
|---|---:|---:|---:|---|
| Nouveau rapport Managed réel | 2 | 0 | 1 | Toutes affichables |
| Fixture métriques complètes | 3 | 0 | 1 | Toutes affichables |
| Fixture dépendance ralentie | 5 | 1 | 1 | Toutes affichables |
| Fixture baseline absente | 3 | 0 | 1 | Toutes affichables |

Titres, textes, éléments manquants, raisons des vérifications et preuves sont consommés. Les boutons de preuves ont été invoqués dans le DOM simulé et toutes les références correspondent à des preuves affichées. Aucune section de correction intrusive.

Historique simulé à deux étapes : « Analyse initiale » et « Actualisation n°1 », exécution « Terminée » distincte du rapport « Partiel ». Cette simulation ne crée aucun job et ne revendique pas une nouvelle actualisation Managed. La persistance réelle existante est validée séparément par les comparaisons du stockage et les lectures HTTP.

**Chrome natif non testé pour Sprint 04.1** : la simulation ne valide pas les interactions natives, la géométrie ou les permissions du panneau. La recette 03.6 manuelle communiquée par l’utilisateur ne remplace pas celle du nouveau rendu.

## 8. Recette manuelle courte

1. Ouvrir Daybreak dans Chrome, connecté à 4318.
2. Sélectionner un problème Managed existant ; choisir SERVICE/PERFORMANCE si disponible.
3. Lancer Explain et attendre la fin de l’exécution.
4. Examiner « Observations et preuves », « Hypothèses à vérifier » lorsqu’elles existent et « Que faire maintenant ». Vérifier faits, éléments manquants et raisons des prochaines vérifications. Un problème pauvre doit rester explicitement partiel ; aucune hypothèse n’est obligatoire.
5. Ouvrir les boutons « Preuves » et vérifier l’entité, la fenêtre, les valeurs/unités et les limites correspondantes.
6. Actualiser le même dossier d’investigation.
7. Vérifier les deux étapes, les rapports séparés et leurs horodatages ; fermer puis rouvrir le panneau et retrouver l’investigation et son historique.

Distinguer exécution completed/« Terminée », rapport partial/« Partiel » et état OPEN/CLOSED du problème. La limite préexistante de 30 jobs s’applique à un nouvel Explain manuel ; l’historique actuel complet est sauvegardé avant la recette. Une actualisation du même dossier conserve ses étapes sans créer un nouveau job.

## 9. Limites et recommandation Sprint 05

Activation technique et consommation par les renderers existants réussies, sans perte d’historique. Recette native Chrome du Sprint 04 restante. Aucun problème SERVICE/PERFORMANCE exploitable trouvé dans la recherche bornée ; les pistes riches restent couvertes par fixtures et ne sont pas présentées comme validées sur un incident réel.

Pour Sprint 05 : terminer la recette opérateur sur un problème approprié, vérifier la pertinence des vérifications proposées et leur lisibilité dans le panneau. N’ajouter une capacité de collecte que si un manque concret est démontré ; aucun besoin de nouveau playbook, LLM ou moteur générique établi par ce sprint.

Preuves détaillées privées : build-manifest.json, config-before.json, data-at-stop-manifest.json, preservation-result.json, explain-result.json, explain-report.json, service-search-summary.json, service-search-private.json, dom-results.json et exports DOM sous `daybreak-sprint04-1-private/`. Aucun payload interne ajouté à Git.
