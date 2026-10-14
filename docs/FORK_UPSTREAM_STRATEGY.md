# Maintenance du fork Dynatrace Managed MCP

## Provenance vérifiée localement — Sprint 10, 14 octobre 2026

Le remote `upstream` est configuré sur `https://github.com/dynatrace-oss/dynatrace-managed-mcp.git`. Le remote `origin` pointe vers `https://github.com/ayoubel/dynatrace-managed-mcp.git`. Le package conserve le nom, le dépôt et la licence Apache-2.0 de Dynatrace. L'historique local commence par `15fd83e`, puis les contributions/merges Dynatrace OSS. Ces éléments établissent l'origine déclarée du projet ; aucun contrôle distant n'a été effectué.

Il n'existe aucune ref locale `upstream/*`. `origin/main` et la base commune avec la branche de travail valent `1365019bd6e195451b650a106a476a92da609fd5` (« Remove unused Copilot tutorial animation »). C'est une base **du fork**, comportant déjà des changements locaux, pas un upstream pur certifié. Le point exact de divergence avec le dernier état distant upstream n'est donc pas vérifiable ici. Aucun fetch, merge ou synchronisation exécuté.

La branche conservée est `codex/sprint-02-service-slowdown`. Avant Sprint 10 : HEAD Sprint 09 `2768c7ae088477e3b0e3792554d69456a9fd006c`, parent Sprint 08 `edff85bc4fcf2bb7f98175f13fdbcd5e7d50a7f1`.

## Héritage et ajouts

Comparaison reproductible : `git diff --name-status 1365019 HEAD -- src`. À l'entrée du Sprint 10 : 75 fichiers src dans cette base ; 62 ajouts et 18 modifications, aucune suppression ni renommage de ces fichiers. La comparaison globale comprend 143 fichiers changés ; cette mesure inclut les développements du fork antérieurs à ce sprint et ne doit pas être présentée comme un diff exact contre upstream.

Héritage reconnaissable : `src/index.ts`, `src/authentication/`, clients Classic Managed dans `src/capabilities/*-api.ts`, organisation des outils `src/tools/`, configuration, logger, télémétrie, packaging et documentation upstream.

Ajouts Daybreak : `src/core/investigation-engine/`, contrats sous `src/contracts/`, adaptateurs `src/adapters/mcp/`, collecteurs `problem-investigation.ts`, `general-problem-evidence.ts`, `explain-service-evidence.ts`, construction de rapports, enrichissement service, politiques de profil, tests et client `examples/reference-client.ts`. Les collecteurs restent dans capabilities selon ADR 0001. L'API publique Core ne requiert aucun transport MCP.

Sprint 10 ne déplace ni ne modifie aucun fichier de production MCP/Core. Il ajoute cette documentation, la référence d'audit, et deux scripts de validation synthétique. Les signatures MCP, Evidence/Investigation 1.0, Explain v1 et les exports npm historiques restent intacts.

## Risques de conflits

| Zone | Risque / raison |
|---|---|
| index.ts, tools/index.ts, ToolContext | Élevé : enregistrement, transport et profil ont évolué dans le fork |
| authentication/managed-auth-client.ts, token-tool-policy.ts | Élevé : scopes, tokens et lecture seule ; revue sécurité indispensable |
| Clients capabilities hérités | Moyen : horloge, payloads et paramètres Managed corrigés localement |
| package.json / lockfile / tsconfig / CI | Moyen : versions et dépendances peuvent diverger |
| Modules ajoutés core/contracts/adapters | Moins de conflits textuels, mais couplages à vérifier aux frontières |

## Méthode de synchronisation future (non exécutée)

1. Obtenir une autorisation distincte pour l'accès réseau et le merge ; sauvegarder builds, configurations, données et état Git, y compris les dix fichiers utilisateur non suivis. Ne jamais nettoyer automatiquement le worktree.
2. Dans un checkout isolé et propre, récupérer les refs upstream ; vérifier URL, licence, commit et ancêtres. Calculer le véritable merge-base avec la ref cible et consigner ce hash. Ne pas assimiler origin/main à upstream/main.
3. Comparer les fichiers hérités et les ajouts ; établir le journal des correctifs locaux à conserver. Préférer des commits additifs ou des adaptateurs à des déplacements.
4. Résoudre chaque conflit avec revue explicite des scopes, des hints read-only, des contrôles à l'invocation et du profil incident. Conserver l'arrêt de la télémétrie/LLM dans ce profil.
5. Compiler hors dist actif ; exécuter tests unitaires, intégrations loopback, corpus 23/23, client autonome 22 scénarios, Gateway, extension et synchronisation de présentation. Contrôler les contrats et les empreintes protégées.
6. Préparer une activation/rollback séparés ; aucune mise à jour automatique du service actif. Ne pas extraire Core dans un nouveau package pendant une résolution de merge.

## Développement du fork

Voir [API Core](core-public-api.md), [ADR 0001](adr/0001-investigation-engine-boundaries.md) et [client indépendant](../examples/REFERENCE_CLIENT.md). Les sessions Core restent une Map mémoire bornée à 100/30 minutes, sans persistance ni injection de stockage. Leur extraction nécessiterait une revue des chemins conversationnels historiques ; elle est reportée, sans empêcher le MVP local avec renouvellement Explain existant.
