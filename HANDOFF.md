# Reprise — serveur MCP Dynatrace Managed in-house

> État courant de publication : voir la dernière section « Publication de la branche ». Les états précédents sont historiques.

État du 8 octobre 2026 : version 2 fusionnée localement dans `main`, commit de code **`abcb678`**, branche `feature/obsolescence-compliance-v2` conservée. Pas de push effectué pour cette intégration. Des commits de documentation peuvent suivre. Vérifier `git status`, `git log` et l’objectif du nouveau prompt avant de changer du code.

## Point d’entrée

Le guide complet du produit est dans le dépôt voisin : **`/Users/ayoubelyagoubi/Documents/sre-morning-check/HANDOFF.md`** ([lien relatif](../sre-morning-check/HANDOFF.md)). Il explique Daybreak, l’aperçu 4319, les états locaux, les confirmations d’écriture et les prochaines versions. Ce fichier est le point d’entrée MCP si seul ce dépôt est ouvert ; les deux checkouts locaux sont nécessaires aux tests/probes Daybreak utilisant son réexport de compatibilité.

Le périmètre est **Dynatrace Managed**, desktop pour l’application. Pas de SaaS/Grail/DQL ni kubectl/accès direct aux pods. L’intelligence d’obsolescence est développée ici ; pas de dépendance à un autre moteur Git ni LLM externe. Les autres fonctions Daybreak conservent leur orchestration/règles locales.

## Modules et contrats

| Module | Rôle |
| --- | --- |
| `src/tools/entities-tools.ts` | Enregistrement et schémas des outils d’inventaire/audit/combinaison |
| `src/capabilities/entities-api.ts` | Pages d’entités, versions imbriquées et métadonnées retenues |
| `src/capabilities/lifecycle-audit.cjs` | Collecte paginée, limites, liens, trace et mesures de performance |
| `src/capabilities/lifecycle.cjs` | Extraction, références datées, classification, score, profils, campagnes et simulation |
| `src/authentication/managed-auth-client.ts` | Accès API et horloge de réponse HTTP pour les pages d’entités |
| `src/tools/token-tool-access.ts` | Exposition des outils selon les scopes |
| `src/authentication/local-token-source.ts`, `token-tool-policy.ts` | Source locale et rotation du token, cache scopes et revalidation |
| `src/capabilities/__tests__/lifecycle-audit.test.ts` | Régressions d’audit, score, preuves, agrégation et horloges |

Outils read-only : `dynatrace_managed_get_runtime_inventory`, `dynatrace_managed_audit_obsolescence`, `dynatrace_managed_combine_obsolescence_audits`. Scope `entities.read`. Contrat **version 3**, familles `auditGroup`, `rows`, `entityProfiles`, `assessment`, `campaigns`, `inventories`, `trace`, `performance` et limites. Un audit collecte 1–5 environnements, 10 pages de 100 entités max par type/environnement. Catégories `all/os/runtime/platform`, anticipation 90/180/365 jours. La combinaison exige des politiques identiques et des rapports de moins de cinq minutes ; elle n’atteste pas indépendamment les données fournies par l’appelant.

Runtime : assets **Process (`PROCESS_GROUP_INSTANCE`)**, Process groups en contexte sans double score. OS : Hosts et Kubernetes nodes ; plateforme : nodes. Version absente, indice, référence manquante, contexte fournisseur, observation ancienne et horloge incohérente ont des qualifications distinctes. Ne pas emprunter une version de groupe pour toutes ses instances ni substituer image/release/OneAgent à une version runtime.

Référentiel courant vérifié au 2026-10-08 : Ubuntu, Kubernetes, Node.js, Python, PHP, Java Temurin scoped, certains cycles Go et containerd. Version détectée ≠ règle applicable. Tomcat/NGINX/LIBC/bibliothèques peuvent rester à qualifier. Containerd a des règles de support mais sa version reste absente des preuves testées. Voir les PoC avant de recommencer des lectures.

## Horloges : correctif actuel

L’incident OS était un désaccord **+280 minutes** entre horloge HTTP/observations Dynatrace et poste, pas un délai d’appel. L’ancien plafond d’une heure rejetait l’offset. Maintenant : `requestedAt/receivedAt/serverAt` par observation, durée valide ≤30 s, provenance cohérente et récente ≤5 min, pas de plafond de magnitude avec provenance valide. La fraîcheur suit la réponse ; les dates de support suivent l’horloge locale. Données réellement futures/anciennes ou preuve invalide restent non évaluables. Anciennes réponses sans provenance gardent la compatibilité bornée à une heure. Avertissement visible ; aucun réglage NTP modifié. [Diagnostic et preuve](docs/obsolescence-response-clock-fix.md).

## Construire et vérifier

Runtime local : Node 26.5.1 dans `.poc-runtime/bin/node`, plage du package `>=26.5.1 <27`. Dépendances présentes ; ne pas réinstaller inutilement.

```sh
cd /Users/ayoubelyagoubi/Documents/dynatrace-managed-mcp-poc
./.poc-runtime/bin/node node_modules/typescript/bin/tsc --build
./.poc-runtime/bin/node node_modules/jest/bin/jest.js --selectProjects unit --runInBand --testPathIgnorePatterns " 2"
```

Dernière exécution : **353 tests / 23 suites**, build réussi. La sélection exclut des copies locales non suivies nommées ` 2` et ne lance pas l’intégration réseau. Un test écrit puis retire `~/.test-dt-config.json` : vérifier que ce fichier n’appartient pas à l’utilisateur et utiliser l’approbation sandbox nécessaire ; un EPERM ici n’est pas un échec fonctionnel MCP.

Lancement configuré localement : `/bin/sh poc/start.sh` (stdio). Ce script et sa configuration sont locaux/non suivis. Il utilise `dist/index.js`, `poc/.env`, `poc/dt-config.yaml`, `DT_MCP_TOKEN_ENV_FILE`, filtrage token et télémétrie désactivée. **Après build, reconnecter le client ou redémarrer l’app propriétaire de son subprocess MCP** pour charger le nouveau code. Daybreak et VS Code ont des processus distincts.

Secrets et CA restent locaux. Ne pas afficher les tokens, ne pas désactiver TLS ; vérifier les chemins `NODE_EXTRA_CA_CERTS` avant lancement. Ne pas ajouter `poc/`, `.vscode/`, `.codex/`, certificats ou copies `* 2.*` globalement à Git. `.github/copilot-instructions.md` contient une modification préexistante hors périmètre à préserver.

## Documents à lire selon l’objectif

- [Moteur et contrat](docs/obsolescence-mcp.md)
- [Enrichissement de preuves runtime](docs/runtime-evidence-enrichment.md)
- [Résultats des PoC par technologie](docs/runtime-version-poc-results.md)
- [PoC containerd](docs/containerd-host-logs-poc.md)
- [Scopes d’API](docs/api_token_scopes.md)
- Daybreak `docs/prochaines-versions.md` : validations restantes et options non engagées.

Les mesures live et anciens comptes de tests dans ces documents sont des **résultats datés**, pas des garanties de couverture/performance actuelles. Aucun SLO ni dashboard créé lors de la dernière revue d’intégration. Les créations/modifications doivent suivre le parcours d’aperçu et confirmation, sur un périmètre explicitement choisi.

## Investigation portable — 9 octobre 2026

Travail local non fusionné sur `feature/problem-investigation-mcp`, baseline `dca74aa`. Deux outils de lecture et prompt `continue_investigation` ; moteur déterministe dans `src/capabilities/problem-investigation.ts`, enregistrement `src/tools/investigation-tools.ts`. Voir `docs/problem-investigation.md` pour contrat, limites, seuils et sessions. Validation actuelle : 362 tests MCP, compilation TypeScript réussie ; Daybreak 127 tests. Live en lecture : problèmes disque, continuation et découverte du prompt validés. Redémarrage Daybreak 4318 pour reconnexion ; pas de changement aperçu 4319, push, merge ou écriture Dynatrace.

Évolution Daybreak du même jour : sélection individuelle obligatoire ; plus de lot implicite de trois problèmes. Contrat MCP inchangé, rapports indépendants, aucune cause commune déduite automatiquement. Daybreak : 128 tests.

Daybreak conserve désormais une fiche et un job uniques pour les continuations MCP. Fil de session persistant borné à dix tours, contexte et constats initiaux conservés ; le serveur MCP reste propriétaire de l’analyse et de sa session de 30 minutes. Validation Daybreak : 129 tests. Aucun changement moteur MCP pour cette évolution.

### Enregistrement Git local de la fonctionnalité

À la demande du propriétaire, les évolutions refresh/investigation/session et leurs guides sont enregistrées par commits ciblés sur `feature/problem-investigation-mcp`. Les mentions antérieures « non commités » décrivent les étapes précédentes ; consulter `git log` pour les nouveaux HEAD. Les fichiers locaux préexistants (instructions, configs, certificats, copies ` 2`) restent exclus. Validation avant commits : 129 tests Daybreak, 362 tests MCP, build TypeScript réussi ; aucun nouveau contrôle Dynatrace live. Aucun push ni merge.

### Publication de la branche

Commit de fonctionnalité MCP `c7f2043` ; branche `feature/problem-investigation-mcp` poussée et suivie sur `origin` (`https://github.com/ayoubel/dynatrace-managed-mcp.git`). Des commits documentaires suivent ; vérifier le HEAD via Git. Pas de push vers `upstream`, pas de merge ni PR créée. Daybreak `69d3401` reste local, sans remote : URL attendue du propriétaire. Les mentions « aucun push » précédentes décrivent les étapes historiques.

### Publication Daybreak confirmée

Dépôt GitHub privé créé à la demande du propriétaire : `https://github.com/ayoubel/daybreak`. Remote Daybreak `origin` configuré ; branche `feature/problem-investigation-mcp` poussée et suivie. MCP publié sur son origin `https://github.com/ayoubel/dynatrace-managed-mcp`, même branche. Les mentions précédentes « Daybreak sans remote » sont historiques. Aucun merge, aucune PR créée ; configurations et fichiers locaux préexistants toujours exclus.
