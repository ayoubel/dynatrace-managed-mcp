# Offline lifecycle catalogue v1

Advisor loads an immutable, validated JSON catalogue in Core. Gateway and browser interfaces only render the result. Investigations never fetch vendor policies. This increment provides the complete offline review/import/selection path and a first optional connected collector for the official Node.js schedule. Other vendors retain their existing references and require reviewed manual candidates until their collectors are implemented. No scheduler is installed.

## Compatibility and provenance

The bundled `src/capabilities/lifecycle-catalogue/catalogue-v1.json` is version **1.0.0**: a lossless migration of all 43 embedded policies. Dates, edition constraints, precision, minimum availability, matching aliases, 90-day reference freshness, 24-hour observations and score rules are preserved. NGINX remains UNKNOWN when its policy is absent. The 90-day threshold is not a polling frequency.

Original `verifiedAt` dates are retained as legacy assertions. No official raw source archive existed for that data. Such entries are explicitly `verificationState: legacy_record`; sources are `evidenceState: legacy_unverified`, with null retrieval time/content hash. Their migration review does **not** assert new vendor verification. Validation restricts legacy provenance to the unchanged bundled entry and source content; changing or adding a policy requires archived evidence and a new review.

The compatibility export `lifecycleReferences`, reference objects and the existing reference SHA-256 remain stable. Reports add `referenceSnapshot.catalogue` with schema version, catalogue version and canonical payload SHA-256. The payload digest includes review and provenance metadata; it is distinct from the old reference-array digest. Gateway UI/Markdown/HTML and JSON retain this identity. Historical reports without it remain readable. Historical identity-free reports can be combined only against the original bundled catalogue; mixed or mismatching identities require new audits.

## Model and validation

Schema version **1.0** is separate from catalogue SemVer and Advisor report version 3. [JSON Schema 2020-12](../src/capabilities/lifecycle-catalogue/catalogue-v1.schema.json) describes the shape; the executable Zod schema and semantic validator are in `catalogue.cjs`. Semantic validation is mandatory in addition to JSON Schema format checks.

Entries identify vendor/product, explicit edition/distribution/OS/architecture/entitlement scope, aliases, typed matchers, milestones, uncertainty and verification. Matchers accept major, major.minor, exact `A.B.C`, or bounded `>=A.B.C <D.E.F` expressions. Arbitrary executable patterns are rejected. Ambiguous overlapping scopes and aliases are rejected. Inventory lacking required scope does not receive an unsupported inferred match.

Milestones retain day, month or unknown precision. Release, active, security, extended support and availability are stored independently. The existing assessment policy may evaluate security-support end or a minimum availability bound, never a release date. Reaching a minimum availability horizon does not prove EOS. Missing/disputed/conditional policy metadata does not produce a positive support verdict.

Validation also rejects unknown fields/schema majors, duplicate IDs/milestones, unknown or inconsistent source references, unapproved/pending runtime entries, impossible dates, invalid edition constraints, inconsistent date order and unsupported source URLs. Official sources use an explicit URL allowlist, not a broad trust of arbitrary GitHub repositories. Verified policies require archived official evidence preceding their verification. Retrieving content does not set `verifiedAt`.

## Maintenance workflow

Use Node 26.5.1 or another version within package.json's declared range. Commands below are explicit operator actions; none run in an investigation.

```sh
# Optional connected maintenance action; fixed official HTTPS URL, no redirects.
node scripts/lifecycle-catalogue.mjs collect-nodejs \
  --version 1.1.0 --output /path/to/candidate.json --evidence-dir /path/to/evidence

# Or normalize an archived {url, retrievedAt, content} snapshot offline:
node scripts/lifecycle-catalogue.mjs collect-nodejs \
  --snapshot /path/to/snapshot.json --version 1.1.0 \
  --output /path/to/candidate.json --evidence-dir /path/to/evidence

node scripts/lifecycle-catalogue.mjs validate --candidate /path/to/candidate.json
node scripts/lifecycle-catalogue.mjs diff --candidate /path/to/candidate.json
# Optional --samples file: [{"product":"Node.js","version":"22.14.0","edition":null}]
```

Collecting writes a **pending** candidate and raw content-addressed evidence. Format changes/empty schedules are review errors. Diffs list additions, withdrawals, changed entries, source changes and the exact candidate digest. Optional samples show unapproved proposed verdicts using the actual classifier; they do not select a runtime version. Review withdrawals, date movement, matchers, uncertainty and changes in coverage before approval. Other vendors can use the same strict candidate model with archived allowlisted sources and explicit provenance. Derived dates need a derivation rule and all input sources.

The operator supplies an Ed25519 signing key and separately provisioned trusted public key. No production keys are generated or installed by these changes. Private keys stay outside the repository. Approval requires reviewer identity, the exact previously reviewed candidate hash, and matching raw evidence bytes. Files are created exclusively; existing candidate/bundle files are not overwritten.

```sh
node scripts/lifecycle-catalogue.mjs approve --candidate /path/to/candidate.json \
  --reviewed-by 'Reviewer identity' --expected-sha256 CANDIDATE_HASH \
  --private-key /private/path/signing.pem --evidence-dir /path/to/evidence \
  --output /path/to/reviewed-bundle.json

node scripts/lifecycle-catalogue.mjs import --bundle /path/to/reviewed-bundle.json \
  --store /path/to/catalogue-store --public-key /path/to/trusted-public.pem

# 'none' is accepted only for the first selection in a new store.
node scripts/lifecycle-catalogue.mjs select --version 1.1.0 \
  --store /path/to/catalogue-store --public-key /path/to/trusted-public.pem \
  --expected-current CURRENT_PAYLOAD_HASH --reason 'Reviewed lifecycle update'
```

Approval signs the canonical catalogue payload and advances only pending entries' verification time. It neither imports nor selects the bundle. Import verifies its signature against the operator-trusted public key and installs an immutable `versions/<semver>` directory. Reusing a version for different content is rejected. Concurrent version installation does not overwrite an existing version. The bundled snapshot is trusted as packaged code with a fixed integrity manifest; external snapshots always require a signature.

Runtime selection is opt-in through `DT_MCP_LIFECYCLE_CATALOGUE_DIR` and `DT_MCP_LIFECYCLE_CATALOGUE_PUBLIC_KEY` (a public-key file path). Without these settings the bundled catalogue is used. `inspect` prints the selected identity. Each report pins one loaded catalogue for all rows and reference metadata, so a selection change cannot mix policies inside a report. Invalid/missing signatures, content, selection or keys fail explicitly; they never silently fall back and publish a compliance score.

## Rollback and retention

```sh
node scripts/lifecycle-catalogue.mjs rollback --version 1.0.0 \
  --store /path/to/catalogue-store --public-key /path/to/trusted-public.pem \
  --expected-current CURRENT_PAYLOAD_HASH --reason 'Rollback after reviewed issue'
```

Selection and rollback both verify the retained version, take an exclusive selection lock, check the expected current digest and atomically rename the new pointer. A stale decision or existing lock stops the operation. History records previous/next identities and a reason; `current.json` remains authoritative if a crash leaves a journal intent. Interrupted temporary files or a lock must be investigated, not automatically forced away. No history/snapshot pruning is implemented. Existing report exports retain their original identity, and rollback never resets source verification ages. Selection does not restart services or modify deployed application code.

The tests cover the 43-policy migration and boundary verdicts, canonical hashes, scope/matcher conflicts, missing/disputed policies, malformed/corrupt data, signatures and archived evidence, unchanged default behavior, mixed-version rejection, immutable installation, explicit activation, stale decisions and rollback. The offline CLI round trip is also exercised with a disposable signed test store, without network access or professional Managed environments.
