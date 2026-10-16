// Explicit contract-artifact generation only; no network, repository discovery or engine duplication.
const fs=require('node:fs');const path=require('node:path');const {buildLifecycleReport,lifecycleReferences}=require('../src/capabilities/lifecycle.cjs');
const inputs=require('../test-fixtures/advisor-contract-inputs.json');const reports=Object.fromEntries(Object.entries(inputs).map(([key,a])=>[key,{...buildLifecycleReport(a.entities,a.inventories,a.options),version:3,engine:'dynatrace-managed-mcp',provenance:'synthetic_contract_fixture',referenceVerifiedAt:lifecycleReferences[0].verifiedAt,limitations:[]}]));
const output=JSON.stringify(reports,null,2)+'\n';
if(process.argv[2]==='--check'){if(fs.readFileSync(process.argv[3],'utf8')!==output)throw Error('Advisor contract snapshots differ');console.log('Advisor contract snapshots match canonical MCP');}
else if(process.argv[2])fs.writeFileSync(path.resolve(process.argv[2]),output,{flag:'wx'});else process.stdout.write(output);
