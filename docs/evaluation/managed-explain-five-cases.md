# Évaluation Explain Managed — cinq problèmes diversifiés

Évaluation du 12–13 octobre 2026. Exactement cinq nouveaux problèmes créés, sans panne réelle ni mesure injectée. Les événements ont une durée de dix minutes ; leur fermeture ne démontre pas une correction.

| Problème | Scénario | Gain constaté | Limite restante |
|---|---|---|---|
| P-2610396 | Contexte minimal sur hôte | Description et provenance conservées, CPU/mémoire ciblés | Mesures partielles, aucune cause établie |
| P-2610397 | Ressource disque déclarée | Plan infrastructure, volume à identifier avant collecte disque | Aucun volume ni saturation confirmés |
| P-2610398 | Infrastructure CPU/mémoire et changement déclaré | Mesures adaptées et conseils infrastructure | Deux points partiels, changement non causalement confirmé |
| P-2610399 | Erreurs service / dépendance externe déclarée | Contexte conservé, statut partiel cohérent | Séries service absentes, aucune baseline exploitable |
| P-2610400 | Moniteur HTTP / locations et DNS déclarés | Plan synthétique, métriques et conseils étapes/locations/DNS/TLS | Aucun résultat d’exécution ni mesure qualifiée |

## Modifications

Le MCP conserve une sélection bornée de propriétés déclarées, avec provenance event-declaration et expurgation des secrets. Il choisit les métriques selon le type d’entité, exclut les métriques de facturation, valide identité/dimension/fenêtre et signale les collectes partielles. Les recommandations infrastructure et moniteur restent conditionnelles, sans exécution.

Le panneau affiche « Test injecté », un bloc repliable « Contexte déclaré », les preuves associées et les corrections proposées. Le Markdown conserve aussi ce contexte. LLM désactivé, aucune télémétrie transmise à un LLM externe.

## Validation et limites

408 tests unitaires MCP, compilation TypeScript, 140 tests passerelle et 10 tests extension réussis. Deux agents ont évalué la provenance et revu les changements ciblés ; aucun défaut bloquant restant identifié. Panneau testé à 380 px sur données fictives : absence de débordement horizontal, liens vers preuves, corrections sans bouton d’exécution, prompt désactivé et parcours hors problème. Chrome natif reste à valider.

Les cinq analyses live finales sont partielles. Aucune cause Davis, aucun impact utilisateur ni comparaison baseline/incident inventés. Les appels avant/après sont séparés dans le temps : ils comparent le comportement de collecte et de restitution, pas une performance sur télémétrie figée. Ce test valide la prudence et le ciblage ; il ne démontre pas une parité causale avec SaaS Explain.

Prochain test utile : un incident réel documenté, avec métriques et événements disponibles, puis collecte des résultats d’exécution des moniteurs si exposés par les API Managed. Aucun événement supplémentaire créé.

Les payloads et résultats bruts restent locaux dans poc/test-events/batch-five ; ils ne doivent pas être publiés. Aucun push, merge ou remédiation appliquée.
