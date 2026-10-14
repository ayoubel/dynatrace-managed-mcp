# Consommateur indépendant de référence

Depuis la racine Engine :

```sh
.poc-runtime/bin/node scripts/run-reference-client.mjs S01
.poc-runtime/bin/node scripts/run-reference-client.mjs S08-budget
.poc-runtime/bin/node scripts/run-reference-client.mjs --all --json
```

Sur une autre machine, remplacer .poc-runtime/bin/node par Node 26.5.1 préinstallé. Dépendances du dépôt déjà installées ; aucun téléchargement automatique. Le sandbox doit autoriser la compilation/cache temporaire. Le wrapper ne remplace pas dist et n'ouvre aucun port. Ses dossiers temporaires privés sont conservés, sans suppression automatique de fichiers.

Programme : reference-client.ts. Compilation isolée : tsconfig.reference.json. Données : src/core/**tests**/fixtures/sprint-08-scenarios.json et ports framework-neutral diagnostic-ports.ts/quality-managed.ts. Ces fichiers de tests sont réutilisés comme fixtures, sans import Jest. Seule l'API publique est utilisée pour l'exécution diagnostique. runReference renvoie aussi le rapport intégral validé ; --json affiche un résumé assaini sans payload réel.

Entrée observée S01 : { environment_alias: 'prod', problemId: 'quality-complete' }, paceMs:0, ports fictifs managed.example. Sortie :

```text
S01: completed · 15 preuves · 13 lectures · mécanisme unknown · LLM disabled
builtin:service.response.time: 100 → 300 ms
builtin:service.errors.server.rate: 1 → 1 %
builtin:service.requestCount.total: 60 → 60 Count
```

S08-budget demande sept lectures maximum, conserve la comparaison de latence et retourne partial. Les 22 scénarios/variantes peuvent être exécutés avec --all ; tous vérifient schémas, provenance/références, plafonds et mécanisme non démontré. Les 23 tests du corpus ajoutent les assertions diagnostiques détaillées et le replay à horloge fixe.

Le processus de démonstration interdit le chargement de transports, SDK MCP, connecteurs réels, fichiers de configuration, télémétrie et modèle LLM ; fetch est bloqué. Un timer déclenché pendant l'import public échoue. Le flag LLM est volontairement positionné à true dans ce seul processus fictif pour prouver que le chemin public le neutralise ; les configurations réelles ne sont pas consultées. Aucun serveur MCP, Gateway ou Chrome n'est nécessaire. Ce programme est une preuve d'interopérabilité, pas une CLI de production. Aucun outil dtmgd n'est créé ou supposé installé.
