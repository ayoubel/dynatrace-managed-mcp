import { demoCases, demoPorts } from '../../../examples/explain-demo-fixtures';
import { executeInvestigation, validateInvestigationReport } from '../investigation-engine';
test.each(demoCases)(
  '%s demo runs the actual engine with referenced evidence and no fabricated mechanism',
  async (id) => {
    const { deps } = demoPorts(id);
    const result = await executeInvestigation(
      deps,
      { environment_alias: 'prod', problemId: id },
      { paceMs: 0, limits: deps.investigationLimits },
    );
    expect(result.status).not.toBe('error');
    if (result.status === 'error') throw Error(result.error.code);
    const report: any = validateInvestigationReport(result.report),
      why = report.explain.whyItHappened;
    expect(report.llm.status).toBe('disabled');
    expect(why.mechanism.certainty).toBe('unknown');
    if (id === 'RICH') {
      expect(why.conclusion.certainty).toBe('published');
      expect(why.conclusion.evidenceRefs.length).toBeGreaterThan(0);
      expect(report.diagnosis.rootCauseEvidence).toHaveLength(1);
      expect(why.comparisons.length).toBeGreaterThan(0);
    } else expect(why.conclusion.certainty).toBe('unknown');
    if (id === 'AMBIGUOUS') expect(why.hypotheses.length).toBeGreaterThanOrEqual(2);
    if (['POOR', 'STALE'].includes(id)) {
      expect(report.status).toBe('partial');
      expect(why.comparisons).toHaveLength(0);
      expect(why.hypotheses).toHaveLength(0);
    }
    if (id === 'CONTRADICTORY') {
      expect(report.status).toBe('partial');
      expect(why.comparisons.some((v: any) => v.metricId.includes('errors'))).toBe(false);
    }
    expect(JSON.stringify(report)).not.toContain('private upstream detail');
  },
);
