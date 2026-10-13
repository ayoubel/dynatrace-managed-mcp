# Conversation portable MCP

## Sessions sans problème

start_conversation crée un contexte d’environnement sans problème artificiel. Une cible optionnelle Host/Service, métrique ou dashboard est relue par le catalogue autorisé avant l’ouverture de la session. Sans permission ou en cas d’erreur de lecture, aucun contexte n’est déclaré acquis. Les contrôles démarrage/conversation sont exposés si au moins un scope métier pris en charge est disponible ; chaque sous-appel reste soumis à sa politique. Les contrôles sont exclus des outils que le modèle peut choisir. Le démarrage n’utilise pas Ollama, ne télécharge rien et ne déclenche aucune écriture. Même isolement propriétaire/environnement/URL et même durée que les investigations. La conversation naturelle reste soumise aux limites du modèle.

La conversation naturelle appelle `converse_investigation`. Le catalogue provient des outils enregistrés et autorisés par la politique du token. Le modèle local choisit un outil, puis produit les arguments selon son schéma réel ; le serveur valide les arguments et impose l'environnement de la fiche. Les outils de contrôle de session sont exclus de cette boucle pour éviter la récursion.

Le MCP conserve les échanges, résultats et contexte de la fiche pendant 30 minutes, avec isolement par propriétaire, environnement et URL. Les résultats transmis au modèle sont bornés et nettoyés. Les citations sont contrôlées par identifiant ; ce contrôle ne garantit pas la justesse sémantique d'une réponse du modèle.

Les lectures peuvent s'enchaîner. Les écritures disponibles (`create_dashboard`, `update_dashboard`, `create_slo`) produisent uniquement un aperçu complet, validé avant exposition. `prepare_problem_dashboard` construit une proposition Classic à partir des métriques et entités connues. La confirmation est un appel distinct, avec identifiant à usage unique et expiration. Un dashboard modifié depuis l'aperçu bloque sa mise à jour. Une erreur après confirmation est signalée comme résultat incertain, sans reprise automatique.

Daybreak transporte ces appels et conserve la même fiche ; l'extension affiche les échanges, preuves et aperçu. Aucun proxy HTTP permettant d'appeler arbitrairement un outil n'a été ajouté. L'inférence reste sur Ollama en loopback, sans téléchargement automatique par le MCP.

## Qualification locale

Le Mac de développement dispose d'un Intel i5 et de 8 Go de RAM. Qwen3 1.7B a préparé un dashboard sur données fictives sans écriture, mais les choix et citations restent irréguliers et certains appels dépassent 45 secondes. Qwen3 4B Q4_K_M a été téléchargé avec autorisation pour comparaison ; ses trois premiers essais dépassent le délai de 45 secondes. Il n'est pas sélectionné par défaut tant que sa qualité et ses délais ne sont pas qualifiés.

L'essai 4B avec délai élargi a sélectionné `get_environments_info`, puis répété ce choix ; il a été arrêté sans réponse complète. Le modèle chargé occupait 3,3 Go de mémoire avec `size_vram: 0`. Il reste installé mais a été déchargé, sans changement du modèle par défaut. L'argumentation des outils dont le seul paramètre est l'environnement est maintenant fournie directement par le serveur pour éviter une inférence inutile.

La couverture par tests avec modèle simulé valide les contrats et protections, pas la capacité générale du modèle. Aucune écriture Dynatrace réelle n'a été réalisée pour ces essais.

Dernier essai 1.7B sur données fictives : réponse UUID en 52,5 s (outil sans paramètres rejeté avant le correctif), liste dashboards en 50,9 s avec une seule lecture effective malgré un choix répété, préparation dashboard en 48,2 s avec un aperçu validé et zéro écriture. Le correctif sans paramètres est couvert par test simulé ; ce scénario Ollama n’a pas été rejoué après correction. Validation finale : 385 tests MCP réussis, 47 ignorés ; 135 tests passerelle et 7 tests extension réussis. Passerelle redémarrée après le dernier build, contrôles découverts.

## Revue et corrections

Qualification finale : découverte réelle des contrôles conversation/préparation/confirmation via Daybreak et lecture de la liste des problèmes réussies (aucun problème ouvert). Ajout d’un test du choix d’entité associé à une métrique Service malgré un contexte Host/Disk. L’essai Ollama a révélé un argument injecté à tort pour les outils sans paramètres : corrigé avec test de régression. L’assertion d’intégration sur l’absence de prompts a été mise à jour pour vérifier le prompt de continuation existant. Aucun appel d’écriture Dynatrace réel.

Revue effectuée suivant `review-agent`, sans délégation. Les défauts identifiés ont ensuite été corrigés dans une phase distincte : aperçu auparavant tronqué, réutilisation de lectures anciennes, résultat d'écriture absent du contexte suivant, répétition d'un outil avec des arguments différents bloquée, et ancien aperçu conservé pendant une nouvelle question. Les tests de régression couvrent ces scénarios. Les références des nouveaux résultats sont maintenant courtes et séquentielles pour limiter les erreurs de citation.
