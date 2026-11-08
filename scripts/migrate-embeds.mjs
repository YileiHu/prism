// One-off migration: rewrite legacy ![alt|WxH](src) images into the unified
// ![[src|label|WxH]] embed syntax. Originals are backed up before any write.
//
//   node scripts/migrate-embeds.mjs            (dry run, prints a summary)
//   node scripts/migrate-embeds.mjs --write    (rewrite files, after backup)
//   node scripts/migrate-embeds.mjs --vault "D:\notes" [--vault ...]
//
// Vaults are read from the app's settings DB unless --vault is given.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;
const SIZE_TOKEN = /^\d{1,5}(?:[xX×]\d{1,5})?$/;
// group1 = alt, group2 = src (<...> or bare), group3 = optional title
const IMG_RE = /!\[([^\]\n]*)\]\(\s*(<[^>\n]*>|[^\s)]+)(?:\s+("[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\)/g;

const args = process.argv.slice(2);
const write = args.includes("--write");
const vaultArgs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--vault" && args[i + 1]) vaultArgs.push(args[++i]);
}

function vaultsFromDb() {
  const dbPath = path.join(process.env.APPDATA ?? "", "prism", "prism.db");
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("vault_paths");
    db.close();
    return JSON.parse(row?.value ?? "[]").map((v) => v.path).filter(Boolean);
  } catch {
    return [];
  }
}

// Mirrors src/components/embeds/model.ts — remote URLs ending in an image
// extension count as images so they survive the migration.
function kindOf(src) {
  const clean = src.split(/[?#]/)[0];
  if (/^https?:\/\//i.test(src) && IMAGE_EXTS.test(clean)) return "image";
  if (/^(https?:|mailto:)/i.test(src)) return "link";
  if (IMAGE_EXTS.test(clean)) return "image";
  if (/\.(canvas|json)$/i.test(clean)) return "canvas";
  return "note";
}

function sanitizeLabel(label) {
  return label
    .replace(/\r?\n/g, " ")
    .replace(/\[/g, "［")
    .replace(/\]/g, "］")
    .replace(/\|/g, "／")
    .trim();
}

function splitAlt(alt) {
  const pipe = alt.lastIndexOf("|");
  if (pipe === -1) return { label: alt.trim(), size: "" };
  const token = alt.slice(pipe + 1).trim();
  if (!SIZE_TOKEN.test(token)) return { label: alt.trim(), size: "" };
  return { label: alt.slice(0, pipe).trimEnd(), size: token };
}

function codeRanges(line) {
  const ranges = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] !== "`") { i++; continue; }
    let j = i;
    while (j < line.length && line[j] === "`") j++;
    const run = j - i;
    let k = j;
    let close = -1;
    while (k < line.length) {
      if (line[k] !== "`") { k++; continue; }
      let m = k;
      while (m < line.length && line[m] === "`") m++;
      if (m - k === run) { close = k; break; }
      k = m;
    }
    if (close === -1) { i = j; continue; }
    ranges.push([i, close + run]);
    i = close + run;
  }
  return ranges;
}

function rewriteLine(line, file, stats, samples) {
  if (!line.includes("![")) return line;
  const ranges = codeRanges(line);
  const inCode = (start) => ranges.some(([a, b]) => start >= a && start < b);
  let out = "";
  let last = 0;
  let m;
  IMG_RE.lastIndex = 0;
  while ((m = IMG_RE.exec(line))) {
    const start = m.index;
    if (line[start + 2] === "[") continue; // ![[...]] embed, not this syntax
    if (inCode(start)) { stats.skippedCode++; continue; }
    if (m[3]) { stats.skippedTitle++; continue; }
    let src = m[2];
    if (src.startsWith("<") && src.endsWith(">")) src = src.slice(1, -1);
    if (!src || src.startsWith("#")) { stats.skippedTarget++; continue; }
    if (kindOf(src) !== "image") { stats.skippedKind++; continue; }
    if (/^data:/i.test(src)) { stats.skippedData++; continue; }
    if (/[\[\]|]/.test(src)) { stats.skippedTarget++; continue; }
    const { label, size } = splitAlt(m[1]);
    const cleanLabel = sanitizeLabel(label);
    const replacement = `![[${[src, cleanLabel, size].filter(Boolean).join("|")}]]`;
    if (replacement === m[0]) continue;
    out += line.slice(last, start) + replacement;
    last = start + m[0].length;
    stats.replaced++;
    if (samples.length < 25) samples.push(`  ${file}\n    ${m[0]}\n    -> ${replacement}`);
  }
  out += line.slice(last);
  return out;
}

function newStats() {
  return {
    replaced: 0, skippedCode: 0, skippedTitle: 0, skippedTarget: 0,
    skippedKind: 0, skippedData: 0,
  };
}

function walkVault(dir) {
  const files = [];
  const queue = [dir];
  while (queue.length > 0) {
    const current = queue.shift();
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".")) queue.push(full);
      } else if (entry.name.endsWith(".md")) {
        files.push(full);
      }
    }
  }
  return files;
}

function processFile(file, stats, samples, backup) {
  const raw = fs.readFileSync(file);
  const hasBom = raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;
  let text = raw.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);

  let start = 0;
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") { start = i + 1; break; }
    }
  }

  let changed = false;
  let fence = null;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      continue;
    }
    if (fenceMatch) { fence = fenceMatch[1]; continue; }
    const next = rewriteLine(line, file, stats, samples);
    if (next !== line) { lines[i] = next; changed = true; }
  }

  if (!changed) return false;
  const body = lines.join(eol);
  const output = hasBom ? `﻿${body}` : body;
  process.stdout.write(`${write ? "rewriting" : "would rewrite"} ${file}\n`);
  if (write) {
    backup?.(file);
    fs.writeFileSync(file, output, "utf8");
  }
  return true;
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(os.tmpdir(), `prism-embed-migration-${stamp}`);
const vaults = (vaultArgs.length > 0 ? vaultArgs : vaultsFromDb()).filter((v) => fs.existsSync(v));

if (vaults.length === 0) {
  console.error("No vaults found. Pass --vault <path>.");
  process.exit(1);
}

let totalFiles = 0;
let changedFiles = 0;
const total = newStats();
const samples = [];

vaults.forEach((vault, index) => {
  const files = walkVault(vault);
  const stats = newStats();
  const before = samples.length;
  let changed = 0;
  const backup = (file) => {
    const rel = path.relative(vault, file);
    const dest = path.join(backupRoot, `${index}-${path.basename(vault)}`, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  };
  for (const file of files) {
    if (processFile(file, stats, samples, backup)) changed++;
  }
  totalFiles += files.length;
  changedFiles += changed;
  for (const key of Object.keys(total)) total[key] += stats[key];
  console.log(`\n[${vault}] ${files.length} notes, ${changed} ${write ? "rewritten" : "to change"}`);
  if (samples.length === before) console.log("  (no convertible images)");
});

console.log("\n--- summary ---");
console.log(`vaults: ${vaults.length}, notes scanned: ${totalFiles}, files ${write ? "rewritten" : "to change"}: ${changedFiles}`);
console.log(`images converted: ${total.replaced}`);
console.log(`skipped — code span: ${total.skippedCode}, title: ${total.skippedTitle}, target: ${total.skippedTarget}, non-image: ${total.skippedKind}, data URI: ${total.skippedData}`);
if (samples.length > 0) {
  console.log("\n--- samples ---");
  console.log(samples.join("\n"));
}
if (write) {
  console.log(`\nbackup: ${backupRoot}`);
} else {
  console.log("\ndry run — re-run with --write to apply.");
}
