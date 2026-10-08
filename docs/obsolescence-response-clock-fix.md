# OS audit response-clock correction

The OS audits `44a86d4f-4226-4fae-b404-7ddd05b5b3d6` and `4f40a220-a4a9-4bea-8907-81761c30c379` failed because Dynatrace's HTTP Date and entity lastSeen timestamps were about 280 minutes ahead of the app/MCP clock. Inventory requests took 82–228 ms. The previous one-hour tolerance discarded the response offset and classified all 13 observations as future-dated.

The MCP now preserves requestedAt, receivedAt and serverAt as row evidence. Freshness uses the matching response clock rather than a maximum drift magnitude. Calibration must come from a valid short request (at most 30 seconds), match the stored offset and be within five minutes of evaluation. Support-calendar calculations continue using the local audit clock. Historical reports without timing provenance retain only the previous bounded compatibility behavior. Missing or malformed provenance, stale observations and observations more than five minutes ahead of the response clock remain unqualified.

The offset remains a visible warning. This change does not synchronize the machine, Managed or reverse-proxy clocks or determine which infrastructure clock is incorrect.

## Validation

- MCP lifecycle and authentication suites: 38 tests passed.
- App suite: 122 tests passed.
- TypeScript build and whitespace checks passed.
- Replay of the failed audit evidence: 13/13 evaluated, 100% coverage, zero clock-skew rejection.
- Fresh live read-only OS audit: `3aaa5b1b-bdc4-4fee-803e-1289ea114872`, completed; 13/13 conforming, 100% coverage and score, offset warning +280 minutes.
- Preview on port 4319 restarted to load the rebuilt MCP; port 4318 untouched.
- Earlier reports remain immutable historical snapshots.
