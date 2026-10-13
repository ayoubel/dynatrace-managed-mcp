/** Versioned, conditional guidance. These rules propose checks, never execute writes. */
export const remediationPolicyVersion = 'managed-explain-2026-10-12';
export function explainRemediation(plan:string, refs:string[], hasRoot:boolean, hasHost:boolean) {
  const item=(title:string,text:string,condition:string,action?:string)=>({title,text,condition,action,certainty:'conditional' as const,evidenceRefs:refs});
  const immediate=[item('Événements de l’incident','Relire les événements sur les entités du problème. La proximité temporelle ne prouve pas une cause.','Mécanisme technique à confirmer','events')];
  if(plan==='disk') immediate.push(item('Origine des écritures','Vérifier le volume, les clients et les workloads explicitement associés.','Auteur des écritures inconnu','writers'),item('Règle et seuil','Vérifier la règle, son unité et la mesure de l’incident.','Seuil et configuration historique à confirmer','threshold'));
  else if(plan==='service') immediate.push(item('Contexte et relations','Relire les relations publiées des entités concernées ; une relation ne prouve pas un flux ni sa défaillance.','Dépendance à confirmer','context'),item('Erreurs et temps de réponse','Comparer les mesures de l’incident à une fenêtre précédente de même durée.','Mesures et couverture à confirmer','metrics'));
  if(plan==='synthetic') immediate.push(item('Résultats du moniteur','Vérifier les exécutions, locations, étapes HTTP, délais et erreurs autour de l’incident. Les propriétés de l’événement ne sont pas des résultats d’exécution.','Moniteur identifié ; résultats synthétiques à confirmer'),item('Disponibilité et durée','Relire les métriques du moniteur sur la fenêtre incidente.','Métriques disponibles et périmètre identique','metrics'));
  if(plan==='infrastructure') immediate.push(item('Ressources du Host','Relire les ressources disponibles de l’hôte. Pour une alerte disque, identifier le volume avant une lecture ciblée ; une utilisation élevée ne suffit pas à expliquer le problème.','Host explicitement concerné','metrics'),item('Relations et changements','Examiner les relations publiées et les changements associés ; un changement déclaré reste à vérifier.','Contexte de la plateforme à confirmer','context'));
  if(hasHost) immediate.push(item('Logs de l’incident','Rechercher les logs du Host explicitement concerné. Zéro résultat ne prouve pas l’absence d’erreur.','Host identifié et accès logs autorisé','logs'));
  const shortTerm=plan==='disk'?[
    item('Rétention ciblée','Appliquer une purge conforme au runbook, après identification des données, du propriétaire et de leur rétention.','Saturation confirmée et procédure de purge approuvée'),
    item('Extension du volume','Évaluer l’extension et les contraintes du stockage avant intervention.','Capacité insuffisante confirmée et changement validé'),
  ]:plan==='service'?[
    item('Timeout et réponse de secours','Borner l’attente des appels et prévoir un fallback adapté au service.','Appels bloquants confirmés et modification validée par le propriétaire'),
    item('Corriger la destination','Vérifier puis corriger l’adresse, le domaine ou la configuration de la dépendance.','Destination invalide et configuration applicative confirmées'),
    item('Retour arrière ciblé','Évaluer un rollback du changement relié à l’incident.','Changement causal confirmé et procédure de retour approuvée'),
  ]:plan==='synthetic'?[item('Corriger l’étape ou la destination','Vérifier la configuration de l’étape, DNS, certificat et destination ; faire corriger uniquement le défaut confirmé.','Échec reproduit et configuration invalidée par le propriétaire')]:plan==='infrastructure'?[item('Ajuster la ressource ou le changement','Identifier le workload consommateur et vérifier limites, capacité ou changement avant une intervention ciblée.','Contention ou changement causal confirmé ; procédure validée')]:[];
  const prevention=plan==='disk'?[
    item('Capacité et rétention','Revoir la croissance, la rétention et les alertes de capacité du volume.','Volume, propriétaire et besoin de capacité validés'),
    item('Suivi des clients du volume','Documenter les producteurs et leur consommation, y compris les clients distants si applicables.','Relations des clients confirmées'),
  ]:plan==='service'?[
    item('Surveiller la dépendance','Évaluer des sondes et alertes sur les destinations critiques.','Destination et criticité confirmées'),
    item('Limiter la propagation','Évaluer circuit breaker, cache et isolation selon le comportement du service.','Dépendance défaillante confirmée et stratégie adaptée à l’application'),
    item('Tester la résilience','Tester la défaillance de la dépendance et vérifier l’impact utilisateur.','Périmètre et scénario validés dans un environnement de test'),
  ]:plan==='synthetic'?[item('Couverture synthétique','Revoir les locations, assertions, seuils et alertes du moniteur.','Criticité et mode de défaillance confirmés')]:plan==='infrastructure'?[item('Capacité et alertes Host','Documenter la demande de ressources, les limites et la tendance de capacité.','Ressource limitante réellement identifiée')]:[item('Revoir le runbook et les alertes','Documenter les vérifications et contrôles du périmètre confirmé.','Cause et périmètre validés')];
  const shortTermSteps=plan==='disk'?[
    ['Identifier les données et leur propriétaire.','Confirmer la rétention et les sauvegardes nécessaires.','Appliquer uniquement la procédure de purge approuvée.'],
    ['Vérifier la capacité du stockage et les limites du volume.','Préparer l’extension selon la procédure de la plateforme.','Faire réaliser le changement par le propriétaire du stockage.'],
  ]:plan==='service'?[
    ['Identifier l’appel et le budget de temps acceptable.','Préparer un timeout et un fallback adaptés à cet appel.','Tester le comportement en cas de dépendance lente ou indisponible avant déploiement.'],
    ['Identifier la destination en échec dans les traces ou logs.','Comparer l’adresse, la résolution DNS et la configuration attendue.','Faire corriger la configuration confirmée par le propriétaire applicatif.'],
    ['Identifier le changement effectivement relié à l’incident.','Vérifier la compatibilité et les risques du retour arrière.','Faire appliquer la procédure de rollback approuvée.'],
  ]:plan==='synthetic'?[[
    'Reproduire l’échec et identifier l’étape et la location concernées.','Vérifier DNS, TLS, destination et assertions avec le propriétaire.','Faire réaliser uniquement le changement confirmé et validé.'
  ]]:plan==='infrastructure'?[[
    'Identifier la ressource et le workload réellement limitants.','Vérifier les contraintes de capacité et l’historique du changement.','Faire réaliser l’ajustement validé selon le runbook.'
  ]]:[];
  const fixes=shortTerm.map((proposal,index)=>({...proposal,steps:shortTermSteps[index],validation:plan==='disk'?'Contrôler l’espace disponible, la croissance et l’état du problème sur le même volume.':plan==='synthetic'?'Contrôler plusieurs exécutions du même moniteur et les locations concernées ; clos ne signifie pas corrigé.':plan==='infrastructure'?'Contrôler la même ressource, le workload et la stabilité du Host après intervention.':'Contrôler erreurs, temps de réponse et impact utilisateur sur le même périmètre ; un problème clos ne prouve pas la correction.'}));
  return {title:'Que faire maintenant',immediate,shortTerm:fixes,prevention,execution:'proposal-only',policyVersion:remediationPolicyVersion,runbookStatus:'No customer-approved runbook configured',publishedCauseAvailable:hasRoot};
}
