# Local setup from this fork

These instructions run the built code in this repository, including Classic dashboard POST/PUT tools and token-aware discovery. The upstream npm package does not automatically include this fork's changes.

## Prerequisites

- Git, Node.js `>=26.5.1 <27`, and npm, matching `package.json`.
- A VS Code installation with an MCP-capable agent, such as GitHub Copilot, and permission to use MCP servers.
- Network and TLS access to the Dynatrace Managed environment (plus a configured proxy if needed).
- An API token kept locally. The scopes table in [api_token_scopes.md](api_token_scopes.md) describes supported operations; tools are selected from the token's current permissions.

## Install and configure (macOS/Linux)

```sh
git clone https://github.com/ayoubel/dynatrace-managed-mcp.git
cd dynatrace-managed-mcp
git switch main
npm ci
npm run build
cp examples/local/dt-config.example.yaml dt-config.yaml
cp examples/local/.env.example .env
chmod 600 .env dt-config.yaml
```

Edit `dt-config.yaml` with your cluster base URL, environment ID, and alias. The server adds `/e/<environmentId>` itself; do not put that suffix in `apiEndpointUrl`. Edit `.env` locally with your token. Both files are ignored by Git. Do not paste tokens into chat or commit them.

Copy `examples/local/vscode-mcp.example.json` to `.vscode/mcp.json` (merge its `servers` entry if you already have other servers). Open this repository's folder in VS Code. For another workspace, replace `${workspaceFolder}/scripts/start-local.sh` with the absolute launcher path. If VS Code cannot find Node, add `env: { "DT_MCP_NODE": "/absolute/path/to/node" }` to the server entry.

The launcher defaults to this repository's `.env` and `dt-config.yaml`. Set `DT_CONFIG_FILE` and `DT_MCP_TOKEN_ENV_FILE` in the server entry's `env` to keep using configuration files elsewhere. It reserves stdout for MCP and disables telemetry by default.

Run **MCP: List Servers**, select the server, and start it. Trust it when prompted and enable the desired tools in the agent's tool selector. Stop/restart it through the same menu. A server started manually in a terminal is a separate process; it does not restart the instance owned by VS Code.

## Verify without creating a dashboard

```sh
node scripts/check-mcp.cjs
```

The command lists the tools exposed for your current token and does not create or modify dashboards. For another launcher, add `--launcher /absolute/path/to/start.sh`. There is no expected fixed tool count.

Try a read-only agent request: “List up to five open problems from the last hour in environment managed.” See [dashboard tools](dashboard-tools.md) for explicitly requested dashboard creation and updates.

## Update the server

```sh
git switch main
git pull --ff-only origin main
npm ci
npm run build
```

Restart the server through **MCP: List Servers** after code updates. If your client still shows cached tools, run **MCP: Reset Cached Tools** and start a new chat. Token edits are handled by [token refresh](token-refresh.md) once this version is running.

For development checks, run `npm run test:unit -- --runInBand`; the focused loopback transport check is `npm run test:integration -- --runTestsByPath tests/integration/token-refresh.integration.test.ts`. Those tests use fake tokens and never change a live dashboard.

See [VS Code MCP documentation](https://code.visualstudio.com/docs/agent-customization/mcp-servers) for client controls.
