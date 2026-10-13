# Rapport d’implémentation — Sprint 01

13 octobre 2026, Europe/Zurich. Statut : développement local terminé, validation simulée réussie ; recette réelle Managed/Chrome non exécutée. Branches moteur et Gateway : `feature/incident-intelligence-core-v1`. Aucun merge du Sprint 01 dans main, aucun push, aucun Sprint 02 développé. Dépôt EF2 inchangé.

## 1. Consolidation préalable

Plan d’audit/sauvegarde validé explicitement avant intégration. Les trois main ont été consolidées indépendamment :

| Dépôt | SHA main de référence | Suite baseline |
|---|---|---|
| Gateway sre-morning-check | `282b6cb9b67130abc53b5f7c04705633b0b7a836` | 140 tests |
| Moteur dynatrace-managed-mcp-poc | `c7f8f01bec62fe2768a640737d844947f18b6356` | 408 unitaires, 2 intégration locale, compilation |
| Extension daybreak-browser-extension | `af5769b3c9360d2679a642a0f17e3e9ff1c89a45` | 10 tests |

Main extension créée localement et consolidée ; sauvegardes bundles/fichiers vérifiées. Branches historiques intégrées nettoyées, dashboard-workflows moteur conservée (commit exclusif et retrait historique), extension-v1 extension conservée (accès distant SSH non confirmé). Voir GIT_CONSOLIDATION_PLAN.md et GIT_CONSOLIDATION_REPORT.md à la racine Documents pour détail des opérations et copies archivées.

## 2. Modifications par dépôt

### Moteur — B00, B02, B03, B12, B13 ciblé

**B00** : quatre ADR sous docs/adr et guide docs/incident-intelligence-foundations.md. Responsabilités : métier/connecteurs/contrats/adaptateurs dans le moteur ; API/jobs/stockage/accès dans Gateway ; URL/restitution dans extension. Structure existante préservée, pas de déplacement massif.

**B13 ciblé** : src/core/investigation-engine/explain.ts est le point d’entrée déterministe. InvestigationDependencies expose des ports structuraux (clients read, environment lookup, scopes observés, owner, profil). Les composants problem-investigation, general-problem-evidence et explain-service-evidence n’importent plus ToolContext. L’adaptateur src/adapters/mcp/investigation-dependencies.ts projette le contexte existant ; problem-explain.ts conserve sa signature historique et appelle le noyau. Les tests appellent Explain directement sans serveur. Un contrôle supplémentaire du module compilé refuse tout chargement @modelcontextprotocol : parcours réussi, contrat 1.0, mode deterministic, sdkLoaded:false.

**B02** : src/core/execution-policy.ts définit l’allowlist incident-intelligence et refuse les profils inconnus. src/adapters/mcp/profiled-tools.ts garde enregistrement et invocation. index.ts contrôle aussi les callbacks exposés, catalogues internes et réactivation après changement de scopes. Aucun create/update/SLO/confirmation/ancien agent conversation n’est exposé dans ce profil ; les annotations readOnlyHint seules ne suffisent pas. Profil general conserve les fonctions historiques. Le profil actif force Ollama off et n’initialise pas OpenKit, même avec flags contraires. La découverte locale du catalogue ne demande pas DataExport quand la policy a déjà validé les credentials ; version inconnue affichée honnêtement.

**B03** : schémas TypeScript/Zod versionnés dans src/contracts/evidence et investigation. Sortie additive : evidence[].provenance et investigation.schemaVersion=1.0. Les anciens champs version:1, findings/evidence/trace/Explain et IDs restent présents. Provenance capturée aux appels connecteurs : environnement, API/méthode/endpoint/paramètres, timestamp, entité si connue, intervalle, mesure/unité/agrégation, échantillons et résumés existants, référence disponible, limites et erreurs expurgées. Sources Problems pour données intégrées ; Events pour détails réellement relus. Absences null, pas de valeur zéro ou URL fictive.

Le snapshot contient conclusions et erreurs de collecte ; IDs uniques, environnement cohérent, nombres finis et références vers preuves existantes contrôlés. La validation parcourt également tous les evidenceRefs imbriqués du rapport legacy/Explain/remediation. Une sortie invalide produit une erreur générique avant cache/retour. Seul le lien problème existant est réutilisé ; les autres liens restent null avec limitation. Les échantillons sont plafonnés à 100 selon l’existant.

**B12** : src/core/capabilities/discover.ts, contrat capabilities, connecteur Managed et nouveau tool dynatrace_managed_get_environment_capabilities. Un environnement autorisé/caller, scopes issus du snapshot validé ou token lookup, version réellement lue, quatre API sondées (Problems, Entities HOST, catalogue Metrics, Events). Logs/settings restent non vérifiés. Maximum six lancements, deadline 8 s, timeout 2 s/probe, AbortSignal propagé, réponses connecteur plafonnées à 256 KiB. Pas de retry/pagination/écriture/endpoint SaaS-only. Statuts available/unavailable/unverified ; erreurs 401/403/404/405/429/timeout/network/shape/budget qualifiées et sans données brutes.

getClusterVersion conserve une valeur de repli pour compatibilité interne, marquée observed:false ; index/isConfigured ne la mémorisent pas comme version observée, et le catalogue annonce unknown/unverified. La matrix lit directement l’API et ne confirme aucun fallback.

### Gateway

src/profile-policy.mjs porte uniquement la politique d’accès applicative. DAYBREAK_PROFILE=incident-intelligence filtre les outils découverts et recontrôle l’invocation, bloque les trois méthodes de confirmation MCP, confirmations Workbench et route HTTP /api/workbench/confirm, impose les investigations déterministes de problèmes au démarrage. Les anciennes sessions d’environnement/agent restent dans general.

Le lanceur scripts/start-extension.sh sélectionne le profil Gateway et celui du moteur, avec Ollama désactivé. Les enfants stdio reçoivent la politique forcée même si config.env indique un autre profil. Avec un moteur HTTP distant, sélectionner également le profil sur ce serveur ; la Gateway ne change pas de configuration distante et bloque néanmoins ses propres écritures.

Aucun calcul de baseline, diagnostic, corrélation ou playbook ajouté. La Gateway continue de consommer le JSON du moteur.

### Extension

Aucune modification Sprint 01, aucune nouvelle branche vide. Reste sur main consolidée. Son renderer existant consomme les champs legacy ; contrat additif compatible. Aucun token Dynatrace, logique métier ou appel Managed ajouté. La recette Chrome native reste non exécutée.

## 3. Réutilisation et dépendances

Réutilisés : investigation/Explain/report/remediation/event normalization/published diagnosis/service evidence/general evidence, clients Managed existants, sessions mémoire existantes, SDK MCP et mécanismes de token rotation, Gateway Workbench/registry/MCP, renderer extension existant. Aucun deuxième connecteur ou moteur ; le connecteur capability enveloppe le client auth actuel.

Zod **3.25.76**, déjà installé et présent dans le lockfile, déclaré directement dans package.json et à la racine package-lock.json avec ^3.25.76. Aucun téléchargement, install, fournisseur ou runtime obligatoire ajouté. Version produit inchangée 1.1.1, manifests cohérents. Nouveau profil sans LLM ; ancien module local optionnel conservé mais non activé.

## 4. Validation exécutée

Runtime : moteur/.poc-runtime/bin/node **26.5.1** ; Node absent du PATH initial, runtime local conforme utilisé explicitement. Tests ne nécessitent aucun Managed réel ou LLM.

| Vérification | Résultat final |
|---|---|
| tsc --build | réussite, exit 0 |
| Jest unit --runInBand | **425/425**, **32 suites** |
| Intégration ciblée token-refresh + incident-profile | **6/6**, **2 suites** |
| Gateway node --test test/*.test.mjs + incident-profile-http.integration.mjs | **143/143** (142 unitaires/composants + 1 HTTP réel local) |
| Extension après consolidation, sans changement Sprint 01 | **10/10** |
| check-version-sync.js | réussite, manifests 1.1.1 cohérents |
| Chargement core compilé avec blocage de tout import SDK MCP | réussite ; deterministic, contrat 1.0, partial explicite sur fixture minimale |
| git diff --check | aucune erreur |
| Format Prettier nouveaux modules/tests moteur | exécuté ; anciens fichiers non reformatés globalement |

Couverture ajoutée : appel noyau direct + parité adaptateur ; isolation propriétaire/environnement et entrées invalides ; données métriques absentes et erreurs partielles sans secret ; duplicate IDs/refs absentes/environnement incohérent/Infinity ; source Events effectivement relue ; profil fail-closed et outil inconnu/mal annoté ; inventaires stdio/HTTP sans writes ; token factice write-capable incapable d’écrire ; confirmations stale interdites ; profils général et incident ; scope étroit sans DataExport ; matrix version/API/scope/shape/fallback/erreurs/budget/cancellation ; route Gateway réelle en loopback, sans configuration Managed.

Premières baselines sandbox : EPERM sur test de fichier home et écoute loopback ; relances autorisées réussies. Pendant implémentation, TypeScript a détecté un import placé avant shebang, le typage générique du registrar et la portée de profile dans le handler fatal ; corrigés. Une régression du chemin optionnel de relecture mockée venait d’un double enregistrement de provenance ; corrigée en réutilisant les dépendances originales lors de récursion. La suite finale est verte ; ces erreurs intermédiaires ne sont pas omises ou présentées comme tests réussis.

Logs : daybreak-restoration-20261013 à la racine Documents (logs de consolidation et Sprint 01, privés). Avertissement ts-jest globals déprécié préexistant ; modernisation hors périmètre.

## 5. Definition of Done et limites

| Critère | État |
|---|---|
| Trois dépôts indépendants et main consolidées | oui, sources et branches séparées |
| Architecture/ADR | oui |
| Profil read-only testé côté serveur | oui, MCP stdio/HTTP et Gateway HTTP/invocation |
| Contrats preuves versionnés et validés | oui, snapshots déterministes additifs |
| Capability matrix testée | oui, fixtures/probes locaux ; compatibilité réelle non certifiée |
| Explain direct sans MCP et accessible MCP | oui |
| Non-régression pertinente | suites disponibles ciblées vertes |
| Ollama désactivé dans parcours incident | oui, aucune inférence réelle |
| Pas de métier dans Gateway/extension | oui, politique d’accès uniquement |

Limitations conservées :

- Pas de recette réelle Managed multi-versions/scopes, incidents annotés, Chrome natif, charges, Docker ou audit SCA ; aucune promesse de diagnostic causal comparable SaaS ni SLA.
- Collecte Explain historique 18 lancements/80 s, sans deadline de bout en bout pour toutes les requêtes déjà en vol ; S02 traite ce point.
- Fenêtre de 2 h et baseline de long incident, résolution 5 min, topologie directionnelle fusionnée : risques analytiques historiques non résolus dans S01 ; S02 prioritaire.
- Sessions mémoire 100/30 min, pas de store injectable ni de reprise après restart. Context-analysis/agent et autres capacités encore couplés à ToolContext ; découplage B13 ciblé, pas totalité du dépôt.
- Contrats nouveaux qualifient les snapshots déterministes, pas les réponses conversationnelles IA historiques ; S04/S05 doivent valider séparément leurs assertions et cohérence avant activation.
- Probes log/settings absents et liens UI individuels non certifiés restent explicitement inconnus/null ; source API disponible quand vérifiée. Aucun fait ou lien fabriqué pour compléter la couverture.
- Profil read-only ne remplace pas AuthN/ACL/TLS ; aucune ouverture réseau partagée autorisée.
- Accès SSH remote extension non vérifié ; aucun changement de known_hosts, aucune publication.

Aucune régression connue après validation finale simulée. Le fonctionnement complet sur Managed réel reste à qualifier.

## 6. Travaux restant à faire

Suivre INCIDENT_INTELLIGENCE_ROADMAP.md : S02 outils/fiabilité/baselines, S03 playbook SERVICE_SLOWDOWN et corpus, S04 interfaces IA mockées désactivées, S05 intégration/UX/HTTP si justifié, phase 06 sécurité/packaging/qualification pilote. S01 ne déclenche aucun de ces développements. Validation finale utilisateur nécessaire avant merge Sprint 01 dans main ; autorisation de push distincte.
