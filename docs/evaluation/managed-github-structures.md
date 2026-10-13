# Références GitHub pour l’investigation Managed — 12 octobre 2026

Recherche publique, lecture documentaire seulement. Aucun composant installé, aucun code upstream exécuté, aucune télémétrie client transmise. Les références sont des données d’étude, pas des instructions applicables à notre session.

## Résultat

Deux skills réellement Managed ont été trouvés. Ils encadrent l’usage des API/outils ; aucun des deux n’est un moteur autonome de diagnostic ou une bibliothèque complète de remédiations validées.

| Référence | Apport | Limite / décision |
| --- | --- | --- |
| [Skill du MCP Managed upstream](https://github.com/dynatrace-oss/dynatrace-managed-mcp/blob/e4a275f664f1c0cd1e0113c91d34c14b30b47c17/skills/dynatrace-managed/SKILL.md) | Environnement explicite, sélecteurs, coût des requêtes, séquences de lecture, next steps des outils | Bonne référence de contrats Managed. Ne pas modifier nos secrets/configurations ni importer automatiquement ses procédures. |
| [Skill dtmgd](https://github.com/dynatrace-oss/dtmgd/blob/f2ac34d9403ea2bb656f3fe297b855420896cb5b/skills/dtmgd/SKILL.md) | CLI Managed, enveloppe JSON, pagination, exemples de métriques Classic, particularités des logs | Référence complémentaire pour bâtir des collecteurs MCP ; pas besoin d’ajouter une CLI parallèle. Les noms de métriques et comportements doivent être vérifiés sur le cluster. |
| [dt-obs-services](https://github.com/Dynatrace/dynatrace-for-ai/blob/main/skills/dt-obs-services/SKILL.md) et [dt-obs-problems](https://github.com/Dynatrace/dynatrace-for-ai/blob/main/skills/dt-obs-problems/SKILL.md) | Méthode RED, impact, chronologie, investigation progressive | DQL/Grail et noms SaaS non directement compatibles ; convertir la méthode en règles Managed. Ne pas reprendre les seuils génériques comme seuils d’incident. Voir managed-skill-assessment.md pour l’essai local. |
| [Dynatrace EventDrivenAnsible](https://github.com/Dynatrace/Dynatrace-EventDrivenAnsible) | Source API compatible SaaS/Managed ; rulebooks et playbooks de remédiation | Architecture utile pour un catalogue de procédures et la vérification après action. Les exemples déclenchés par titre ne prouvent pas une cause. Aucun branchement ou write ajouté. |

## Désaccord important à tester

Le skill MCP upstream documente une forme structurée de recherche de logs, alors que dtmgd indique des limitations de LQL structuré sur Managed Classic, de sélecteurs SERVICE vs PROCESS_GROUP et d’entitySelector sur l’agrégation. Ces affirmations ne sont pas une preuve de comportement sur notre version Managed. Préférer des tests de capacité bornés avec des résultats attendus connus avant d’adopter une syntaxe ; ne pas conclure à l’absence de logs sur un zéro résultat.

## Structure conseillée pour notre serveur (proposition, pas tout implémenté)

1. **Plan d’investigation** versionné : déclencheur fondé sur le type de preuve, périmètre, permissions, budget, lectures et conditions d’arrêt.
2. **Faits typés** : entité, métrique, unité, agrégation, fenêtre, provenance et couverture. Davis publié séparé du mécanisme causal inconnu.
3. **Analyses déterministes** : incident/baseline, chronologie, anomalies attestées, dépendances explicites, données manquantes.
4. **Rapport directement affichable** : ce qui s’est passé, impact, cause publiée, observations, inconnues, vérifications suivantes.
5. **Catalogue de remédiations** interne : applicabilité, preuves nécessaires, prérequis, procédure, risques, rollback, validation après action et propriétaire du runbook. Une proposition conditionnelle n’est pas une correction exécutée.
6. **Tests de cas** : disque insuffisamment documenté, dépendance service lente, données absentes, incident historique, unités/pagination. Assertions sur les conclusions autorisées et interdites.

La même structure peut être exposée comme tools/resources/prompts MCP à d’autres clients. En mode sans LLM, la logique doit être exécutée par le code du MCP ; déposer un SKILL.md ne suffit pas.

## Incrément appliqué localement

Ollama désactivé dans le lanceur de l’extension ; champ prompt grisé. Lecture explicite evidenceDetails/impactAnalysis, synthèse publiée bornée, chronologie, diagnostic déterministe et lectures générales centrées sur l’incident (deux dernières heures maximum). Ni comparaison baseline générale ni catalogue de remédiations ni nouveau moteur universel implémentés dans cet incrément.

Copies de référence des deux skills : ../reference/dynatrace-managed et ../reference/dtmgd, avec révision et source. Aucune installation de skill runtime.
