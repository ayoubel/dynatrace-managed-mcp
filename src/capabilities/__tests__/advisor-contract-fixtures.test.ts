import {buildLifecycleReport,lifecycleReferences} from '../lifecycle.cjs';
import inputs from '../../../test-fixtures/advisor-contract-inputs.json';
import expected from '../../../test-fixtures/advisor-v3.json';
test.each(Object.keys(inputs))('canonical synthetic Advisor contract remains stable: %s',id=>{
 const a=(inputs as any)[id];
 expect({...buildLifecycleReport(a.entities,a.inventories,a.options),version:3,engine:'dynatrace-managed-mcp',provenance:'synthetic_contract_fixture',referenceVerifiedAt:lifecycleReferences[0].verifiedAt,limitations:[]}).toEqual((expected as any)[id]);
});
