# Prism canvas MCP

A local [MCP](https://modelcontextprotocol.io) server that lets an agent create and edit Prism whiteboards. It writes the same `CanvasDoc` v2 JSON files Prism already opens, so every generated board stays a normal whiteboard: read it, edit it, or add it to a note embed inside Prism.

## What it exposes

| Tool | Purpose |
|---|---|
| `canvas_vaults` | List Prism vaults and their canvas folders. Call this when the user did not name a vault. |
| `canvas_list` | List whiteboards in one vault (newest first). |
| `canvas_read` | Read one board with node/edge ids, positions and `modifiedAt`. |
| `canvas_create` | Create a board from `nodes` + `edges` (+ optional `groups`); layouts: `mindmap`, `tree`, `grid`, `none`. |
| `canvas_edit` | Add/update/remove nodes, edges and frames by id; optional re-layout. |
| `canvas_layout` | Re-flow an existing board without changing its text. |

There is deliberately no whole-board delete tool. The agent must specify a vault on every call, and private (encrypted) vaults are refused because Prism stores their content encrypted.

## How it finds Prism

The server reads, never writes, the `settings` table of Prism's SQLite database:

- Windows: `%APPDATA%\prism\prism.db`
- macOS: `~/Library/Application Support/prism/prism.db`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/prism/prism.db`

It reads `vault_paths` and `canvas_dir` from that table, then treats each board as the plain JSON file under `<vault>/<canvas_dir>/` (plus the legacy `<vault>/Projects/<name>/` folders).

Environment overrides:

| Variable | Meaning |
|---|---|
| `PRISM_USER_DATA` | Prism userData folder instead of the platform default. |
| `PRISM_DB` | Explicit `prism.db` path. |
| `PRISM_CANVAS_DIR` | Canvas folder inside each vault (default `canvases`). |
| `PRISM_CANVAS_VAULTS` | JSON `[{ "name": "...", "path": "...", "private": false }]` that replaces the database lookup (tests, other machines). |

## Run it

```bash
node --no-warnings integrations/prism-canvas-mcp/server/server.js
```

The process speaks newline-delimited JSON-RPC 2.0 on stdio. `--help` prints the environment overrides.

To use it from DSH, install this folder as a bundle (it contains `cordis.patch.yml` with an absolute path to the server, so update that path if the repository moves):

```bash
# In DSH: Plugins → Add plugin → select the local directory
# or ask the agent to install E:\Projects\prism\integrations\prism-canvas-mcp
```

## Rebuild after changing Prism's canvas format

`server/lib/model.js` and `server/lib/targets.js` are compiled from `src/lib/canvas/model.ts` and `src/lib/canvas/targets.ts`, so the server inherits Prism's sanitizing, migration and stable serialization:

```bash
npm run canvas:mcp:build
```

## Check it

```bash
npm run canvas:mcp:test
```

The self-test drives the real JSON-RPC handlers against a throwaway vault and validates the result with Prism's parser. DSH itself exercises the spawned stdio transport after the bundle is installed.

## Limits

- Prism does not watch the canvas folder: a board created by the agent appears after switching to 资料库 → 白板 or restarting Prism.
- If the same board is open in Prism, the app keeps its in-memory copy and reports its usual reload/overwrite conflict on the next save.
- Prism's settings database must be readable by the Node process; a locked or moved Prism profile returns `PRISM_DB_MISSING`.
