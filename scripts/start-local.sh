#!/bin/sh
set -eu
SERVER_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$SERVER_ROOT"
SERVER_NODE=${DT_MCP_NODE:-node}
export DT_CONFIG_FILE=${DT_CONFIG_FILE:-"$SERVER_ROOT/dt-config.yaml"}
export DT_MCP_TOKEN_ENV_FILE=${DT_MCP_TOKEN_ENV_FILE:-"$SERVER_ROOT/.env"}
export DT_MCP_FILTER_TOKEN_TOOLS=true
export DT_MCP_ENABLE_TELEMETRY=${DT_MCP_ENABLE_TELEMETRY:-false}
export LOG_OUTPUT=stderr-all
export LOG_LEVEL=${LOG_LEVEL:-warn}
if [ ! -f "$SERVER_ROOT/dist/index.js" ]; then
  echo 'Build the server with npm ci and npm run build first.' >&2
  exit 1
fi
exec "$SERVER_NODE" --env-file="$DT_MCP_TOKEN_ENV_FILE" "$SERVER_ROOT/dist/index.js"
