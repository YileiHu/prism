# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Prism is a personal knowledge management desktop app — an indexing and management layer for a personal knowledge system. It does not replace existing tools (e.g., Obsidian) but complements them with unified collection, organization, and search.

## Tech Stack

- **Desktop shell**: Electron
- **Frontend**: React + TypeScript
- **Build tool**: Vite + vite-plugin-electron (compiles both main process and renderer)
- **UI**: Tailwind CSS + lucide-react icons
- **Database**: SQLite via better-sqlite3 (native module, must be rebuilt for Electron's Node version)
- **Search**: SQLite FTS5 (full-text search)
- **Future**: Chrome Extension for quick page saving

## Project Structure

```
prism/
├── electron/               # Electron main process (Node.js)
│   ├── main.ts             # Window creation, IPC handlers, app lifecycle
│   ├── preload.ts          # contextBridge API exposed to renderer
│   └── database.ts         # SQLite schema, CRUD, FTS operations
├── src/                    # Renderer (React, runs in browser context)
│   ├── main.tsx            # React entry point
│   ├── App.tsx             # Tab navigation shell
│   ├── index.css           # Tailwind directives
│   ├── lib/api.ts          # window.prism type declaration
│   └── components/
│       ├── WebResources.tsx # Add/list/search/edit/delete web resources
│       ├── ObsidianVault.tsx# Select vault path, scan .md files, browse notes
│       └── UnifiedSearch.tsx# Cross-domain FTS across resources + notes
├── index.html
├── vite.config.ts          # Vite + vite-plugin-electron config
├── tsconfig.json
├── tailwind.config.js
└── postcss.config.js
```

## Architecture

**Process model**: Electron main process runs Node.js with direct SQLite access. Renderer is a React SPA with no Node.js access — all DB operations go through IPC (`contextBridge` + `ipcRenderer.invoke`).

**IPC API** (defined in `electron/preload.ts`):
- `resources:*` — CRUD + FTS search for web resources
- `fetch:title` — fetches a URL's `<title>` via Electron's `net.fetch`
- `obsidian:*` — set vault path, scan .md files, list/notes, open in Obsidian via `shell.openPath`
- `dialog:select-directory` — native folder picker for vault selection
- `search:unified` — FTS across both resources and notes

**Database** (`electron/database.ts`):
- `resources` + `resources_fts` (FTS5 over title, notes, url) with triggers keeping FTS in sync
- `tags` + `resource_tags` (many-to-many)
- `obsidian_notes` + `obsidian_fts` (FTS5 over title, content, tags) — cleared and re-indexed on each vault scan
- Stored at `app.getPath("userData")/prism.db`

**Obsidian integration**: The vault scan (`scanVault` in main.ts) walks the directory recursively, reads each `.md` file, extracts `#tags` from content, and indexes everything into `obsidian_notes`. The vault is re-scanned on each "Refresh" — previous notes are cleared and re-inserted in a transaction.

## Design Principles

1. User owns their data — no vendor lock-in, open formats (Markdown, SQLite)
2. Capture fast, organize later
3. Don't reinvent tools that already work well (e.g., Obsidian for editing)
4. Keep it lightweight, iterate over time

## Common Commands

```bash
# First time setup
npm install
npm run rebuild        # Rebuild better-sqlite3 for Electron's Node version

# Development
npm run electron:dev   # Start Vite dev server + Electron (single command)

# Build
npm run build          # TypeScript check + Vite production build
npm run electron:build # Build + package with electron-builder

# Lint
npm run lint           # TypeScript type-check only
```
