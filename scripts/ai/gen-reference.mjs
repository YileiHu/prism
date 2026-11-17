#!/usr/bin/env node
// Regenerate docs/reference/*.md from source.
//
//   npm run docs            write the files
//   npm run docs -- --check fail if the checked-in files are stale
//
// The generated files only contain stable contract facts (names, channels,
// keys, SQL, exports). Never put line numbers or timestamps in them: those
// change on ordinary edits and would make `docs:check` fail constantly.

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, generateAll } from "./lib/reference.mjs";

const check = process.argv.includes("--check");
const files = generateAll();
const stale = [];

for (const [relPath, content] of Object.entries(files)) {
  const absPath = path.join(REPO_ROOT, relPath);
  const current = fs.existsSync(absPath) ? fs.readFileSync(absPath, "utf8") : null;
  if (current === content) continue;
  stale.push(relPath);
  if (!check) {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, "utf8");
  }
}

if (check) {
  if (stale.length > 0) {
    console.error("Generated reference docs are stale:");
    for (const relPath of stale) console.error(`  - ${relPath}`);
    console.error("Run `npm run docs` and commit the result.");
    process.exit(1);
  }
  console.log(`Reference docs are up to date (${Object.keys(files).length} files).`);
} else {
  console.log(
    stale.length > 0
      ? `Wrote ${stale.length} reference file(s): ${stale.join(", ")}`
      : `Reference docs already up to date (${Object.keys(files).length} files).`,
  );
}
