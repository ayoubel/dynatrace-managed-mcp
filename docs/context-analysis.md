# Analyses contextuelles Managed

`dynatrace_managed_analyze_context` fournit un bilan déterministe sans LLM. Paramètres : environment_alias, target, investigationId facultatif pour rafraîchir la même session. Chaque sous-lecture dépend du catalogue autorisé.

- Environnement : problèmes OPEN sur 24 h, page limitée à 50 ; répartition et entités de cette page.
- Hôte : identité/configuration, problèmes associés, CPU/mémoire/disque sur 2 h, résolution 5 min, dernier point et min/max. Service : erreurs/latence. Identité, métrique, unité et période vérifiées. Maximum cinq séries par métrique ; aucun diagnostic de saturation sans seuil.
- Dashboard Classic : définition, propriétaire, métriques explicites, filtres persistés et douze tuiles détaillées. Valeurs non exécutées ; période du navigateur non collectée. Tuiles sans configuration reconnue signalées comme heuristique.
- Métrique : contrat uniquement sans entité explicitement choisie.

Budget avant nouvelle sous-lecture : 75 s ; requête en cours soumise au timeout HTTP existant. Les limites apparaissent dans la restitution. Aucun write Dynatrace ni push. Sessions MCP en mémoire, historique passerelle persistant.

Extension : changement de page signalé sans collecte automatique, bascule explicite, fiche précédente conservée en cas d'échec, rafraîchissement sur même job/session et rapport initial dans Historique.

## Revue et validation — 12 octobre 2026

Skill review-agent appliqué en lecture seule, puis corrections séparées :
- P1 : verrou de politique token conservé lors de lectures imbriquées. Reproduit live, analyze_context ajouté aux orchestrateurs qui relâchent le verrou.
- P2 : points hors fenêtre/autre métrique acceptés dans les statistiques. Filtrage et tests de régression ajoutés.
- P2 : rapport initial contextuel absent de l'historique. Rendu ajouté.
- P2 : échec de bascule masquant la fiche précédente. Restauration ajoutée.

Tests avant dernière passe : 400 MCP, 140 passerelle, 9 extension ; 47 MCP ignorés. Build réussi après correction du verrou. Validation live : environnement completed ; hôte 10 constats/8 lectures, refresh même job/session ; dashboard 11 constats, définition seulement ; LLM disabled. Aperçu fictif 380 px : navigation, bilans, historique et prompt désactivé, aucun débordement.

La dernière passe complète, d'abord empêchée par une limite d'usage de la revue automatique d'approbation, a ensuite pu être exécutée : build réussi, 400 tests MCP réussis, 47 ignorés. Chrome natif et service/métrique live restent à qualifier.
