// Prune unreferenced images from <vault>/attachments/.
// A file is "referenced" when some note (.md) or canvas (.canvas) points at it
// via a standard link path (resolved note-relative/vault-relative) or a
// wikilink basename.
//
//   node scripts/prune-attachments.mjs <vault...>          dry run (default)
//   node scripts/prune-attachments.mjs <vault...> --apply  move candidates
//                                                          to .prism-pruned-<ts>/
import fs from "fs";
import path from "path";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"]);

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const vaults = args.filter((a) => !a.startsWith("--")).map((p) => path.resolve(p));

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}

for (const vault of vaults) {
  console.log(`\n===== ${vault} ${apply ? "(APPLY)" : "(dry run)"} =====`);
  const attDir = path.join(vault, "attachments");
  if (!fs.existsSync(attDir)) { console.log("no attachments/ dir, skipped"); continue; }

  const candidates = new Map(); // abs → size
  for (const f of walk(attDir)) {
    const ext = path.extname(f).slice(1).toLowerCase();
    if (IMAGE_EXTS.has(ext)) candidates.set(f, fs.statSync(f).size);
  }

  const referenced = new Set();
  const mark = (abs) => { if (candidates.has(abs)) referenced.add(abs); };
  const markBasename = (base) => {
    const low = base.toLowerCase();
    for (const abs of candidates.keys()) {
      if (path.basename(abs).toLowerCase() === low) referenced.add(abs);
    }
  };

  for (const file of walk(vault)) {
    const lower = file.toLowerCase();
    if (!(lower.endsWith(".md") || lower.endsWith(".canvas"))) continue;
    const text = fs.readFileSync(file, "utf-8");
    const noteDir = path.dirname(file);
    // Standard links: ![](path) / [t](path), optional <...> wrapping
    for (const m of text.matchAll(/!?\[[^\]\n]*\]\(<?([^)>\n]+)>?\)/g)) {
      let p = m[1].split("#")[0].trim();
      try { p = decodeURIComponent(p); } catch { /* raw */ }
      if (!p || /^[a-z]+:/i.test(p)) continue; // URL / prism-file scheme
      mark(path.resolve(noteDir, p));
      mark(path.resolve(vault, p));
    }
    // Wikilinks: [[name]] / [[name|mod]] — basename match (conservative)
    for (const m of text.matchAll(/\[\[([^\[\]\n]+?)\]\]/g)) {
      const target = m[1].replace(/\\\|/g, "|").split("|")[0].split("#")[0].trim();
      if (target) markBasename(target);
    }
  }

  const dead = [...candidates.keys()].filter((f) => !referenced.has(f));
  const deadSize = dead.reduce((s, f) => s + candidates.get(f), 0);
  const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  console.log(`attachments/: ${candidates.size} images, ${referenced.size} referenced, ${dead.length} unreferenced (${mb(deadSize)})`);
  for (const f of dead.slice(0, 15)) console.log(`   - ${path.basename(f)} (${mb(candidates.get(f))})`);
  if (dead.length > 15) console.log(`   … +${dead.length - 15} more`);
  if (!apply || dead.length === 0) continue;

  const ts = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dest = path.join(vault, `.prism-pruned-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`);
  fs.mkdirSync(dest, { recursive: true });
  for (const f of dead) fs.renameSync(f, path.join(dest, path.basename(f)));
  console.log(`moved ${dead.length} files → ${dest} (delete that folder when satisfied)`);
}
