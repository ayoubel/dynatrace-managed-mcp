# Daybreak — Sprint 03.6 : consolidation et activation locale

État au 14 octobre 2026, Europe/Paris. **Consolidation et activation terminées.** Redémarrage autorisé par le message utilisateur « oui », effectué le 14 octobre à 10:04 Europe/Paris. Chrome natif reste à recetter manuellement.

## Git et périmètre

Trois dépôts existants, un seul worktree chacun ; aucune branche modifiée.

| Dépôt | Branche conservée | HEAD initial |
|---|---|---|
| Investigation Engine : dynatrace-managed-mcp-poc | codex/sprint-02-service-slowdown | 13f008a75f709cdcccd9644752f72878881cb93e |
| Gateway : sre-morning-check | codex/history-timeline | 381bf03634cb19760d475d7053a25a790d7910ac |
| Chrome : daybreak-browser-extension | codex/history-timeline | 9d94e9a9eac6fcabf9d684ff2767880b67bf106a |

Gateway et Chrome propres : aucun commit. Aucun push, merge, rebase, changement de branche ni staging global.

Commit Engine créé : **de8fc70239bb929481698431eed0774f38aae0b6**, `feat: consolidate metric analysis and service slowdown context` (20 fichiers).

- Sprint 02 : metric-analysis.ts, service-slowdown.ts, intégrations Explain/general/problem-investigation/provenance et tests correspondants.
- Sprint 02.5 : ratios de budget Metrics API, test managed-real-metrics et données structurelles assainies.
- Sprint 03 : service-context.ts, dépendances directionnelles/événements, intégration slowdown/provenance et tests.
- Sprint 03.5 : aucune modification de production ; scripts, rapports et captures de recette conservés localement.

Les modifications des sprints sont entrelacées dans les mêmes modules : un commit cohérent conserve leur état final. Commit documentaire préparatoire : **e95aecf**, `docs: record consolidation and proposed local activation`. Un troisième commit documentaire enregistre les résultats d’activation (identifiable avec `git log -- SPRINT_03_6_ACTIVATION_REPORT.md`).

## Confidentialité et exclusions

19 fichiers source/tests/fixtures sélectionnés contrôlés contre deux secrets configurés, formats de tokens Dynatrace et clés privées : zéro correspondance. Aucune valeur secrète affichée. `git diff --check` et contrôle du diff indexé passent.

Les fixtures versionnées remplacent les IDs, les mesures par des valeurs synthétiques et décalent les horodatages sur les mêmes buckets de cinq minutes. Elles retirent noms internes, URLs, propriétés et données inutilisées. Elles testent les formats et la couverture, pas les mesures de production. Les originales ne sont pas altérées.

Exclusions volontaires :

- `validation/` entier : captures Managed, recherches, télémétrie, jobs et historique capturés, exports DOM, logs, résultats et runtime. Nouvelle règle `.gitignore`.
- `SPRINT_02_REPORT.md`, `SPRINT_02_5_VALIDATION_REPORT.md`, `SPRINT_03_REPORT.md`, `SPRINT_03_5_E2E_REPORT.md` : conservés localement non suivis, contiennent contexte et identifiants internes.
- `scripts/replay-e2e.mjs`, `scripts/validate-e2e.mjs`, `scripts/validate-extension-dom.mjs`, `scripts/validate-real-metrics.cjs`, `scripts/validate-service-context.cjs` : scripts de validation locaux, dépendances aux captures et/ou identifiants internes ; non suivis.
- Credentials/configuration : `poc/.env`, `poc/dt-config.yaml`, `.env`, `.dt-mcp/`, configurations locales Gateway, stockage `data/`, runtime `.poc-runtime/`, `node_modules/`, `dist/`, caches et fichiers temporaires restent ignorés.
- Sauvegardes/manifestes privés : dossier voisin `daybreak-sprint03-6-private/`, hors des trois dépôts. Ne pas publier ses données.

Le code est consolidé ; les fichiers de recette exclus restent visibles comme non suivis et ne doivent pas être ajoutés sans assainissement.

## Versions, build et tests

Node 26.5.1 ; Engine/MCP 1.1.1 ; Gateway 0.2.0 ; extension 0.1.0.

Compilation TypeScript complète `tsc --build --force` réussie, le 14/10 vers 09:22 Europe/Paris. Empreintes SHA-256 :

| Build | SHA-256 |
|---|---|
| dist/index.js | 1e31ff6c7e5777eb4799ccfb87eca148b577a97152d2393e02660a1c833ab392 |
| metric-analysis.js | a5168685930d350c8469c5dd638d7cedea6007d4ab459a198ba9294c4b788f67 |
| service-slowdown.js | 917a3197c51fde65e64d7a6a1b4f19af23cdae2bcf037cbe70e37b55d62fa9e4 |
| service-context.js | fccd96494c8427c31ac35cfd2f361d9b95229ff083e954dbc51fd37a9169a2e4 |

Tests finaux : Engine **488/488, 36 suites**, Gateway **148/148**, extension **15/15**. Journaux locaux dans `/private/tmp/daybreak-03-6-*-tests.log`. L’accès hors sandbox a été nécessaire pour le test config-loader qui écrit puis supprime `~/.test-dt-config.json` ; absence vérifiée avant et après. Les premiers essais des fixtures assainies ont signalé une résolution omise et un décalage non aligné ; corrigés sans modifier les assertions, puis suite complète verte.

## Processus, stockage et activation

Gateway PID **46178**, démarré le 13/10 à 16:04:12 ; MCP enfant **46185**, démarré à 16:04:13. Gateway écoute uniquement `127.0.0.1:4318`. Aucun listener 4319 observé. Ces processus antérieurs au Sprint 03 ont été arrêtés après autorisation.

Répertoire de travail Gateway : `/Users/ayoubelyagoubi/Documents/sre-morning-check`. `.local-config.json` pointe sur `.vscode/mcp.json` du moteur. Celui-ci lance `/bin/sh scripts/start-local.sh`, avec Node local, configuration Managed et env-file existants. Le lanceur charge `dist/index.js`, filtre les tools de token et désactive la télémétrie par défaut. Profil actif relevé : `incident-intelligence`, LLM désactivé, origine Chrome existante conservée.

Stockage relatif au répertoire Gateway : environments.json, history.json, preferences.json, workbench.json, workbench.json.slo-gates. Sauvegarde privée des cinq fichiers et manifeste SHA-256 créés sous `daybreak-sprint03-6-private/data-before` et `data-before-manifest.json`.

Avant activation : `/api/workbench` et `/api/capabilities` HTTP **200**, aucun job actif ; **30 jobs**, **8 étapes de continuation** persistées. Un job est `uncertain`, état préexistant. Le Gateway limite la liste à 30 jobs : un nouvel Explain persisté évincerait le plus ancien. Le test d’activation utilisera directement le MCP configuré pour éviter cette éviction, puis vérifiera les anciens jobs par HTTP. Une nouvelle sauvegarde des cinq fichiers a été prise juste avant arrêt sous `data-at-stop/`, avec manifeste SHA-256 privé.

Commandes présentées et autorisées, exécutées après nouvel examen de l’absence d’opération active :

```sh
kill -TERM 46178
# Attendre la sortie de 46178 et de son enfant 46185, et la libération de 4318.
# Si la fermeture échoue : diagnostic ; aucun kill forcé automatique.
cd /Users/ayoubelyagoubi/Documents/sre-morning-check
PORT=4318 \
DAYBREAK_EXTENSION_ORIGIN=chrome-extension://dpbdmepelpgnipbagapanpllmniflknb \
nohup /bin/sh scripts/start-extension.sh \
  > /Users/ayoubelyagoubi/Documents/daybreak-sprint03-6-private/gateway-4318.log 2>&1 < /dev/null &
```

Le lanceur configure les deux profils incident-intelligence et désactive le LLM. L’arrêt SIGTERM ferme les clients MCP via registry.close(). Le redémarrage garde le répertoire, les fichiers de stockage et la configuration existants. Les sessions MCP en mémoire expirent au redémarrage ; les rapports persistés restent distincts et accessibles. Aucun nouveau port permanent ni modification Chrome prévue.

L’arrêt SIGTERM a fait sortir les anciens PID 46178 et 46185, sans arrêt forcé. Le premier lancement nohup n’a pas persisté dans le shell d’exécution (journal vide, connexion refusée). Le même script a ensuite été lancé avec Node child_process.spawn, detached=true et unref(), stdin ignoré et sorties vers le même journal privé. Aucun changement de script ni de configuration.

Processus persistants confirmés à la fin : Gateway **58037**, démarré à **10:04:15 Europe/Paris**, parent 1 ; MCP enfant **58043**, démarré à **10:04:16**, utilisant le Node existant et le chemin absolu du moteur dist/index.js avec l’env-file existant. Les quatre empreintes du build correspondent au manifeste avant relance ; dates de build antérieures au démarrage des nouveaux processus.

Les deux processus portent DT_MCP_PROFILE=incident-intelligence et DT_MCP_OLLAMA_ENABLED=false. Gateway porte DAYBREAK_PROFILE=incident-intelligence et DAYBREAK_DISABLE_LOCAL_LLM=true ; le MCP porte DT_MCP_ENABLE_TELEMETRY=false. Aucun secret affiché. L’écoute est uniquement 127.0.0.1:4318 ; aucun listener 4319.

/api/workbench, /api/capabilities et /api/extension/context répondent **HTTP 200**. Un environnement disponible, LLM désactivé, 20 outils exposés en lecture seule, dont Explain ; aucun outil d’écriture dans les capacités de l’instance habituelle.

## Résultats d’activation

- Redémarrage : **réussi après accord**, processus persistants confirmés.
- Core récent : **activé** via le nouveau MCP 58043 de Gateway.
- Explain non destructif : **réussi à 10:05:12 Europe/Paris**, sur le même problème Managed existant que Sprint 03.5, sans publication d’identifiant interne. Client MCP direct utilisant la définition de lancement habituelle ; processus de test fermé proprement. Ce test ne constitue pas une nouvelle création de job HTTP dans Gateway ni une interaction Chrome.
- Rapport version 1, statut **partial**, **9 preuves**, **8 limitations**, **15 traces de lecture toutes ok** ; LLM disabled. Schéma InvestigationSnapshotV1 et références de preuves valides. Aucune mutation Managed ni création de job habituelle.
- Historique : les **30 jobs** sont listés et chacun retourne HTTP 200 ; comparaison exacte des payloads complets avec la sauvegarde, incluant rapports initiaux et **8 étapes d’actualisation**, réussie. **12 instantanés** accessibles via /api/history. workbench.json, history.json, preferences.json et workbench.json.slo-gates sont identiques octet par octet. Dans environments.json, seul **updatedAt** a changé à la redécouverte ; catalogue inchangé.
- Chrome natif : **non testé**, procédure ci-dessous prête.

Preuves privées : build-manifest.json, data-at-stop-manifest.json, preservation-result.json, environment-change-fields.json, explain-result.json et explain-report.json sous daybreak-sprint03-6-private/. Aucun payload Managed ni sauvegarde ajouté à Git.

## Recette manuelle Chrome après activation

1. Ouvrir Daybreak dans Chrome ; vérifier connexion à l’instance habituelle 4318.
2. Sélectionner un problème Managed existant, relever son identifiant ; choisir SERVICE/PERFORMANCE si disponible pour exercer le contexte enrichi.
3. Lancer Explain et attendre la fin de l’exécution.
4. Ouvrir le rapport et ses preuves : chaque référence doit ouvrir une preuve ; vérifier les observations, fenêtres métriques et limitations. L’absence de baseline doit rester explicite.
5. Actualiser l’investigation depuis le même dossier.
6. Dans Historique, vérifier « Analyse initiale » et « Actualisation n°1 », chacune avec son horodatage, son rapport et ses preuves. Le rapport initial doit rester inchangé.
7. Fermer puis rouvrir le panneau ; retrouver l’investigation, les deux étapes et leurs rapports.

Distinction vérifiée dans le code et les tests existants : `job.status=completed` décrit une exécution terminée ; `report.status=partial` décrit une analyse incomplète. Le panneau Explain affiche « analyse partielle » et l’historique sépare l’exécution « Terminée » du rapport « Partiel ». Un rapport complet ne doit pas recevoir cette mention. Ne pas confondre le statut OPEN/CLOSED du problème avec ces deux états.

## Limites et risques

Chrome natif et SERVICE_SLOWDOWN sur un vrai SERVICE/PERFORMANCE restent à valider. Le test d’activation est une lecture Managed réussie ; il ne certifie pas la causalité des constats. Le redémarrage interrompt les sessions MCP mémoire ; attendre la fin des opérations avant arrêt. La limite préexistante de 30 jobs impose de sauvegarder l’historique avant une nouvelle recette manuelle. Aucune configuration, migration de stockage ou fonctionnalité applicative ajoutée.
