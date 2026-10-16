// Relocated unchanged assertions: lifecycle rules belong to MCP, never the Gateway.
import assert from 'node:assert/strict';
import {buildLifecycleReport,softwareInventory,lifecycleAssessment,classifyLifecycle,auditInventory} from '../lifecycle.cjs';
const now = Date.parse("2026-10-08T12:00:00Z");
const inventory = [
  {
    type: "HOST",
    environmentId: "a",
    environmentName: "Managed A",
    inspected: 1,
    total: 1,
    available: true,
    complete: true,
  },
];
const host = (id: string, version: string, env = "a"): any => ({
  entityId: id,
  environmentId: env,
  environmentName: env,
  type: "HOST",
  displayName: id,
  traceId: "T2",
  collectedAt: new Date(now).toISOString(),
  details: {
    lastSeenTms: now,
    properties: { osVersion: "Ubuntu " + version, installerVersion: "1.345" },
  },
});
const report = (entities: any[], options: any = {}, inv = inventory) =>
  buildLifecycleReport(entities, inv, { now, ...options });


const at=Date.parse('2026-10-07T12:00:00Z');
const entity={entityId:'HOST-ABC123',type:'HOST',displayName:'Node A',environmentId:'env',details:{properties:{osVersion:'Ubuntu 22.04.5 LTS',installerVersion:'1.345'}}};
test("Compliance: active support counts near-EOL as conforming; unknown and monitoring do not inflate the score", () => {
  const r = report([
    host("HOST-A", "22.04"),
    host("HOST-B", "20.04"),
    host("HOST-C", "99.04"),
  ]);
  assert.equal(r.assessment.score, 50);
  assert.equal(r.assessment.coverage, 67);
  assert.equal(r.assessment.total, 3);
  assert.ok(r.rows.every((row: any) => row.product !== "OneAgent"));
  const near = report(
    [
      {
        entityId: "PROCESS_GROUP_INSTANCE-A",
        type: "PROCESS_GROUP_INSTANCE",
        environmentId: "a",
        details: {
          lastSeenTms: now,
          properties: {
            softwareTechnologies: [{ type: "NODE_JS", version: "v22.2.0" }],
          },
        },
      },
    ],
    { anticipationDays: 365 },
  );
  assert.equal(near.rows[0].status, "watch");
  assert.equal(near.assessment.score, 100);
});
test("Compliance: missing, stale or future observations remain unknown", () => {
  for (const time of [undefined, now - 25 * 3600000, now + 3600000]) {
    const h = host("HOST-A", "22.04");
    h.details.lastSeenTms = time;
    const r = report([h]);
    assert.equal(r.assessment.score, null);
    assert.equal(r.rows[0].status, "unknown");
  }
});
test("Compliance: partial inventory, missing permission and omitted environments suppress global score", () => {
  for (const inv of [
    [{ ...inventory[0], total: 10, complete: false }],
    [{ ...inventory[0], available: false, complete: false }],
  ]) {
    const r = report([host("HOST-A", "22.04")], {}, inv);
    assert.equal(r.assessment.score, null);
    assert.equal(r.assessment.assessedScore, 100);
    assert.equal(r.assessment.reason, "Inventaire incomplet");
  }
  assert.equal(
    report([host("HOST-A", "22.04")], { scopeComplete: false }).assessment
      .score,
    null,
  );
});
test("Compliance: exact coverage boundary cannot round an insufficient fraction to 60 percent", () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({
    status: i < 119 ? "ok" : "unknown",
    category: "os",
  }));
  assert.equal(lifecycleAssessment(rows, inventory).score, null);
  rows[119].status = "ok";
  assert.equal(lifecycleAssessment(rows, inventory).score, 100);
});
test("Compliance: month uncertainty and old reference cannot become conforming", () => {
  const h = host("HOST-A", "22.04");
  const may = Date.parse("2027-05-15T00:00:00Z");
  h.details.lastSeenTms = may;
  const r = buildLifecycleReport([h], inventory, { now: may });
  assert.equal(r.assessment.score, null);
  assert.equal(r.rows[0].status, "unknown");
});
test("Campaigns preserve environment boundaries and deduplicate repeated component observations", () => {
  const a = host("HOST-A", "20.04");
  const b = host("HOST-A", "20.04", "b");
  const r = report([a, a, b]);
  assert.equal(r.rows.length, 2);
  assert.equal(r.campaigns.length, 2);
  assert.ok(
    r.campaigns.every((c) =>
      c.rows.every((row: any) => row.environmentId === c.environmentId),
    ),
  );
  assert.equal(r.campaigns[0].gainPoints, 50);
  assert.equal(r.rows[0].traceId, "T2");
});
test("Discovery: version cannot be inferred from process name; Kubernetes normalization is explicit", () => {
  const pg = softwareInventory({
    type: "PROCESS_GROUP_INSTANCE",
    displayName: "Python 3.10",
    details: { properties: {} },
  });
  assert.equal(pg[0].version, null);
  const rows = softwareInventory({
    type: "HOST",
    details: {
      properties: {
        softwareTechnologies: [
          { type: "KUBERNETES", version: "v1.32.3+k3s1" },
          { type: "NODE_EXPORTER", version: "1.2" },
        ],
      },
    },
  });
  assert.equal(
    rows.find((r) => r.rawVersion === "v1.32.3+k3s1").product,
    "Kubernetes",
  );
  assert.equal(rows.find((r) => r.version === "1.2").product, "NODE_EXPORTER");
});
test("Managed node OS uses the distribution field, not the kernel version", () => {
  const rows = softwareInventory({
    type: "KUBERNETES_NODE",
    details: {
      properties: {
        osInfo: "Ubuntu 22.04.5 LTS",
        osVersion: "5.15.0-176-generic",
        osType: "LINUX",
      },
    },
  });
  const os = rows.find((r) => r.category === "os");
  assert.equal(os.product, "Ubuntu");
  assert.equal(os.version, "22.04.5");
  assert.equal(os.field, "osInfo");
});
test("Audit : upstream échu, version inconnue et référence ancienne distincts", () => {
  assert.equal(
    classifyLifecycle("Kubernetes", "v1.32.3+k3s1", at).status,
    "action",
  );
  assert.equal(classifyLifecycle("Ubuntu", "22.04.5", at).status, "ok");
  assert.equal(classifyLifecycle("Mystery", "1.2", at).status, "unknown");
  assert.equal(
    classifyLifecycle("Ubuntu", "22.04.5", at + 100 * 86400000).status,
    "unknown",
  );
});
test("Audit : aucune version inventée depuis un nom de processus", () => {
  const rows = softwareInventory({
    type: "PROCESS_GROUP",
    displayName: "python 3.10",
    details: { properties: {} },
  });
  assert.equal(rows[0].version, null);
  assert.equal(
    auditInventory([entity], at).find((r: any) => r.product === "OneAgent").status,
    "unknown",
  );
});
test("Le mois de fin de support ne devient pas une date précise inventée", () => {
  const r = classifyLifecycle("Ubuntu", "22.04", at);
  assert.ok(r.reference);
  assert.equal(r.reference.precision, "month");
  assert.equal(r.reference.end, "2027-05");
});
