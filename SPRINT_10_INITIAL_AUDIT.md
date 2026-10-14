# Sprint 10 — Audit initial (avant modification du code)

14 octobre 2026. Audit local uniquement. Aucun endpoint professionnel appelé.

| Dépôt | Branche | HEAD initial | État |
|---|---|---|---|
| MCP | codex/sprint-02-service-slowdown | 2768c7ae088477e3b0e3792554d69456a9fd006c | Dix fichiers préexistants non suivis conservés |
| Daybreak | codex/history-timeline | 8db37b0cd6c4717b88818ce3f408486c30193b6e | Propre |
| Chrome | codex/history-timeline | 048433ef67ae6893b2e8e294612ac40f3692e263 | Propre |

Sprint 08 vérifié : edff85bc4fcf2bb7f98175f13fdbcd5e7d50a7f1 ; Sprint 09 : HEAD MCP ci-dessus, confirmé par Git et son contenu. Rapports Sprint 08 et 09 lus intégralement, ADR 0001–0004, API publique, spécification Explain, README, scripts de validation et tests examinés. Les documents historiques décrivent parfois une architecture dépassée (conversation, dépendance au snapshot) : créer une référence actuelle et marquer les anciens documents historiques.

Origine configurée upstream MCP : https://github.com/dynatrace-oss/dynatrace-managed-mcp.git. Aucune ref upstream/* disponible ; origin/main partage la base 1365019bd6e195451b650a106a476a92da609fd5. Cette base est une référence locale du fork, pas une attestation du dernier upstream. Aucun fetch/merge prévu.

État actif observé hors HTTP : Gateway PID 98536, MCP PID 98541, démarrés à 18:41:30/31 ; écoute loopback 4318 vérifiée via lsof. Référence privée /tmp/daybreak-sprint10-baseline.json : 197 SHA-256 (196 historiques + .gate-config.json), 30 jobs dont 22 investigations. Le validateur historique vérifie ses 196 fichiers séparément. La première tentative a rejeté la différence de périmètre 197/196 avant compilation ; le manifeste complet reste conservé.

## Constats et proposition

- Gateway : 17 modules à plat, serveur 829 lignes, Workbench 1403 ; démarrage serveur avec I/O et discovery à l'import. Garder ce seul point d'entrée explicite, déplacer les services importables sous backend par responsabilité.
- Frontend déjà isolé sous public/workspace : conserver son chargement natif et ses URL ; ne pas imposer un framework ni déplacer les assets servis par le processus actif. Les modules gates/operations sont aussi servis au navigateur historique : garder leurs chemins.
- Extraire les exports Markdown/HTML du Workbench et la table des assets du serveur ; centraliser les écritures JSON atomiques et sérialisées. Auditer les lectures corrompues actuellement silencieuses avant correction.
- Extension : racine extension/ plate, core.js mélange transport HTTP et contexte Chrome. Séparer api, browser, sidepanel, présentation partagée et historique ; conserver extension/ comme racine chargeable MV3, pas de bundler.
- Source canonique des deux modules de présentation : extension. Adapter le script de synchronisation et les tests octet par octet ; copies Web autonomes au runtime.
- Core : façade indépendante, sessions mémoire bornées 100/30 min dans collecteur historique. Pas de déplacement upstream. Injection de stockage à évaluer sans imposer une modification transversale des anciennes conversations.
- Persistances : un seul écrivain/processus attendu. Le chargement silencieux d'un fichier invalide peut masquer la perte d'historique ; tests de corruption et de concurrence nécessaires.
- Sécurité : loopback mono-utilisateur, CSRF/CORS et profil incident existants ; aucune identité multi-utilisateur. Le MVP technique doit être explicitement borné à ce mode.

Référence de tests en cours par scripts/validate-sprint09.mjs : compilation temporaire, client autonome, Jest incluant MCP loopback et suites Gateway/extension. Aucune configuration réelle chargée par les fixtures. Les tests live et la recette Chrome native restent exclus.
