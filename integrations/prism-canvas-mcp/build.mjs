#!/usr/bin/env node
// Compile the Prism canvas format layer (src/lib/canvas/model.ts + targets.ts)
// to CommonJS so the standalone MCP server reuses the exact same
// parse/sanitize/serialize rules as the renderer instead of copying them.
//
//   node integrations/prism-canvas-mcp/build.mjs
//
// Output goes next to the MCP server so the installed plugin has no build step.
// The generated files are checked in.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const outDir = path.join(here, "server/lib");
const tsc = path.join(repoRoot, "node_modules", "typescript", "bin", "tsc");

if (!fs.existsSync(tsc)) {
  console.error(`TypeScript not found at ${tsc}; run npm install first.`);
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });

const result = spawnSync(
  process.execPath,
  [
    tsc,
    "--ignoreConfig",
    "--module", "node16",
    "--target", "ES2022",
    "--newLine", "lf",
    "--outDir", outDir,
    "--rootDir", path.join(repoRoot, "src/lib/canvas"),
    path.join(repoRoot, "src/lib/canvas/model.ts"),
    path.join(repoRoot, "src/lib/canvas/targets.ts"),
  ],
  { stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);

for (const file of ["model.js", "targets.js"]) {
  if (!fs.existsSync(path.join(outDir, file))) {
    console.error(`expected ${file} in ${outDir}`);
    process.exit(1);
  }
}

console.log(`Canvas format layer compiled to ${path.relative(repoRoot, outDir)}`);
