# Investigation générale et conversation locale — 12 octobre 2026

## Architecture

Extension Chrome → passerelle Daybreak → MCP Managed → API Dynatrace et Ollama sur `127.0.0.1:11434`. La logique de collecte, la sélection des lectures, les preuves et le contexte sont dans le MCP. Les autres clients MCP peuvent appeler les mêmes outils. Aucun appel LLM depuis le navigateur, aucun fournisseur externe, téléchargement de modèle ou outil d’écriture par ce parcours.

`dynatrace_managed_investigate_problem` conserve le parcours spécialisé disque lorsqu’un sélecteur précis est vérifié. Pour les autres problèmes, le MCP examine l’impact publié, jusqu’à trois entités explicitement affectées/impactées ou désignées par Davis, leurs relations, événements et mesures. Le titre ne détermine pas une cause ni un playbook. Un diagnostic approfondi universel n’est pas garanti.

Nouveaux outils `dynatrace_managed_collect_problem_evidence` (problème + environnement : impact et entités) et `dynatrace_managed_get_investigation_context` (session : dernier rapport et échanges en cache). Tous requièrent `problems.read`; les lectures secondaires vérifient leurs propres scopes. Les nouvelles actions de continuation `context`, `events`, `metrics` complètent les actions disque existantes.

## Conversation avec Ollama

Activation explicite côté processus MCP :

```sh
DT_MCP_OLLAMA_ENABLED=true
DT_MCP_OLLAMA_URL=http://127.0.0.1:11434
DT_MCP_OLLAMA_MODEL=qwen3:1.7b
```

Ollama doit déjà être lancé, avec `OLLAMA_NO_CLOUD=1`, et le modèle déjà téléchargé. Endpoint HTTP strictement `127.0.0.1`, sans credentials/path/query/hash, redirects refusés. Le serveur vérifie que le modèle est installé ; tags distants et noms cloud refusés. Aucun pull, SDK externe ou repli cloud.

Une question naturelle passe par deux sorties structurées : choix d’une lecture dans une liste autorisée, puis choix d’un fait parmi les preuves. La réponse technique est construite par le MCP à partir de ce fait, avec ses références, sans génération libre de chiffres, unités ou causalité. Une demande couverte par le contexte ne déclenche aucune nouvelle lecture Dynatrace. Une nouvelle lecture conserve le même problème et la même session. Pour les pistes ciblées événements/logs/métriques, seuls les faits correspondants sont proposés au modèle après la collecte.

Ce choix est fondé sur la qualification de `qwen3:1.7b` : la génération libre a confondu espace disponible et capacité totale ; un schéma combinant action et réponse a routé plusieurs demandes à tort vers recovery. Ces modes ne sont pas retenus. Le mode final reste une conversation guidée par les preuves, pas un agent général à diagnostic libre. La pertinence du choix du fait ou de la lecture peut encore être imparfaite.

Le modèle reçoit des faits concis, l’identité et le périmètre, et jusqu’à trois échanges récents ; pas les configurations API, tokens, logs bruts ou réponses Axios. Les données sont présentées comme non fiables, jamais comme instructions. Les valeurs, identifiants et conclusions présentés viennent du MCP. Si le modèle manque, dépasse le délai ou renvoie une sortie invalide, le rapport précédent reste disponible et l’erreur est générique ; pas de fallback silencieux aux mots-clés. Sans activation Ollama, l’ancienne résolution limitée reste disponible pour compatibilité.

## Bornes et limites

- Un environnement/problème par session ; propriétaire, alias et URL vérifiés, mémoire de processus, 100 sessions max, TTL 30 minutes, six échanges et dix étapes. Redémarrer le MCP invalide les sessions ; les historiques Daybreak restent conservés.
- Collecte séquentielle, maximum 18 lectures effectives et budget de lancement 80 s, espacement 1,1 s. Chaque appel en cours peut atteindre son propre timeout.
- Catalogue de dix métriques par entité ; deux séries maximum parmi celles avec dimension d’entité, priorité aux métriques publiées dans les événements si présentes dans ce catalogue. Les métriques descriptives ne sont pas une explication du problème.
- Requêtes construites par le MCP, jamais par le modèle : IDs issus du problème, sélecteur d’entité exact, metricId simple validé, aucune formule d’événement exécutée. Séries hors entité, ambiguës ou sans dimensions rejetées. Unités absentes, lacunes, troncatures et dates futures signalées.
- Événements : dix résultats par entité sur 24 h ; page non exhaustive signalée. Relations descriptives, sans traversée implicite ni attribution causale.
- Logs généraux : uniquement les Hosts explicitement affectés, dix résultats sur 2 h ; métadonnées temporelles/niveau sans contenu brut envoyé à Ollama. Service sans Host explicite : aucune recherche globale. L’analyse détaillée des messages et les playbooks métier restent à développer.
- Ollama : deux inférences, 45 s max chacune. Essais fictifs du parcours complet : environ 6–8 s sur ce Mac Intel, hors latence API. Pas de SLA ; chargement à froid et taille du contexte peuvent augmenter le délai.

## Validation

Build TypeScript, 368 tests MCP, 133 tests Daybreak ; tests extension et aperçu fictif du panneau. Tests MCP : non-disque, scopes, isolation des séries/IDs, pas de logs globaux, même session et réponse en cache, contexte propriétaire, erreur locale sans secret, URL LLM externe/modèle cloud refusés, sorties non vérifiables rejetées.

Qualification réelle Ollama avec faux problème CPU : Host répondu sans relecture API, relecture événements pertinente avec même ID, demande de suppression sans aucune écriture et clarification. Ces données fictives ne prouvent pas une couverture live CPU, réseau, service ou application.

Validation live supplémentaire du 12 octobre : via la passerelle redémarrée et l’origine Chrome autorisée, le problème fourni par le propriétaire est relu en lecture, puis la question « Sur quel Host est ce problème ? » reçoit le Host présent dans les preuves avec Ollama completed. Même job et investigationId, zéro nouvelle sous-lecture Dynatrace pour cette question. Aucun token/télémétrie imprimé, aucune écriture Dynatrace ; un job de test ajouté à l’historique local conservé. Les derniers libellés du panneau sont vérifiés en aperçu fictif à 380 px, pas encore dans Chrome natif.
