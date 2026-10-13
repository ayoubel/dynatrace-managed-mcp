# Managed Explain — contract and investigation plans

Version 1, 12 October 2026. Executed by the MCP, without a model. The extension only renders returned data; it never infers a cause or executes a remediation.

## Tool

`dynatrace_managed_explain_problem(environment_alias, problemId, investigationId?)`, read-only, problems.read required; optional metrics/entities/events/logs/settings permissions checked by each subread. One problem, environment and owner. An existing investigationId must match problemId and owner/environment. Refresh retains the same session; expiry/restart requires a new investigation. No keyword parsing or LLM in this tool.

The existing version-1 investigation envelope is retained. An additive `explain` field contains:

- `whatHappened`: published title, severity, status and timeline.
- `impact`: separate affected and impacted entity IDs, per-entity user estimates, unknowns. No addition of overlapping estimates.
- `whyItHappened`: Davis-published entity, unknown causal mechanism, referenced observations, explicit unknowns. No automatically invented hypotheses.
- `remediation`: immediate checks, conditional short-term fixes, conditional prevention. `execution=proposal-only`; no approved customer runbook configured yet.
- `collection`: observation time, collection window and per-read status. Tools publish partial/unavailable evidence explicitly.

Items carry title, text, certainty and evidenceRefs. Conditions are mandatory for remediation proposals. A linked action performs only an existing scoped read. UI sections and Markdown export preserve this structure.

## Plans

- Disk: reuse exact Disk/Host selector validation, metadata/unit checks, threshold rule validation, recent points, incident points, preceding equal-duration baseline, available space and bounded logs. Incident windows are bounded to two hours. Comparing maxima requires matching units and >=2 points in each untruncated/no-gap series; no saturation/cause inferred from the difference.
- Service ERROR/PERFORMANCE: prioritize the published root entity, read exact entity context/events, then at most two metric comparisons across the entire report. Candidates are Classic server error rate and response time, selected according to severity. Metadata ID and unit required; avg aggregation explicit; same exact SERVICE dimension, incident and equal-duration preceding window, >=2 points without gaps/truncation before a descriptive comparison is published. Returned points outside requested windows cannot support comparison.
- Other problems: generic published evidence, impact and bounded entity context; no specialized cause or immediate fix asserted.

Existing collection budget: 18 subread launches and 80-second launch budget, sequential pacing; an in-flight request may exceed this duration. Historical data retention, missing permissions and ambiguous dimensions can make comparisons unavailable. No distributed trace or topology causal inference added.

## Client UX

Automatic active-tab URL recognition, configured-environment matching and optional read-only problem-title preview. No full URL/session parameter persisted. A click is required to run Explain. Problem/Host/Service labels contextual; report refresh stays on the same job/session; older reports remain in History. Explain, Evidence, History tabs; technical IDs expandable. Compact icon actions with accessible labels/tooltips; environment chooser behind a chip. Prompt grayed out when the local LLM is disabled; guided MCP checks remain available.

Progress percentage represents three gateway stages (connection, MCP analysis, report preparation), not a claimed percentage of internal API subreads. Detailed subread statuses are available after the MCP returns. Native Chrome side-panel behavior remains a separate manual validation.

## References used as development data

- reference/dynatrace-managed/UPSTREAM_SKILL.md: Managed scope and selectors.
- reference/dtmgd/UPSTREAM_SKILL.md: Classic metric IDs and query considerations.
- reference/dt-obs-problems/UPSTREAM_SKILL.md: report/investigation structure; DQL/Grail content not executed.

No reference skill installed, upstream code executed, model downloaded or external inference called. These documents inform executable rules and tests, not runtime reasoning.

## Restitution compacte et Fix descriptif — 12 octobre 2026

Trois sections : Ce qui s’est passé (impact intégré), Pourquoi c’est arrivé, Que faire maintenant. Contrat v1 enrichi de façon additive : noms des entités avec références, durée, comparaisons structurées avec fenêtres adjacentes de même durée et unités lisibles. La cause publiée reste distincte du mécanisme inconnu ; seules les hypothèses effectivement retournées par le moteur apparaissent.

La politique versionnée `explain-remediation.ts` propose des vérifications en lecture, des corrections conditionnelles et une prévention pour disque et erreurs/latence service. Les corrections contiennent des étapes et une validation après intervention. Elles n’ont aucun outil d’exécution ni bouton d’application. Il ne s’agit pas d’un runbook client approuvé ou d’une preuve que le correctif convient à un incident précis. Les autres catégories conservent une prévention générique ; pas de correction spécifique inventée.

L’extension affiche les estimations utilisateurs par entité sans addition, les mesures qualifiées et les preuves repliables. Les rapports historiques ouvrent leurs propres preuves. Export Markdown avec conditions, étapes et contrôles après intervention. Logs : lecture proposée seulement si un Host explicite est disponible ; pas de recherche globale pour un Service sans Host.

Validation locale : build, 399 tests MCP, 140 passerelle, 9 extension. Une fixture Host instable a été corrigée pour dater son point dans la fenêtre demandée. Panneau service vérifié à 380 px sur données fictives ; Chrome natif et parité SaaS non revendiqués. Aucune nouvelle collecte d’endpoint ou de destination distante ; aucune écriture Dynatrace, aucun LLM.
