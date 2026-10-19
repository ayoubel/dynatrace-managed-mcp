# Advisor — démonstration synthétique Sprint 13

Le moteur existant reste la source des verdicts : `auditManagedLifecycle`, `buildLifecycleReport`, `combineLifecycleReports`, les outils MCP `audit_obsolescence`, `combine_obsolescence_audits` et `get_runtime_inventory`. Le kit enregistre ces vrais outils sur le SDK MCP et utilise le vrai `EntitiesApiClient`. Seul le port HTTP Managed est remplacé par des données synthétiques. Aucun résultat d'audit préfabriqué.

## Lancer

Pré-requis : Node 26.5.x, dépendances Core et Gateway déjà installées. Aucun téléchargement par les scripts. Depuis le dépôt Core Sprint 13 :

```sh
node scripts/advisor-demo-runtime.mjs --gateway-root /chemin/absolu/sre-morning-check --output /chemin/prive/preuves
```

Ouvrir l'origine loopback affichée, puis **Obsolescence**. Le lancement d'audit ne nécessite aucun instantané Morning Check. Sélectionner un environnement, Tous les composants, 180 jours, Auditer. Deux serveurs `first` et `second` possèdent le même alias `prod` mais des identités distinctes.

## Narration SRE — 8 minutes

1. « Je prépare les travaux de maintenance depuis les versions observées, sans écrire dans Dynatrace. » Montrer le périmètre et lancer un audit.
2. Montrer le score, la couverture et les inconnus séparément. Un Process group apporte du contexte, sans prouver la version de chaque Process. Une version absente ne signifie pas hors support.
3. Ouvrir une campagne prioritaire Ubuntu ou Node.js, puis une entité et ses preuves : champ exact, version brute, source et horodatages. Revenir à la campagne. Les cibles de migration ne sont pas des compatibilités garanties.
4. Montrer Java Temurin : la borne de disponibilité minimum ne devient pas une date EOL/EOS. Ouvrir le référentiel embarqué, son SHA-256, les dates enregistrées, la précision et la portée de support. Aucune consultation éditeur en temps réel.
5. Chercher une technologie, filtrer les inconnus, revenir à toutes les campagnes. Exporter Markdown, JSON ou HTML ; recharger et retrouver l'historique du périmètre.
6. Expliquer les scénarios dégradés exécutés par la recette : pagination, inventaire incomplet, erreur API, lecture bloquée, catalogue périmé. Les preuves obtenues restent consultables ; aucun score global si l'inventaire ou la couverture ne le permettent pas.

## Recette reproductible

```sh
node scripts/verify-advisor-demo.mjs --gateway-root /chemin/absolu/sre-morning-check --playwright /chemin/vers/playwright --chrome /chemin/vers/chrome --output /chemin/prive/preuves
```

Les navigateurs/dépendances doivent être préinstallés. La recette crée une Gateway, deux processus MCP, un profil Chrome et des états privés. Les sockets sortants Gateway/MCP sont interdits par le garde réseau ; le navigateur ne peut accéder qu'à son origine loopback. Aucun token, configuration ou profil professionnel. Les inventaires et horloges proviennent exclusivement du scénario.

Cas : RICH, POOR, MISSING_REFERENCE, REFERENCE_STALE, PAGINATED, PARTIAL, API_FAILURE, TIMEOUT ; agrégation réelle de deux serveurs ; lancement et navigation Web ; téléchargements et captures. Le calendrier est fixé au 19 octobre 2026, puis décalé de 110 jours pour le cas de référentiel périmé. Les références historiques portent toujours leur date du 8 octobre 2026 ; cette recette ne les vérifie pas auprès des éditeurs.

Les fichiers `acceptance.json`, `audit.jsonl`, `build.log`, `gateway.log`, `screenshots/` et `exports/` sont conservés dans un nouveau dossier `advisor-demo-*`. Une erreur produit FAIL et un code de sortie non nul. Aucun échec n'est transformé en réussite.

## Bornes et arrêt

Par défaut : 200 appels maximum, 10 pages par type/environnement, 100 entités par page, 12 s par lecture et 80 s au total par audit Core ; 5 environnements maximum. Le port autonome permet des limites validées plus petites et plafonne respectivement à 200/10/30 s/120 s. Gateway laisse 150 s à l'appel MCP pour permettre le retour du résultat partiel. Après timeout, aucune nouvelle lecture n'est lancée ; l'annulation de la requête déjà en vol n'est pas garantie.

Ctrl-C arrête uniquement la Gateway de ce lanceur et ses transports enfants. Le pilote automatique ferme son navigateur et sa Gateway dans `finally`. Les preuves et profils privés sont conservés ; les supprimer manuellement seulement après vérification de l'arrêt et décision de ne plus conserver ces preuves. Ne jamais nettoyer un checkout ou un service historique pour rejouer cette démo.

## Limites

Inventaire borné à ce que Managed expose, sans extrapolation aux assets absents. Référentiel upstream/édition et support standard, sans contrat de support commercial inféré. Aucune matrice de compatibilité et aucune date nouvelle ajoutée. Le regroupement recalcule les verdicts depuis les preuves fournies mais n'atteste pas indépendamment leur origine. Pas de certification de parc réel, de déploiement ou d'acceptation humaine. Advisor reste sur sa branche dédiée jusqu'au GO de merge.
