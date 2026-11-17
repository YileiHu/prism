#!/usr/bin/env node
// Validate the project docs, generated reference and cross-process contracts.
//
//   npm run docs:check
//
// Exit code 1 on any error. Warnings do not fail the run.
// This script deliberately does not duplicate checks that `tsc` already
// guarantees (settings/model type alignment, i18n key typing, …).

import fs from "node:fs";
import path from "node:path";
import {
  REPO_ROOT,
  SOURCES,
  collect,
  exists,
  generateAll,
  placeholders,
  read,
  walk,
} from "./lib/reference.mjs";

const errors = [];
const warnings = [];
const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

const data = collect();

// ---------------------------------------------------------------------------
// 1. Generated reference must match source
// ---------------------------------------------------------------------------

const generated = generateAll(data);
for (const [relPath, content] of Object.entries(generated)) {
  if (!exists(relPath)) {
    fail(`missing generated file ${relPath}; run \`npm run docs\``);
    continue;
  }
  if (read(relPath) !== content) {
    fail(`stale generated file ${relPath}; run \`npm run docs\``);
  }
}

// ---------------------------------------------------------------------------
// 2. IPC contracts
// ---------------------------------------------------------------------------

for (const method of data.preload.invokeMethods) {
  if (!data.main.handles.has(method.channel)) {
    fail(`IPC: preload method \`${method.name}\` uses \`${method.channel}\`, but main.ts has no ipcMain.handle`);
  }
}
for (const channel of data.main.handles) {
  if (!data.preload.invokeMethods.some((method) => method.channel === channel)) {
    fail(`IPC: main.ts handles \`${channel}\`, but preload.ts never invokes it`);
  }
}
for (const method of data.preload.eventMethods) {
  if (!data.main.sends.has(method.channel)) {
    fail(`IPC event: preload subscribes to \`${method.channel}\`, but main.ts never sends it`);
  }
}
for (const channel of data.main.sends) {
  if (!data.preload.eventMethods.some((method) => method.channel === channel)) {
    fail(`IPC event: main.ts sends \`${channel}\`, but preload.ts never subscribes`);
  }
}

// ---------------------------------------------------------------------------
// 3. Renderer calls exist in preload
// ---------------------------------------------------------------------------

const apiNames = new Set(data.preload.methods.map((method) => method.name));
for (const file of walk("src", [".ts", ".tsx"])) {
  const text = read(file);
  for (const match of text.matchAll(/window\.prism\.([A-Za-z_$][\w$]*)/g)) {
    if (!apiNames.has(match[1])) {
      fail(`${file}: calls window.prism.${match[1]} which is not in preload.ts`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Every shortcut action has a settings row
// ---------------------------------------------------------------------------

if (exists(SOURCES.shortcutsUi)) {
  const shortcutsUi = read(SOURCES.shortcutsUi);
  for (const action of data.shortcutActions) {
    if (!shortcutsUi.includes(`"${action}"`)) {
      fail(`${SOURCES.shortcutsUi}: missing UI row for shortcut action "${action}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Version and changelog
// ---------------------------------------------------------------------------

if (data.changelog[0] !== data.version) {
  fail(`package.json version ${data.version} != top changelog version ${data.changelog[0] ?? "(none)"}`);
}
const seenVersions = new Set();
let previous = null;
for (const version of data.changelog) {
  if (seenVersions.has(version)) fail(`changelog has duplicate version ${version}`);
  seenVersions.add(version);
  if (previous && compareVersions(previous, version) <= 0) {
    fail(`changelog versions must be strictly descending: ${previous} then ${version}`);
  }
  previous = version;
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// 6–9. Markdown: index coverage, links, path references, npm scripts
// ---------------------------------------------------------------------------

const markdownFiles = [
  "README.md",
  "AGENTS.md",
  ...walk("docs", [".md"]),
  ...walk(".dsh/skills", [".md"]),
].filter(exists);

const indexFile = "docs/index.md";
if (!exists(indexFile)) {
  fail("missing docs/index.md (the documentation entry point)");
} else {
  const indexText = read(indexFile);
  for (const file of walk("docs", [".md"])) {
    if (file === indexFile) continue;
    const fromDocs = file.slice("docs/".length);
    const candidates = [file, fromDocs, path.posix.basename(file)];
    if (!candidates.some((candidate) => indexText.includes(candidate))) {
      fail(`docs/index.md does not reference ${file}`);
    }
  }
}

const rootFiles = new Set([
  "AGENTS.md",
  "README.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.node.json",
  "vite.config.ts",
  "tailwind.config.js",
  "postcss.config.js",
  "index.html",
  ".gitignore",
]);
const pathPrefixes = ["src/", "electron/", "scripts/", "docs/", ".dsh/", "public/"];
const skippedPrefixes = ["release/", "out/", "dist/", "dist-electron/", "node_modules/", ".prism/"];

for (const file of markdownFiles) {
  const text = read(file);
  const linkText = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "");

  for (const match of linkText.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim().replace(/^<|>$/g, "");
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    const hash = target.indexOf("#");
    if (hash !== -1) target = target.slice(0, hash);
    if (!target || (!target.includes("/") && !target.includes("."))) continue;
    const absPath = path.resolve(path.dirname(path.join(REPO_ROOT, file)), target);
    if (!fs.existsSync(absPath)) {
      fail(`${file}: broken link ${match[1]}`);
    }
  }

  // Historical design docs intentionally talk about files that were later
  // renamed or removed; only link/npm checks apply to them.
  if (!file.startsWith("docs/design/")) {
    for (const match of text.matchAll(/`([^`\n]+)`/g)) {
      let token = match[1].trim();
      if (!token) continue;
      token = token.replace(/:\d+(?:-\d+)?$/, "");
      if (token.includes("...") || /[*?<>{}|()]/.test(token) || /\s/.test(token)) continue;
      if (skippedPrefixes.some((prefix) => token.startsWith(prefix))) continue;
      const looksLikePath = pathPrefixes.some((prefix) => token.startsWith(prefix))
        || rootFiles.has(token);
      if (!looksLikePath) continue;
      if (!exists(token)) {
        fail(`${file}: references missing path ${token}`);
      }
    }
  }

  for (const match of text.matchAll(/npm run ([\w:-]+)/g)) {
    if (!(match[1] in data.scripts)) {
      fail(`${file}: references missing npm script "${match[1]}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// 10. Every database table is documented in data-model.md
// ---------------------------------------------------------------------------

if (!exists(SOURCES.dataModelDoc)) {
  fail(`missing ${SOURCES.dataModelDoc}`);
} else {
  const text = read(SOURCES.dataModelDoc);
  for (const table of data.database.tables) {
    if (!text.includes(table.name)) {
      fail(`${SOURCES.dataModelDoc}: table \`${table.name}\` is not documented`);
    }
  }
}

// ---------------------------------------------------------------------------
// 11. Skills
// ---------------------------------------------------------------------------

const skillsRoot = path.join(REPO_ROOT, ".dsh/skills");
if (fs.existsSync(skillsRoot)) {
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const relPath = `.dsh/skills/${entry.name}/SKILL.md`;
    if (!exists(relPath)) {
      fail(`${relPath}: missing`);
      continue;
    }
    const text = read(relPath);
    if (!text.startsWith("---")) {
      fail(`${relPath}: missing frontmatter`);
      continue;
    }
    const end = text.indexOf("\n---", 3);
    const frontmatter = end === -1 ? "" : text.slice(3, end);
    const name = /^name:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();
    if (name !== entry.name) {
      fail(`${relPath}: frontmatter name "${name ?? ""}" != directory "${entry.name}"`);
    }
    if (!/^description:/m.test(frontmatter)) {
      fail(`${relPath}: frontmatter needs description`);
    }
  }
}

// ---------------------------------------------------------------------------
// 12. Size limits (context budget)
// ---------------------------------------------------------------------------

if (exists("AGENTS.md")) {
  const lines = lineCount(read("AGENTS.md"));
  if (lines > 130) fail(`AGENTS.md has ${lines} lines (limit 130)`);
}

for (const file of walk("docs", [".md"])) {
  if (file.startsWith("docs/reference/")) continue;
  if (file.startsWith("docs/design/")) continue;
  const lines = lineCount(read(file));
  if (lines > 400) fail(`${file}: ${lines} lines (limit 400; split it)`);
  else if (lines > 300) warn(`${file}: ${lines} lines (target <= 300)`);
}

for (const file of walk(".dsh/skills", [".md"])) {
  const lines = lineCount(read(file));
  if (lines > 200) fail(`${file}: ${lines} lines (limit 200; skills must stay operational)`);
  else if (lines > 160) warn(`${file}: ${lines} lines (target <= 160)`);
}

function lineCount(text) {
  return text.split(/\r?\n/).length;
}

// ---------------------------------------------------------------------------
// 13. i18n placeholder parity
// ---------------------------------------------------------------------------

for (const [key, zhValue] of data.i18n.zh) {
  if (!data.i18n.en.has(key)) {
    fail(`i18n: en.ts is missing "${key}"`);
    continue;
  }
  const zhPlaceholders = [...placeholders(zhValue)].sort();
  const enPlaceholders = [...placeholders(data.i18n.en.get(key))].sort();
  if (zhPlaceholders.join(",") !== enPlaceholders.join(",")) {
    fail(`i18n: "${key}" placeholders differ: zh {${zhPlaceholders.join(",")}} vs en {${enPlaceholders.join(",")}}`);
  }
}
for (const key of data.i18n.en.keys()) {
  if (!data.i18n.zh.has(key)) fail(`i18n: zh.ts is missing "${key}"`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

for (const message of warnings) console.warn(`! ${message}`);
for (const message of errors) console.error(`✗ ${message}`);

console.log("");
console.log(
  `Checked ${data.preload.methods.length} IPC methods, ${data.database.tables.length} tables, ` +
    `${data.settings.keys.length} settings, ${data.i18n.zh.size} i18n keys, ` +
    `${data.shortcutActions.length} shortcuts, ${markdownFiles.length} markdown files.`,
);
console.log(`${errors.length} error(s), ${warnings.length} warning(s).`);
process.exit(errors.length > 0 ? 1 : 0);
