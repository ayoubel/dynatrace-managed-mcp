import type { InvestigationOutcome } from '../src/core/investigation-engine';
import { corpus, scenarioPorts } from '../src/core/__tests__/fixtures/diagnostic-ports';
/** This client knows only public contracts and connector fixtures. */
export async function runReference(id: string) {
  const scenario = corpus.scenarios.find((s) => s.id === id);
  if (!scenario) throw Error('Unknown synthetic corpus scenario: ' + id);
  const { executeInvestigation, validateInvestigationReport } =
    require('../src/core/investigation-engine') as typeof import('../src/core/investigation-engine');
  const { deps, problem, reads } = scenarioPorts(scenario);
  const outcome: InvestigationOutcome = await executeInvestigation(
    deps,
    { environment_alias: 'prod', problemId: problem.problemId },
    { paceMs: 0, limits: deps.investigationLimits },
  );
  if (outcome.status === 'error') throw Error(outcome.error.code);
  const report = validateInvestigationReport(outcome.report);
  if (report.explain.whyItHappened.mechanism.certainty !== 'unknown') throw Error('Unproven mechanism');
  const ceiling = deps.investigationLimits?.maxApiCalls ?? (scenario.severity === 'ERROR' ? 18 : 48);
  if (reads.length > ceiling) throw Error('Collection budget exceeded');
  return {
    scenario: id,
    problemId: problem.problemId,
    status: outcome.status,
    evidence: report.evidence.length,
    referencesValid: true,
    reads: reads.length,
    llm: report.llm.status,
    mechanism: report.explain.whyItHappened.mechanism.certainty,
    comparisons: report.explain.whyItHappened.comparisons.map((c) => ({
      metricId: c.metricId,
      entityId: c.entityId,
      baseline: c.baseline.value,
      incident: c.incident.value,
      unit: c.incident.unit,
    })),
    hypotheses: report.explain.whyItHappened.hypotheses.map((h) => h.title),
    report,
  };
}
if (require.main === module) {
  // Fail the demonstration if a transitive import attempts to load a transport or a model.
  const Module = require('node:module');
  const originalLoad = Module._load;
  Module._load = function (request: string, ...rest: unknown[]) {
    if (
      /^(node:)?(http|https|net|tls|fs|child_process|worker_threads)$|modelcontextprotocol|axios|authentication|adapters|tools[\/]|local-investigation-model|telemetry|logger|config-loader|sre-morning-check|browser-extension/.test(
        request,
      )
    )
      throw Error('Forbidden independent-client dependency: ' + request);
    return originalLoad.call(this, request, ...rest);
  };
  globalThis.fetch = async () => {
    throw Error('No network in reference client');
  };
  process.env.DT_MCP_OLLAMA_ENABLED = 'true'; // Adversarial flag in this isolated fixture process only.
  const timer = globalThis.setTimeout;
  globalThis.setTimeout = (() => {
    throw Error('Timer started while importing Core');
  }) as unknown as typeof setTimeout;
  try {
    require('../src/core/investigation-engine');
  } finally {
    globalThis.setTimeout = timer;
  }
  const ids = process.argv.includes('--all') ? corpus.scenarios.map((s) => s.id) : [process.argv[2] || 'S01'];
  (async () => {
    const summaries = [];
    for (const id of ids) {
      const { report, ...summary } = await runReference(id);
      summaries.push(summary);
      if (!process.argv.includes('--json'))
        console.log(
          id +
            ': ' +
            summary.status +
            ' · ' +
            summary.evidence +
            ' preuves · ' +
            summary.reads +
            ' lectures · mécanisme ' +
            summary.mechanism +
            ' · LLM ' +
            summary.llm +
            '\n' +
            summary.comparisons
              .map((c) => c.metricId + ': ' + c.baseline + ' → ' + c.incident + ' ' + c.unit)
              .join('\n'),
        );
    }
    if (process.argv.includes('--json')) console.log(JSON.stringify(summaries));
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
