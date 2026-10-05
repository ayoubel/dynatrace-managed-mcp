# Verification record

Validated on 2026-10-05 using Node.js 26.5.1.

| Check                                     | Result                                                      |
| ----------------------------------------- | ----------------------------------------------------------- |
| `npm run build`                           | Passed                                                      |
| `npm run version:check`                   | Passed                                                      |
| `npm run test:unit -- --runInBand`        | 317 tests passed across 21 suites                           |
| Focused loopback integration checks       | 5 tests passed across 3 suites                              |
| Live MCP discovery                        | 21 tools for the tested credential set; no workflow prompts |
| Live dashboard writes during verification | None                                                        |

Focused integration command:

```sh
npm run test:integration -- --runTestsByPath \
  tests/integration/token-refresh.integration.test.ts \
  tests/integration/token-passthrough.integration.test.ts \
  tests/integration/proxy.integration.test.ts
```

The rotation test launches the built server over stdio against a loopback fake Dynatrace API. It verifies changed-token discovery and use, invalid-token rejection, automatic recovery, same-token permission changes, idle tool-list notifications, and absence of workflow prompts. It uses fake credentials and temporary files.

Live checks used `scripts/check-mcp.cjs` with the existing local configuration. The check only discovers tools and does not save dashboards. Tool count is specific to the tested token; it is not a fixed expected inventory.

Jest emitted its existing ts-jest configuration warning, and the upstream proxy fixture emitted a Node deprecation warning. All listed checks completed successfully.
