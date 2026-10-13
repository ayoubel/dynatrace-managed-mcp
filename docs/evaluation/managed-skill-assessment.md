# Évaluation dt-obs-problems pour Daybreak Managed — 12 octobre 2026

## Décision

Le guide est pertinent comme référence de conception des méthodes MCP, mais l’ajout au prompt du Qwen3 1.7B actuel ne suffit pas à obtenir une analyse fiable. Ne pas activer l’injection du fichier SaaS complet dans la conversation de production. Garder la collecte, les calculs, les assertions causales étayées et le rapport de faits dans le MCP. Le modèle reste utile pour le dialogue, sous contrôle ; Ollama n’est pas une dépendance obligatoire de ces fonctions métier.

## Provenance et compatibilité

Source publique officielle : https://github.com/Dynatrace/dynatrace-for-ai/blob/f4da5a6a86c0620ff0c0c343dc9a4ab90e0eb40c/skills/dt-obs-problems/SKILL.md

Copie figée : ../reference/dt-obs-problems/UPSTREAM_SKILL.md ; références impact-analysis.md et problem-correlation.md conservées avec LICENSE et SOURCE.json (Apache-2.0). Le fichier récupéré contient 481 lignes plus une fin de ligne, cohérent avec la capture, sans preuve d’identité de version avec le SaaS. Aucun skill installé dans Codex ; aucun guide activé dans le MCP en production.

À conserver : périmètre et fenêtre temporelle, identité du problème, cause Davis distincte de l’entité affectée, analyse d’impact, corrélation logs/événements/changements, noms d’entités, bornes de lecture et recommandations liées aux faits.

À traduire : DQL/Grail et ses noms de champs/outils vers les API et outils Managed réellement disponibles ; event.status ACTIVE vers status OPEN dans le contrat Problems v2. Le fichier ne contient ni les poids du modèle SaaS, ni l’implémentation de ses agents, ni les runbooks de chaque client. Ses références sont une bibliothèque méthodologique, pas une garantie de diagnostic.

## Protocole du test

Ollama local, qwen3:1.7b, CPU du Mac, température 0, maximum 450 tokens de sortie. Deux fixtures fictives identiques pour les trois variantes. Aucun appel API Dynatrace/MCP, aucune écriture, aucun téléchargement de modèle et aucune télémétrie réelle utilisée pendant cette comparaison. Script reproductible : ../../scripts/evaluate-managed-skill.cjs ; sorties complètes : managed-skill-results.json.

Comparaison principale : réponse sans guide et adaptation Managed de 2 173 octets, toutes deux avec un contexte de 4 096 tokens. La variante SaaS complète de 18 452 octets est un test supplémentaire de compatibilité, avec un contexte de 8 192 tokens pour éviter de tronquer le guide ; ses temps ne constituent donc pas une comparaison contrôlée de performance avec les deux premières variantes. Délai de 120 secondes dans le banc de test, supérieur au délai de 45 secondes de la production. Ordre fixe, un essai par cas, caches froids/chauds non contrôlés : évaluation exploratoire, aucune estimation statistique de qualité.

Le test porte sur la synthèse de preuves déjà fournies, pas sur la sélection des outils, la collecte additionnelle ou la recherche de runbooks. Il ne mesure pas une parité fonctionnelle avec Dynatrace Assist.

## Résultats observés et revue humaine

| Variante | Disque avec preuves insuffisantes | Erreurs Service | Durées disque / service |
| --- | --- | --- | --- |
| Sans guide | Invente un manque d’espace et présente un nettoyage comme réalisé | Invente une hausse de fréquence des appels et une perte de logs | 20,8 s / 20,4 s |
| Guide adapté Managed | Invente un dépassement de capacité ; mentionne néanmoins des données manquantes | Attribue au service web le taux d’erreur de sa dépendance externe ; recommandations génériques | 29,0 s / 20,6 s |
| Guide SaaS complet | Aucun résultat avant le délai | Résumé générique, pas de structuration complète ni de preuve de la nécessité de réduire la charge | >120 s / 27,4 s |

Vérité attendue du cas disque : 18,49 GiB disponibles après l’incident, deux points, delta nul ; aucune capacité totale, aucune série pendant l’incident, aucun log ni règle. On ne peut conclure à une saturation ni à une cause ; aucune remédiation réalisée n’est documentée.

Vérité attendue du cas Service : incident fermé de 12 minutes, cause publiée External requests, deux services et 120 utilisateurs affectés. La dépendance External requests présente 29,58 % d’erreurs et 6 188 ms de réponse, versus 0 % et 74 ms de baseline. Ces mesures ne sont pas celles du service web. Aucun renseignement sur un changement, framework, domaine cible ou log ; une hausse de trafic, une panne réseau précise ou une erreur de configuration ne sont pas démontrées.

Les réponses complètes citent des IDs existants mais leur interprétation peut être fausse. Un contrôle de validité des IDs ne prouve pas que chaque affirmation est étayée. L’adaptation améliore certains libellés sans démontrer une amélioration suffisante de la justesse. L’essai complet utilise 4 726 tokens de prompt pour le cas Service : le contexte de production de 4 096 tokens est insuffisant pour cette entrée.

## Architecture recommandée

1. Dans le MCP, reconstruire une fiche de preuves typées : entité, métrique, unité, fenêtre et provenance. Relire les champs Problems v2 disponibles, notamment evidenceDetails et impactAnalysis, actuellement non demandés par getProblemDetails. Vérifier leur couverture sur le cluster réel.
2. Transformer les méthodes utiles du guide en outils composés d’analyse : contexte du problème, impact, chronologie et comparaisons de séries. Les calculs et l’identification de l’entité porteuse d’une mesure doivent être déterministes. La cause technique inconnue doit rester inconnue.
3. Construire sans LLM une réponse structurée contenant les faits, la cause publiée, les limites et les vérifications choisies dans des runbooks validés. Ce parcours Explain peut être consommé par tout client MCP.
4. Rendre une ressource/prompt adapté disponible pour les clients disposant d’un LLM local ou interne. Ce modèle interprète la demande et accompagne le dialogue ; il ne devient pas la source de vérité des faits ni de la causalité. Garder les aperçus d’écriture et leurs confirmations séparés.

Ces quatre points sont une recommandation issue de l’évaluation, pas une implémentation supplémentaire du backlog. Le guide n’a pas été intégré par défaut.
