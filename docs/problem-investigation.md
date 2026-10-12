# Investigation portable des problèmes — 9 octobre 2026

Le serveur MCP porte la collecte, l'interprétation des preuves et les demandes de continuation. Daybreak conserve son backend HTTP, les jobs, la persistance des rapports et leur présentation. Aucun fournisseur LLM externe n'est utilisé.

## Contrat

Outils en lecture : `dynatrace_managed_investigate_problem` (environment_alias, problemId), `dynatrace_managed_continue_investigation` (environment_alias, investigationId, action ou question). Réponse version 1 : problem, environment, scope, findings avec evidenceRefs et niveau de certitude, evidence, cause, limitations, nextSteps, steps, dates. Prompt MCP `continue_investigation` : transporte l'identifiant et les instructions de reprise, sans embarquer la télémétrie.

Les sessions MCP sont en mémoire, liées au propriétaire et à l'environnement, bornées à 100 et expirent après 30 minutes ou au redémarrage. Daybreak accepte uniquement une continuation issue d'un rapport de son périmètre actif. Les questions reconnues sont déterministes : seuil, tendance, logs, rétablissement, origine des écritures ; les autres demandent une précision.

## Analyse disque

Lire le problème et ses événements, identifier le Host et le Disk exacts depuis le sélecteur publié, lire les contrats métriques, le volume et ses relations, comparer une fenêtre récente et celle de l'incident, lire l'espace disponible et rechercher les logs de saturation. Pour un volume Kubernetes, rechercher les relations explicites et le Pod UID contenu dans le montage. Un Pod associé ou un volume NFS ne prouve pas l'auteur des écritures.

Le seuil brut d'un événement n'est jamais converti seul en seuil utilisateur. L'interprétation exige une règle Settings statique, un sélecteur identique sans transformation, un opérateur et une unité connus. La règle actuelle ne prouve pas sa configuration historique. Données absentes, séries ambiguës, lacunes, troncatures et horloge incohérente restent explicites. Les incidents autres que les sélecteurs disque pris en charge restent limités ; aucune analyse CPU générique n'est substituée.

Maximum 18 lectures, lancement borné à 80 secondes, appels espacés de 1,1 seconde ; le dernier appel peut encore atteindre son délai réseau. Périmètre limité à un environnement et un volume par problème. Daybreak exige un problème explicitement choisi dans un seul environnement. Aucun échantillon ni regroupement automatique. Accès obligatoire problems.read ; lectures complémentaires selon scopes disponibles, dont metrics.read, entities.read, events.read, logs.read et settings.read. Aucun scope d'écriture ajouté.

## UI et validation

Constats concis, détails et preuves extensibles, actions de continuation et champ de question avec contexte conservé. Plusieurs rapports : premier ouvert, suivants repliés. Exports HTML/Markdown conservent preuves et limites.

Validation locale : 128 tests Daybreak, 362 tests MCP et compilation TypeScript réussis. Validation live en lecture : trois problèmes TEST2 ciblés, volumes distincts, métriques et contexte NFS ; origine des écritures encore inconnue. Outils et prompt découverts, continuation MCP conservant l'identifiant et le périmètre vérifiée. Application 4318 redémarrée pour reconnecter le MCP ; aperçu 4319 indépendant non modifié. Ces validations sont datées, pas une garantie permanente de disponibilité des données.

## Parcours individuel (évolution du 9 octobre)

Chaque gate Morning check conserve une action visible icône + Investiguer. La gate Problèmes ouvre tous ses problèmes ouverts du bilan : identifiant, entité, environnement et durée. Chaque ligne lance un seul outil MCP avec son problemId. Le backend refuse les cibles absentes ou hors périmètre. Aucun regroupement par titre, Host ou proximité temporelle. Aucune détection de cause commune ajoutée : les rapports restent indépendants. La liste utilise le dernier bilan ; le MCP relit le problème à son lancement. Validation UI live : 32 lignes, choix du cinquième problème, un seul rapport.

Validation session live : deux continuations (Tendance puis question « examiner les logs »), identifiant de fiche inchangé, constats initiaux conservés, deux réponses restaurées depuis l’historique. Les continuations utilisent uniquement `continue_investigation` pour le problème et son contexte MCP.

## État Git après enregistrement et publication

Fonctionnalité commitée : Daybreak `69d3401`, MCP `c7f2043`. Branche MCP `feature/problem-investigation-mcp` publiée sur le fork origin ; Daybreak sans remote, push en attente de destination. Des commits documentaires suivent. Aucun merge ni écriture Dynatrace.

### Publication Daybreak confirmée

Dépôt GitHub privé créé à la demande du propriétaire : `https://github.com/ayoubel/daybreak`. Remote Daybreak `origin` configuré ; branche `feature/problem-investigation-mcp` poussée et suivie. MCP publié sur son origin `https://github.com/ayoubel/dynatrace-managed-mcp`, même branche. Les mentions précédentes « Daybreak sans remote » sont historiques. Aucun merge, aucune PR créée ; configurations et fichiers locaux préexistants toujours exclus.
