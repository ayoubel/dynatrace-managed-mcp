# Guide expérimental d’investigation Managed

Adaptation conceptuelle pour le test, à partir de Dynatrace/dynatrace-for-ai, dt-obs-problems et ses références (révision f4da5a6a86c0620ff0c0c343dc9a4ab90e0eb40c, Apache-2.0). Ce document n’est pas chargé par le MCP en production. Les règles ci-dessous sont une adaptation Daybreak, pas une copie exécutable du guide SaaS.

1. Définir le problème, son environnement, les entités et la fenêtre temporelle. L’API Managed utilise problemId/displayId, title, status OPEN/CLOSED, startTime/endTime, rootCauseEntity, evidenceDetails et impactAnalysis. Ne pas utiliser DQL/Grail, event.status ACTIVE ou des tools SaaS absents du catalogue.
2. Décrire ce qui s’est passé, la durée et l’impact seulement s’ils sont mesurés. Résoudre les noms d’entités avec les lectures autorisées. Une entité affectée n’est pas automatiquement la cause.
3. Distinguer cause publiée par Davis, observations et hypothèses. Une cause Davis identifie une entité causale ; elle ne démontre pas automatiquement une panne réseau, un déploiement ou une erreur de configuration précise.
4. Comparer avant, pendant et après l’incident, avec les mêmes métriques, unités et entités. Une valeur actuelle ou deux points ne permettent pas de reconstituer l’incident. Ne pas inventer de baseline, pourcentage, population affectée ou cause.
5. Corréler événements, changements, logs et dépendances sur une fenêtre bornée autour du début. Sans preuve de causalité, nommer explicitement la corrélation et le test nécessaire. Sans logs, ne pas inventer un message ou une exception.
6. Proposer des vérifications concrètes, ordonnées, avec une observation attendue pour confirmer ou réfuter l’hypothèse. Aucune commande destructive, modification ou écriture automatique. Une recommandation de configuration doit être validée dans un runbook adapté au produit/version.
7. Réponse : Ce qui s’est passé ; Cause établie et hypothèses ; Vérifications prioritaires ; Données manquantes. Relier les affirmations aux preuves. Les actions proposées ne sont pas des opérations déjà réalisées.
