# Sprint 08 — Matrice diagnostique

Tous les scénarios sont synthétiques ; aucune injection ou collecte Managed. Résultats du véritable Core via ports simulés.

| ID                         | Scénario                            | Résultat attendu                                                    | Résultat observé                                                        | PASS/FAIL final | Limite                                              |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------- | --------------------------------------------------- |
| S01                        | Dégradation claire                  | Latence 100 → 300 ms, trois comparaisons, traces, mécanisme inconnu | completed ; trois paires, vérification traces                           | PASS            | Baseline synthétique saine uniquement               |
| S02                        | Dépendance dégradée                 | Piste avec relation et deux paires, aucune causalité                | Piste hypothesis et vérification spans référencées                      | PASS            | Topologie actuelle, flux historique inconnu         |
| S03                        | Hausse des erreurs                  | Erreurs 1 → 5 %, latence stable, volume 60 → 60                     | Trois paires ; piste erreurs sans hausse de volume                      | PASS            | SERVICE_SLOWDOWN car problème PERFORMANCE           |
| S04                        | Baseline absente                    | partial, pas de comparaison ni baseline fabriquée                   | partial ; preuves incident conservées ; compléter comparaison           | PASS            | Aucune variation qualifiée                          |
| S05                        | Signaux contradictoires             | Conserver latence, exclure erreurs de dimension différente          | partial ; latence comparable ; erreurs exclues ; aucune piste fusionnée | PASS            | Une forme de contradiction couverte                 |
| S06                        | Déploiement proche                  | Indice temporel, hypothèse et vérification, aucune cause            | Événement observé, piste de changement hypothesis                       | PASS            | Contenu/version/causalité inconnus                  |
| S07                        | Baseline saine                      | Trois paires stables, aucune anomalie/piste inventée                | Comparaisons égales ; hypotheses et checks vides                        | PASS            | Absence d’écart dans le seul périmètre mesuré       |
| S08                        | Erreur API au milieu                | partial, erreur explicite et latence acquise conservée              | partial ; erreurs assainies ; paire latence conservée                   | PASS            | Rejet de port simulant HTTP 503                     |
| S09                        | Résolution incompatible             | Aucune comparaison trompeuse, partial et compléter données          | partial ; zéro comparaison ; vérification temporelle                    | PASS            | Résolution retournée 1m au lieu de 5m               |
| S10                        | Preuve insuffisante                 | Symptômes mesurés, mécanisme unknown et traces pertinentes          | Trois paires, aucune hypothèse causale, traces manuelles                | PASS            | Pas de preuve discriminante ; mêmes signaux que S01 |
| S01-unit-boundary          | Hausse 900 ms → 1,8 s               | Conserver vérification traces                                       | PASS après D08-01 ; FAIL avant                                          | PASS            | Règle descriptive, pas statistique                  |
| S02-unit-boundary          | Dépendance au changement d’échelle  | Conserver piste de dépendance                                       | PASS après D08-01 ; FAIL avant                                          | PASS            | Mécanisme reste inconnu                             |
| S06-unit-boundary          | Déploiement au changement d’échelle | Conserver piste temporelle                                          | PASS après D08-01 ; FAIL avant                                          | PASS            | Corrélation uniquement                              |
| S08-timeout                | Timeout après paire latence         | partial, conserver preuves et arrêter lectures suivantes            | Erreur timeout ; dernier lancement = queryMetrics d’erreurs             | PASS            | Port sans AbortSignal                               |
| S08-malformed              | Réponse métrique malformée          | partial et limite de série absente/ambiguë                          | Latence conservée ; limitation de normalisation explicite               | PASS            | Transport réussi, pas une erreur HTTP               |
| S08-budget                 | Plafond sept lectures               | partial, au plus sept lancements, preuves conservées                | Budget tracé ; latence conservée ; compteur tous ports borné            | PASS            | Budget réduit volontairement                        |
| S09-missing-bucket         | Bucket absent                       | Aucune paire qualifiée avec couverture incomplète                   | partial ; zéro comparaison                                              | PASS            | Cinq points sur six                                 |
| S09-foreign-entity         | Mauvaise entité incidente           | Ne pas substituer une série étrangère                               | partial ; zéro comparaison                                              | PASS            | Baseline correcte seule insuffisante                |
| S03-error                  | Sévérité ERROR                      | Erreurs reconnues, latence stable, aucun nouveau playbook           | Deux paires ; aucun playbook SERVICE_SLOWDOWN                           | PASS            | Volume non collecté par ce chemin                   |
| S03-error-invalid-contract | Descripteur incompatible            | partial, aucune query erreurs ni comparaison                        | PASS après D08-02 ; FAIL avant (completed)                              | PASS            | Byte/sum/HOST simultanément incompatibles           |
| S03-error-invalid-values   | Taux d’erreur 150 %                 | partial, série conservée mais non comparable                        | PASS après D08-03 ; FAIL avant (completed)                              | PASS            | Valeur invalide conservée comme donnée partielle    |
| S07-unit-boundary-decrease | Baisse 1,8 s → 900 ms               | Aucune fausse hausse/piste                                          | hypotheses et checks vides                                              | PASS            | Protection du cas inverse de D08-01                 |
| Replay                     | Relance à horloge fixe              | Même Explain, findings, evidence et statut                          | S01/S03-error/S06/S09 identiques                                        | PASS            | UUID de session volontairement exclu                |

## Vérifications transversales

Chaque scénario vérifie les schémas Evidence/Investigation 1.0, Explain v1, références existantes et uniques, sources GET, entités/fenêtres, calculs indépendants sur points, aucune cause affirmée, LLM disabled et checks conditional read-only. Toutes les lectures réelles aux ports sont comptées sous le plafond applicable. Suppression d’une référence nécessaire : contrôle contractuel rejette le rapport. Les comparaisons absentes ne sont pas remplacées par des chiffres inventés.

## Suites finales

| Suite                                    | Réussis | Échoués | Ignorés |
| ---------------------------------------- | ------: | ------: | ------: |
| Engine Jest complet                      |     563 |       0 |      47 |
| Dont corpus (inclus, ne pas additionner) |      23 |       0 |       0 |
| Gateway                                  |     175 |       0 |       0 |
| Extension                                |      24 |       0 |       0 |

TypeScript PASS en build isolé ; 9 tests MCP/proxy locaux inclus dans les 563. Trois suites externes ignorées (26+18+3 tests) ; aucun incident réel riche ni Chrome natif exécuté. Suites p95, Key Requests, DATABASE, HOST, budgets, volumes et replay historique existantes PASS.

Relance : `npm run test:diagnostic`. Validation complète isolée : `node scripts/validate-sprint08.mjs`. Voir SPRINT_08_REPORT.md pour le runtime et les limites.
