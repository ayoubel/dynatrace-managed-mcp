# API publique Investigation Engine — Sprint 09

Point d'entrée supporté dans ce dépôt : `src/core/investigation-engine/index.ts`. Compilation CommonJS : `<build>/core/investigation-engine/index.js`. Module réutilisable, pas un package npm autonome publié ; aucune modification des exports npm historiques. Node 26.5.1 et dépendances locales existantes. Dynatrace Managed uniquement.

## Appel direct

```ts
import { executeInvestigation, type InvestigationDependencies } from '../src/core/investigation-engine';

const ports: InvestigationDependencies = /* connecteurs de lecture du consommateur */ portsImpl;
const outcome = await executeInvestigation(
  ports,
  {
    environment_alias: 'prod',
    problemId: 'internal-managed-problem-id',
  },
  { paceMs: 0, limits: { maxApiCalls: 18, timeoutMs: 12000, maxDurationMs: 80000 } },
);
if (outcome.status === 'error') {
  console.error(outcome.error.code, outcome.error.message);
} else {
  console.log(outcome.status, outcome.report.explain, outcome.report.investigation.evidence);
}
```

Un alias unique et une URL Managed sont fournis au port ; pas de session MCP, serveur, Gateway, credential chargée automatiquement ou navigateur. Les ports ne sont pas créés par le Core. Le consommateur assure leur autorisation et leur comportement de lecture ; aucun token n'est requis dans leur interface. Les scopes observés optionnels bornent davantage les lectures. Les réponses restent les formes Classic Managed en Map par alias, normalisées ensuite par le même moteur.

## Contrat d'appel et de résultat

- Request : ExplainRequest existant, strict, alias et problemId obligatoires, investigationId UUID optionnel. Identifiant interne du problème, pas identifiant de job Gateway ni seulement un displayId.
- Ports typés : Problems, Entities, Events, Metrics, Logs et lecture générique existante makeRequests. validAliases/getBaseUrl fournissent le contexte. Les types de paramètres des connecteurs sont des imports type-only, effacés en JavaScript ; les payloads amont restent Record<string, any> pendant cette phase.
- Options : paceMs (défaut 1100, intervalle 0–5000), limits remplaçant entièrement investigationLimits si fournies. Les champs absents utilisent les défauts du moteur ; aucune mutation des ports du consommateur.
- completed/partial : même enveloppe legacy version 1, Explain v1, snapshot Evidence/Investigation 1.0. Chaque succès inclut report ; partial conserve les preuves acquises. completed qualifie la complétude bornée, pas la vérité d'une cause.
- error : aucun rapport fabriqué. invalid_input pour request/limites/pacing invalides ; execution_failed pour environnement/session/problème indisponible ou échec fatal ; invalid_output pour sortie Explain/snapshot incohérente. Messages fixes, aucune exception brute. Les erreurs de collecte non fatales restent dans le rapport partial existant.
- Le validateur exporté vérifie les cinq sections Explain, versions, snapshot, statuts/identifiants/environnement, concordance des provenances et références récursives. Il renvoie l'objet original, conserve les champs legacy et ne projette pas les données. Les extensions legacy non normalisées restent typées any pour compatibilité.

explainProblem(dependencies, request, paceMs?) reste disponible avec sa signature historique et ses erreurs par rejet de Promise. L'adaptateur MCP emploie cette fonction depuis le point public ; il n'introduit pas l'enveloppe outcome dans la réponse MCP. executeInvestigation constitue le résultat discriminé pour les nouveaux consommateurs et force le profil incident-intelligence. Les deux emploient exactement le même collecteur, SERVICE_SLOWDOWN et construction Explain, toujours model:null.

## Limites opérationnelles réutilisées

| Limite                                  |                                  Défaut |                             Maximum |
| --------------------------------------- | --------------------------------------: | ----------------------------------: |
| Lectures API                            | 48 SERVICE_SLOWDOWN ; 18 autres chemins | 60 ; plafond 18 hors enrichissement |
| Candidates / dépendances / key requests |                               4 / 2 / 2 |                           8 / 4 / 4 |
| Timeout par lecture                     |                                12000 ms |                            30000 ms |
| Durée de collecte                       |                                80000 ms |                           120000 ms |
| Volume par réponse / total              |               3000000 / 10000000 octets |                  5000000 / 20000000 |

Entiers strictement positifs requis, profondeur exactement un. Pas de retry automatique. Le deadline arrête les lancements suivants et borne l'attente ; aucun AbortSignal n'est transmis à ces ports. Le réseau amont peut donc continuer après timeout. Les plafonds de volume sont vérifiés après décodage. Le plafond de deux métriques et absence de volume du chemin ERROR restent documentés dans Sprint 08.

## Sessions indépendantes du transport

Les UUID et l'historique borné appartiennent au collecteur historique, dans une Map de processus (100 sessions, TTL 30 minutes), pas à une session MCP. Chaque appel initial sans investigationId collecte un nouveau snapshot. Une continuation doit respecter owner, alias, URL et problemId ; redémarrage/expiration perdent cette mémoire. Le nom par défaut stdio d'owner est historique, sans besoin de transport stdio. Un consommateur partagé doit injecter un owner explicite ; aucune authentification utilisateur n'est implémentée par le Core. Stockage injectable/durable et API stateless dédiée sont reportés.

## Preuve autonome

Voir [client de référence](../examples/REFERENCE_CLIENT.md). Aucun build actif remplacé. Le wrapper compile dans un dossier temporaire privé ; le programme TypeScript importe les contrats publics et les fixtures du corpus, simule uniquement les ports, puis exécute le véritable moteur. HTTP/TCP/SDK/configuration/modèle sont interdits dans son processus. Aucun diagnostic de référence préconstruit ni nouveau moteur.
