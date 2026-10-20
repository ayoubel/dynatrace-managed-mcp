import { buildLifecycleReport, lifecycleReferences } from '../lifecycle.cjs';
import inputs from '../../../test-fixtures/advisor-contract-inputs.json';
import expected from '../../../test-fixtures/advisor-v3.json';
test.each(Object.keys(inputs))('canonical synthetic Advisor contract remains stable: %s', (id) => {
  const a = (inputs as any)[id];
  const actual = buildLifecycleReport(a.entities, a.inventories, a.options);
  const { catalogue, ...referenceSnapshot } = actual.referenceSnapshot;
  expect(catalogue).toMatchObject({ schemaVersion: '1.0', version: '1.0.0' });
  expect(catalogue.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect({
    ...actual,
    referenceSnapshot,
    version: 3,
    engine: 'dynatrace-managed-mcp',
    provenance: 'synthetic_contract_fixture',
    referenceVerifiedAt: lifecycleReferences[0].verifiedAt,
    limitations: [],
  }).toEqual((expected as any)[id]);
});
