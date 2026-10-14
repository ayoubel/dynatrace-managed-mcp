# Sprint 05 — Matrice de tests

Fixtures synthétiques déterministes, sans création de problèmes Managed. Les statuts qualifient la complétude de collecte, jamais la certitude causale.

| Scénario | Statut | Lectures réussies | Comparaisons | Pistes | Vérifications | Résultat |
|---|---|---:|---:|---:|---:|---|
| Service ralenti, dépendance stable | completed | 18 | 5 | 0 | 2 | PASS |
| Service et dépendance ralentis | completed | 23 | 7 | 1 | 2 | PASS |
| Plusieurs dépendances, signaux différents | partial | 34 | 11 | 2 | 3 | PASS |
| Dépendance sans métriques | partial | 18 | 4 | 0 | 3 | PASS |
| Déploiement avant fenêtre | completed | 15 | 4 | 1 | 2 | PASS |
| Événement après fenêtre | completed | 15 | 4 | 0 | 2 | PASS |
| Erreurs augmentées sans hausse du trafic | completed | 15 | 4 | 1 | 2 | PASS |
| Trafic augmenté sans dégradation | completed | 15 | 4 | 0 | 0 | PASS |
| Key request dégradée, relation confirmée | completed | 24 | 7 | 1 | 2 | PASS |
| Dépendance DATABASE ralentie | completed | 23 | 7 | 1 | 2 | PASS |
| CPU/mémoire, hôte explicitement lié | completed | 21 | 6 | 1 | 2 | PASS |
| Absence de traces | completed | 15 | 4 | 0 | 2 | PASS |
| Baseline manquante | partial | 15 | 0 | 0 | 1 | PASS |
| Séries ambiguës | partial | 15 | 2 | 0 | 1 | PASS |
| Permissions insuffisantes | partial | 3 | 0 | 0 | 1 | PASS |
| Budget API épuisé | partial | 12 | 3 | 0 | 3 | PASS |
| Événement déclaré synthétique | completed | 15 | 4 | 0 | 2 | PASS |
| Problème sans mesures exploitables | partial | 7 | 0 | 0 | 1 | PASS |
| Événement aux dates contradictoires | partial | 15 | 4 | 0 | 2 | PASS |
| p95 réel par créneau, séparé de avg | completed | 15 | 4 | 0 | 2 | PASS |

Chaque scénario vérifie schéma InvestigationSnapshotV1, Evidence 1.0, Explain v1, références résolues et uniques, sources GET, unités/fenêtres exactes des séries, mécanisme inconnu, absence de remédiations intrusives et vérification associée à chaque piste. Les fixtures vérifient également leurs comportements spécifiques : stabilité, sélection publiée puis hausse puis ID, propriété DB, relations de key requests/hôtes, p95 distinct de avg, événement postérieur sans piste de changement.

Tests complémentaires :

- Rejet des limites invalides avant toute lecture.
- Timeout : résultats primaires préservés, aucune nouvelle requête après expiration.
- Volume : réponse trop volumineuse rejetée et collecte interrompue.
- Relation de key request étrangère : aucune inférence par nom ou par seul sélecteur.
- Déterminisme : entrées topologiques mélangées, mêmes sélections, mêmes requêtes, même Explain à horloge fixe.

Traces partielles : non applicable, aucun collecteur de traces opérationnel inventé.

**531/531 tests unitaires Engine**, 38 suites ; compilation TypeScript isolée réussie. **4/4 tests d’intégration MCP locaux**, 2 suites (rotation de tokens fictifs et passthrough), avec le build isolé et API loopback temporaire. Les suites d’intégration historiques nécessitant un environnement externe supplémentaire ne font pas partie de cette validation.

Non-régression : les suites CPU, disque, autres Explain, contrats, provenance et continuation existantes sont incluses dans les 531 tests. Gateway/Chrome et leurs contrats publics ne sont pas modifiés ; aucun test Chrome natif revendiqué.

Validation Managed : 55 GET de validation, tous HTTP 200. Acceptation finale du problème réel : 15 GET, partial, 9 preuves, 2 observations, 0 piste, 1 prochaine vérification ; snapshot valide. Les key requests dégradées et les DB sont validées par fixtures, pas par un incident réel riche.
