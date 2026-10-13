# Roadmap — Incident Intelligence for Dynatrace Managed

Date : 13 octobre 2026, Europe/Zurich. Références : code actuel des trois dépôts, GAP_ANALYSIS_REPORT.md et instructions de cette mission. La cible actualisée Node/TypeScript, moteur indépendant de MCP et IA facultative désactivée prévaut sur l’ancien document proposant Python et IA active.

**Seul Sprint 01 est développé dans cette session.** Sprints 02–05 et phase 06 restent planifiés ; aucune de leurs branches n’est créée. Estimations en jours-homme d’ingénierie, hors attente d’accès, validation juridique/TPRM/SSO, fourniture de corpus et cycles de recette client. Fourchettes de cadrage, sans engagement de délai ni SLA. Ne pas additionner deux fois les travaux transverses B05/B09/B13.

## 1. Socle constaté et stratégie

Le moteur possède déjà un Explain déterministe, collecte disque et service bornée, qualification de séries, contexte général, distinction Davis/observation/mécanisme inconnu et recommandations conditionnelles. Gateway et extension consomment ce moteur ; trois dépôts conservés. Une nouvelle implémentation parallèle n’est pas justifiée.

Sprint 01 apporte des ports structuraux, un point d’entrée Explain direct, un adaptateur compatible, des contrats Zod additifs, une politique read-only et une matrice de capacités. Les collecteurs restent dans src/capabilities. Sessions mémoire et plusieurs modules de conversation/context-analysis restent à extraire. Les comparaisons longues/courtes, directions topologiques et qualité causale ne sont pas « résolues » par l’extraction.

Règle de livraison : branche main indépendante par dépôt ; branches feature créées seulement au démarrage, commits locaux cohérents ; merge et push distincts soumis aux validations convenues. Aucune suppression distante automatique. Moteur = métier ; Gateway = jobs/API/stockage/accès ; extension = contexte/restitution.

## 2. Séquencement et charges révisées

| Phase | Tickets | Enveloppe révisée | Dépendances principales | Branche proposée |
|---|---|---|---|---|
| S01 fondations | B00/B02/B03/B12/B13 ciblé | 7–11 JH pour mise en œuvre, revue et recette des fondations ; travail local déjà réalisé, pas une durée observée de la session | consolidation Git, code actuel | feature/incident-intelligence-core-v1 |
| S02 outils analytiques | B05/B06/B07 ciblés | 8–13 JH | contrats S01, API/corpus autorisés | feature/advanced-investigation-tools |
| S03 playbook SERVICE_SLOWDOWN | B06/B07 composition, B09 corpus simulé | 5–8 JH | outils S02, métriques/scénarios | feature/service-slowdown-playbook |
| S04 préparation AIReasoner | B08/B10 contrats seulement | 4–6 JH | preuves S01–03, fixtures qualifiées | feature/ai-reasoner-contracts |
| S05 intégration et UX | B04/B13 restant | 6–10 JH | contrat stable, décision HTTP, besoin sessions | feature/daybreak-engine-integration |
| Phase 06 pilote | B01/B09/B11/B14/B15/B17, B16 optionnel | 18–29 JH hors B16 ; B16 2–4 JH si demandé | identité/réseau client, corpus réel, S01–05 | feature/incident-intelligence-hardening |

Total indicatif du parcours : **48–77 JH hors B16**, comprenant S01. Reste après socle local S01 : **41–66 JH**, à re-chiffrer après accès et décision de canal. La qualification réelle de S01 reste nécessaire ; l’enveloppe n’est pas une mesure de temps déjà consommé. Phase 06 peut avancer sur sécurité/packaging en parallèle des développements, mais les protections requises précèdent toute exposition partagée.

## 3. Sprint 01 — fondations

Objectif : préserver Explain, fermer le profil produit et établir les frontières sans réécriture.

Livré localement :

1. B00 : ADR 0001–0004, rôles des dépôts et migration progressive.
2. B02 : allowlist serveur/transport, aucun write/confirmation, profil général conservé, Ollama/OpenKit désactivés dans Incident Intelligence, refus Gateway réels.
3. B03 : contracts/evidence/investigation, snapshot 1.0 additif, source et paramètres, valeurs qualifiées, données manquantes null, références contrôlées ; lien problème conservé, autres liens non inventés.
4. B12 : discovery par environnement/caller, version/scopes observés, quatre API sondées, logs/settings non vérifiés, probes bornés/cancelables, fallback de version marqué non observé.
5. B13 : entrée Explain directe et ports indépendants de ToolContext/SDK, adaptateur MCP réutilisant les mêmes règles.

Critères de sortie : tests unitaires et adaptateurs pertinents verts ; Explain accessible sans MCP et par MCP ; trois main consolidées ; aucune logique de diagnostic ajoutée Gateway/extension ; branche feature non mergée dans main. Les tests réels Managed/Chrome ne sont pas remplacés par les fixtures ; ils sont une qualification ultérieure explicitement requise.

Limites connues : validation nouvelle centrée sur snapshots de collecte déterministes, pas conversation IA ; stockage mémoire partagé ; ancien budget Explain borne les lancements mais pas toutes les requêtes en vol ; probes ne certifient pas une version ni la qualité des incidents.

## 4. Sprint 02 — outils analytiques avancés

Objectif : généraliser uniquement les capacités utiles à SERVICE_SLOWDOWN, à partir des modules existants.

### S02.1 — Contexte incident (1–2 JH)

Réutiliser Problems API, published-problem-diagnosis et collecte entités. Exposer une fonction métier build_incident_context (nom à confirmer) avec problème/entités, périodes exactes et limitations. Garder IDs, source et Davis distincts des observations.

Acceptation : aucun diagnostic par titre ; problème invalide/clos/ouvert et dates manquantes testés ; entités uniquement issues des sources autorisées ; contexte partiel exploitable.

### S02.2 — Baseline comparables (3–4 JH)

Réutiliser scopedExplainSeries et règles de comparaison existantes. Corriger la fenêtre des incidents longs : la baseline doit précéder le début réel, pas les deux dernières heures. Définir résolution adaptée aux incidents courts, seuil de points/couverture, dimensions exactes, unité/agrégation et qualité des données. Service latence/erreurs/trafic d’abord ; Host/synthetic hors chemin critique sauf preuve d’un besoin.

Acceptation : même identité métrique/entité/unité/agrégation, fenêtres comparables et traçables ; gaps/troncature/absence non transformés en baseline ; tests incidents court/long, multidimension, changement unité et absence de rétention.

### S02.3 — Dépendances et événements (2–4 JH)

Réutiliser Entities/Events clients et conserver fromRelationships/toRelationships séparément. Expansion limitée par profondeur/volume/deadline. Chronologie avant/pendant avec sources de changements réellement observables ; ne pas présenter une déclaration de test comme déploiement attesté.

Acceptation : direction conservée, limite explicite, événement daté et sourcé ; proximité temporelle seule ne confirme aucune cause ; changements non vérifiables restent déclaratifs.

### S02.4 — Fiabilité partagée et hypotheses (2–3 JH, mutualisée)

Erreurs API typées, deadline/annulation de bout en bout, retry/backoff borné des lectures éligibles, 429, pagination/tailles/budgets. Évaluation déterministe des hypothèses avec support/contradiction/données manquantes. Pas de retry write ni de nouvelle écriture.

Acceptation : 401/403/404/429/timeout distincts ; pas de lancement après échéance ; limites de taille et pages testées ; calculs reproduisibles depuis les preuves ; aucune cause déduite d’une corrélation isolée.

Les sous-fourchettes se recouvrent ; l’enveloppe sprint de 8–13 JH tient compte de la mutualisation, pas de leur addition brute.

## 5. Sprint 03 — playbook SERVICE_SLOWDOWN

Objectif : composer les outils S02 en workflow déterministe unique, sans duplicata.

1. Identifier le service et la période réelle ; lire les éléments Davis publiés.
2. Comparer latence, erreurs et trafic avant/pendant avec qualité des données.
3. Explorer les dépendances pertinentes dans leur direction ; relire les événements/candidats changements.
4. Évaluer les mécanismes plausibles, preuves favorables/contradictoires et vérifications manquantes.
5. Produire un résultat completed/partial/failed explicitement défini par le contrat, synthèse déterministe, prochaines vérifications conditionnelles et liens vérifiés.

Scénarios de corpus minimum : latence avec erreurs ; latence sans erreurs ; dépendance possiblement dégradée ; incident court ; incident long ; données insuffisantes. Ajouter un cas de métriques contradictoires et de changement seulement déclaré. Attendus et références de preuve versionnés, fixtures anonymisées.

Acceptation : playbook appelable sans MCP ; aucun LLM ; aucune modification Managed ; budget/deadline tenus ; conclusions majeures référencées ; Davis séparé du mécanisme inféré ; compatible Explain via le même adaptateur. Corpus simulé avant validation réelle ; aucune panne/injection réelle sans autorisation.

## 6. Sprint 04 — préparation IA, désactivée

Objectif : définir l’interface remplaçable AIReasoner, sans activer un parcours d’inférence.

Entrée : preuves qualifiées/versionnées, contexte autorisé et budgets. Sortie : hypothèses IA structurées, support/contradiction/checks, références et chiffres vérifiables. Adaptateur mock, feature flag false par défaut, absence du modèle explicite, aucun fournisseur requis à l’exécution.

Contrôles : références existantes, assertions numériques rapprochées des preuves, réponse non étayée rejetée ou qualifiée, prompt injection dans logs/événements/noms traitée comme données, minimisation, budget contexte/tokens et erreurs sans payload sensible. Corpus adversarial avec faux appels write et faux IDs.

Acceptation : tests uniquement mock ; chemin actif déterministe ; aucune connexion externe ni inference réelle ; Ollama débranché. Le code optionnel historique n’autorise pas sa réactivation. Modèle/fournisseur/politique de transfert à décider séparément avant toute activation future.

## 7. Sprint 05 — intégration produit et UX

Objectif : améliorer les consommateurs, sans transférer les règles métier.

Gateway : contrat stable moteur/jobs/erreurs partiels, snapshots versionnés et historique, annulation/progression cohérentes, préparation sessions. Décider adaptateur HTTP direct seulement après comparaison du coût/résilience du chemin MCP ; si retenu, implémenter dans le dépôt moteur. Finaliser extraction B13 selon besoins réels, pas découpage complet automatique.

Extension : fallback manuel PID interne/displayId sans ambiguïté, restitution observations/Davis/hypothèses/limites, Evidence Explorer sourcé, liens fiables ou absence explicite, copie texte, erreurs/progression claires. Préserver tokens backend et adaptation URL versionnable.

Acceptation : même investigation via adaptateurs retenus, aucun calcul diagnostique dans consommateurs, compatibilité rapports v1 et 1.0 testée, reprise/expiry explicites, recette Chrome natif sur versions ciblées. Trois dépôts restent indépendants.

## 8. Phase 06 — sécurité, validation et pilote

Objectif : une instance isolée par client, périmètre pilote documenté ; ne pas présenter un POC loopback comme un service partagé sécurisé.

- B01 : identité utilisateur et sessions, ACL environnements/jobs/exports, TLS/HTTPS et origines selon architecture ; test utilisateur A/B et refus 401/403. Prérequis à l’exposition partagée.
- B11 : minimisation, audit metadata-only, rétention/TTL/suppression des snapshots et exports, rotation logs, canaris secrets et contrôles d’accès.
- B14/B15 : packaging VM/Docker reproductible, secrets montés côté backend, non-root, runtime/lockfiles compatibles, SBOM/SCA/licences, CI des trois produits, upgrade/rollback/restore, distribution Chrome gérée.
- B17 : concurrence isolée, file/quota, mémoire bornée, arrêt/restart et réhydratation ou expiration documentée, observabilité/readiness/healthchecks.
- B09 : incidents réels annotés, compatibility Managed/scopes/versions, latence p50/p95 et qualité des conclusions/refs, comparaison temps d’investigation manuel. Objectif <30 s exploratoire, aucun SLA sans mesures.
- B16 facultatif : runbooks client versionnés, propriétaire/prérequis/validation et recommandations conditionnées aux preuves ; aucune application automatique.

Acceptation : installation propre et restauration testées ; séparation données/utilisateurs/environnements vérifiée ; mesures de qualité/latence réelles ; limites explicitement annoncées ; aucun rapprochement causal au SaaS revendiqué sans évaluation objective.

## 9. Prérequis d’accès Managed réel

Avant probes/collectes de qualification : environnement(s), version(s) cible(s), réseau/proxy/CA/ActiveGate documentés, token backend read-only, autorisation de lire les incidents et champs retenus, gestion/rétention des données convenues. Confirmer réellement API Problems/Entities/Metrics/Events, permissions clusterversion/apiTokens lookup, logs/settings optionnels, rétention et résolution métriques, schémas et routes UI fiables.

Corpus : six scénarios SERVICE_SLOWDOWN et incidents clos/ouvert, données anonymisées, vérité terrain SRE et provenance de changements. Des événements de test ne prouvent pas une panne réelle. Injection/ingest, changement de configuration, génération de charge ou panne réelle nécessitent une autorisation distincte.

Pour pilote partagé : identité/SSO, groupes et ACL, endpoint HTTPS, secrets, stockage/rétention, exploitant, egress autorisé et procédures d’exploitation approuvés avant ouverture. Aucun LLM/fournisseur ou envoi de télémétrie implicite.

## 10. Risques et décisions ouvertes

| Risque / décision | Impact | Traitement / moment |
|---|---|---|
| Fenêtre 2 h et baseline de long incident encore incorrecte | comparaison potentiellement pendant le même incident | S02 prioritaire ; ne pas prétendre résolu par S01 |
| Résolution fixe 5 min et séries manquantes | incident court inexploitable | S02 adaptative, tests et partiel explicite |
| Relations fusionnées et données topologiques bornées | direction/contexte incomplets | S02 conserver direction, limiter sans inventer causalité |
| Version/grants inconnus et API diffèrent selon client | couverture/certification incertaine | matrix S01, qualification B09 sur versions réelles |
| Sessions mémoire non restaurables | perte après restart, multi-process non supporté | S05/phase 06 ; garder expiration honnête |
| Contrat additif et legacy any | producteurs/consommateurs hétérogènes | S01 validation collecte, S04/05 généralisation contractuelle |
| Logs/settings non sondés et liens individuels null | couverture et navigation limitées | besoin/scopes/versions à valider avant extension des probes |
| Gateway locale sans AuthN/ACL | service partagé non sécurisé | B01 avant toute exposition |
| Runtime Node 26 et dépendances locales | packaging/CI/client pas qualifiés | B14/15, build reproductible depuis lockfiles |
| Remote extension SSH non vérifié | publication/release bloquée | résoudre normalement l’accès lors d’une publication autorisée, sans désactiver la vérification |
| Choix MCP vs HTTP direct | coûts/session et maintenance | mesure et décision S05, règles uniques dans moteur |
| Choix modèle et confidentialité | qualité/latence/transfert | interfaces S04 seulement ; activation future distincte |

Décisions déjà fixées et non rouvertes : conserver Node/TypeScript, trois dépôts, moteur dans MCP existant, Incident Intelligence read-only, fonctionnement déterministe nominal, Ollama désactivé, aucun fournisseur externe activé, aucune implémentation Sprint 02 dans cette session.
