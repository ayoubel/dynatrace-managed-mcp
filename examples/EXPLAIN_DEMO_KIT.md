# Explain V1 — démonstration synthétique reproductible

Dynatrace **Managed Classic exclusivement**, sans instance ni credential réel. Le vrai moteur Explain et la vraie Gateway sont utilisés ; le petit adaptateur MCP SDK de test simule les ports Managed. Les tests séparés des transports MCP produit restent nécessaires. Aucun résultat diagnostique préfabriqué n'est injecté.

## Préparation et lancement

Node conforme au `package.json` Core (26.5.x), dépendances Core/Gateway déjà installées. Les suites unitaires de chaque dépôt restent autonomes. Les comparaisons et recettes ci-dessous sont explicitement inter-produits, avec chemins fournis par l'opérateur. Aucun téléchargement automatique.

Depuis Core, remplacer les chemins d'exemple :

```sh
node scripts/explain-demo-runtime.mjs \
  --gateway-root /chemin/sre-morning-check \
  --output /chemin/prive/recette
```

Ouvrir l'URL `/workspace` affichée. Le lanceur crée un nouveau dossier `explain-demo-*`, compile hors de `dist/`, utilise un HOME/TMP et des données vierges, puis écoute sur un port loopback éphémère différent de 4318. Deux environnements fictifs `first` et `second` sont découverts. Le lancement Explain fonctionne sans snapshot Morning Check ; la recette vérifie le nom exact de l'outil `dynatrace_managed_explain_problem`, et la fixture refuse l'ancien outil pour éviter une parité artificielle. Le garde réseau empêche toute connexion sortante des enfants Gateway/MCP, même vers 4318. `managed.example` est une identité synthétique, jamais une destination contactée. Ne pas ouvrir les liens Managed du rapport pour une démonstration hors ligne.

Pour Chrome manuel, fournir `--extension-origin chrome-extension://<identifiant-du-profil-de-test>` et configurer `chrome.storage.local.gateway` vers l'URL affichée **avant la première ouverture du panneau**, dans un profil temporaire exclusivement. La recette automatisée le fait elle-même.

## Recette complète Web et Chrome MV3 natif headless

```sh
node scripts/verify-explain-demo.mjs \
  --gateway-root /chemin/sre-morning-check \
  --extension-root /chemin/daybreak-browser-extension \
  --playwright /chemin/absolu/vers/playwright \
  --chrome /chemin/absolu/vers/chrome \
  --output /chemin/prive/recette
```

Playwright et Chrome doivent être provisionnés séparément. Un profil Chrome neuf est créé ; le profil habituel n'est jamais chargé. La recette configure l'origine exacte, charge le vrai worker, ouvre une véritable cible `chrome.sidePanel` et vérifie preuves/retour/focus. `acceptance.json`, `audit.jsonl`, les captures dans `screenshots/` et les exports JSON/Markdown/HTML dans `exports/` sont produits dans le nouveau dossier. Un échec donne un code de sortie non nul et reste consigné ; le résultat d'une tentative précédente n'est pas écrasé.

## Scénario client — SRE, huit minutes

1. **Annonce** : « Ces incidents et leurs valeurs sont entièrement synthétiques. Nous montrons le logiciel, pas un incident client ni une certification Managed. »
2. Choisir `first`, charger les problèmes ouverts et sélectionner **RICH**. Lancer Explain. Présenter les étapes de collecte puis le rapport. Le problème publié désigne Checkout comme entité causale ; une preuve Davis marquée pertinente, les mesures qualifiées et l'impact publié sont conservés. La latence passe de 100 à 300 ms, les erreurs et le volume sont stables. Les 120 utilisateurs sont une estimation synthétique pour une seule entité, sans addition.
3. Ouvrir la preuve de la conclusion : source Problems, entité, date et fenêtre. Ouvrir une paire de mesures pour comparer baseline et incident. Revenir au constat et exporter le dossier Markdown. **Davis désigne une entité ; le moteur ne prétend pas avoir démontré son mécanisme technique.** Une hausse de latence n'est pas une preuve de causalité.
4. Sélectionner **AMBIGUOUS** : service et dépendance ralentis, changement publié proche. Présenter les deux pistes concurrentes, les preuves associées et les vérifications de traces/version. Ne pas choisir arbitrairement un coupable ni proposer un rollback automatique.
5. Sélectionner **POOR** : aucune métrique exploitable ni cause publiée. Le problème reste documenté par sa source, mais le rapport est partiel et ne contient aucune root cause affirmée. La prochaine action est de compléter les preuves.
6. **STALE** et **CONTRADICTORY** : points hors fenêtre ou dimension supplémentaire ; les comparaisons non qualifiées sont refusées. **S08**, **S08-timeout**, **S08-budget** : les preuves déjà acquises survivent à une collecte incomplète.
7. Actualiser RICH : même job, nouveau snapshot, original conservé. Changer d'environnement puis relancer RICH : nouveau job et nouveau périmètre. Montrer Historique, Preuves et export.
8. Option Chrome : consulter la même investigation dans le sidepanel réel ; montrer le retour à la preuve et le focus. Chrome est un consommateur interchangeable, pas une dépendance du moteur.

## Arrêt, nettoyage et limites

Le lanceur interactif s'arrête avec **Ctrl-C** : seule sa Gateway reçoit SIGTERM et ferme ses clients de test. La recette automatisée ferme son propre Chrome et sa Gateway dans `finally`. Les profils temporaires et les preuves sont conservés pour audit ; après vérification de l'arrêt, seuls les dossiers privés indiqués par cette exécution peuvent être retirés manuellement. Aucun checkout, service, release ou état professionnel n'est nettoyé.

Les scénarios riches valident une **attribution publiée Davis corroborée par des observations**, pas un nouveau moteur de démonstration causale. Traces/PurePaths bruts, baseline saine, topologie historique, pondération statistique, déploiement partagé et Managed réel ne sont pas certifiés. Le Core reste déterministe sans LLM ; la recette de panne LLM signifie que ce parcours fonctionne avec le fournisseur indisponible/désactivé, sans dépendance de repli générative. Les remédiations restent des vérifications et propositions conditionnelles, sans exécution.
