# Isolated development

Use the Node version in package.json and install this repository's dependencies. `npm test` / `npm run test:unit` run unit tests only, without Chrome or Gateway. Real-environment integration remains explicitly opt-in (`test:integration`); do not run it without Managed authorization.

Eleven lifecycle assertions formerly in Gateway are in lifecycle-compatibility.test.ts. Advisor inputs and expected V3 synthetic reports are in test-fixtures/. Generate canonical snapshots with scripts/export-advisor-fixtures.cjs; --check accepts an explicit artifact path for cross-repository integration, never implicit sibling imports. Production rules remain in src/capabilities/lifecycle.cjs without changes.

Historical scripts/validate-sprint08,09,10* are opt-in multi-product acceptance harnesses, not unit-test dependencies. They are not run against professional data during this intervention.
