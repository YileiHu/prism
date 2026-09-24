// One-shot migration: move vault images to <vault>/attachments/<YYYY-MM-DD-HHmmss>.<ext>
// and rewrite note references (![[...]] wikilink embeds → standard ![](path)).
//
//   node scripts/migrate-attachments.mjs <vault...>          dry run
//   node scripts/migrate-attachments.mjs <vault...> --apply  execute (backs up first)
//
// Backups land in <vault>/.prism-backup-<ts>/ (dot-dir → skipped by the app's scanner).
import fs from "fs";
import path from "path";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"]);
const CLEAN_NAME = /^\d{4}-\d{2}-\d{2}-\d{6}(-\d+)?\.\w+$/;

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const vaults = args.filter((a) => !a.startsWith("--")).map((p) => path.resolve(p));

const pad = (n) => String(n).padStart(2, "0");

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

// Best-effort timestamp from the original filename, else the file's mtime
function stampFor(basename, mtime) {
  let m = /(\d{4})(\d{2})(\d{2})[-_ ]?(\d{2})(\d{2})(\d{2})/.exec(basename);
  if (m) return `${m[1]}-${m[2]}-${m[3]}-${m[4]}${m[5]}${m[6]}`;
  m = /(\d{2})-(\d{2})-(\d{2})[_ ](\d{2})-(\d{2})-(\d{2})/.exec(basename);
  if (m) return `20${m[1]}-${m[2]}-${m[3]}-${m[4]}${m[5]}${m[6]}`;
  return `${mtime.getFullYear()}-${pad(mtime.getMonth() + 1)}-${pad(mtime.getDate())}-${pad(mtime.getHours())}${pad(mtime.getMinutes())}${pad(mtime.getSeconds())}`;
}

// "target|mod" → [target, mod]; split on the first unescaped pipe
function splitWikilink(inner) {
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "|" && inner[i - 1] !== "\\") {
      return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
    }
  }
  return [inner.trim(), null];
}

// Relative path from the note's folder to a vault-relative target
function relFromNote(noteAbs, vaultAbs, vaultRelTarget) {
  const norm = (p) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const vaultN = norm(vaultAbs);
  let dir = norm(noteAbs);
  dir = dir.slice(0, dir.lastIndexOf("/"));
  if (dir === vaultN) dir = "";
  else if (dir.startsWith(vaultN + "/")) dir = dir.slice(vaultN.length + 1);
  const from = dir ? dir.split("/") : [];
  const toL = vaultRelTarget.toLowerCase().split("/");
  let i = 0;
  while (i < from.length && i < toL.length - 1 && from[i] === toL[i]) i++;
  return "../".repeat(from.length - i) + vaultRelTarget.split("/").slice(i).join("/");
}

const mdPath = (p) => (/[\s()]/.test(p) ? `<${p}>` : p);

for (const vault of vaults) {
  console.log(`\n===== ${vault} ${apply ? "(APPLY)" : "(dry run)"} =====`);
  if (!fs.existsSync(vault)) { console.log("  vault missing, skipped"); continue; }

  // 1) Collect images and build the move map
  const imageMap = new Map();   // old abs → new abs (identity for already-clean files)
  const byBasename = new Map(); // lowercase basename → abs[]
  const warnings = [];
  let moved = 0, alreadyClean = 0;
  const usedNames = new Set();

  for (const file of walk(vault)) {
    const ext = path.extname(file).slice(1).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    const base = path.basename(file);
    byBasename.set(base.toLowerCase(), [...(byBasename.get(base.toLowerCase()) ?? []), file]);
    const rel = path.relative(vault, file).replace(/\\/g, "/");
    if (CLEAN_NAME.test(base) && rel.startsWith("attachments/")) {
      imageMap.set(file, file);
      alreadyClean++;
      continue;
    }
    const stamp = stampFor(base, fs.statSync(file).mtime);
    let name = `${stamp}.${ext}`;
    let n = 2;
    while (usedNames.has(name.toLowerCase()) || fs.existsSync(path.join(vault, "attachments", name))) {
      name = `${stamp}-${n}.${ext}`;
      n++;
    }
    usedNames.add(name.toLowerCase());
    imageMap.set(file, path.join(vault, "attachments", name));
    moved++;
  }

  // 2) Scan notes and rewrite references
  const REF_RE = /(!\[\[[^\[\]\n]+?\]\])|(\[\[[^\[\]\n]+?\]\])|(!\[[^\]\n]*\]\([^)\n]*\))|(\[[^\]\n]+\]\([^)\n]+\))/g;
  const changedNotes = [];
  let refCount = 0;

  for (const note of walk(vault)) {
    if (!note.toLowerCase().endsWith(".md")) continue;
    const text = fs.readFileSync(note, "utf-8");
    let next = text;
    let noteHits = 0;

    next = next.replace(REF_RE, (match, embed, wikilink, mdImg, mdLink) => {
      let target, mod = null, prefix = "", alt = "", isEmbed = false;
      if (embed || wikilink) {
        isEmbed = Boolean(embed);
        // Inside markdown tables Obsidian escapes the separator as "\|" —
        // normalize first (image filenames never contain literal pipes)
        const inner = match.slice(isEmbed ? 3 : 2, -2).replace(/\\\|/g, "|");
        [target, mod] = splitWikilink(inner);
        prefix = isEmbed ? "!" : "";
        alt = mod && !/^\d+(x\d+)?$/.test(mod) ? mod : "";
      } else {
        const m = /^(!?)\[([^\]\n]*)\]\(([^)\n]*)\)$/.exec(match);
        prefix = m[1];
        alt = m[2];
        target = m[3].replace(/^<(.*)>$/, "$1");
      }
      let decoded = target;
      try { decoded = decodeURIComponent(target); } catch { /* raw */ }
      decoded = decoded.split("#")[0].trim();

      // Resolve: note-relative → vault-relative → unique basename
      const noteDir = path.dirname(note);
      let file = null;
      for (const cand of [path.resolve(noteDir, decoded), path.resolve(vault, decoded)]) {
        if (imageMap.has(cand)) { file = cand; break; }
      }
      if (!file) {
        const hits = byBasename.get(decoded.toLowerCase()) ?? [];
        if (hits.length === 1) file = hits[0];
        else if (hits.length > 1) warnings.push(`ambiguous basename, left as-is: ${decoded} (${note})`);
        else if (/\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i.test(decoded)) {
          warnings.push(`image ref has no matching file, left as-is: ${decoded} (${path.relative(vault, note)})`);
        }
      }
      if (!file) return match; // not an image we manage (plain note wikilink etc.)

      const newAbs = imageMap.get(file);
      const newRel = relFromNote(note, vault, path.relative(vault, newAbs).replace(/\\/g, "/"));
      if (isEmbed && mod && /^\d+(x\d+)?$/.test(mod)) {
        warnings.push(`size |${mod} dropped: ${path.basename(file)} (${path.relative(vault, note)})`);
      }
      refCount++;
      noteHits++;
      return `${prefix}[${alt}](${mdPath(newRel)})`;
    });

    if (noteHits > 0) changedNotes.push([note, text, next, noteHits]);
  }

  // 3) Report
  console.log(`images: ${moved} to move → attachments/, ${alreadyClean} already clean`);
  console.log(`notes:  ${changedNotes.length} to modify, ${refCount} refs rewritten`);
  for (const [note, , , hits] of changedNotes.slice(0, 8)) {
    console.log(`   ~ ${path.relative(vault, note)} (${hits} refs)`);
  }
  if (changedNotes.length > 8) console.log(`   … +${changedNotes.length - 8} more`);
  for (const w of warnings.slice(0, 12)) console.log(`   ! ${w}`);
  if (warnings.length > 12) console.log(`   ! … +${warnings.length - 12} more`);

  if (!apply) continue;

  // 4) Backup, then move + rewrite
  const ts = new Date();
  const backupDir = path.join(vault, `.prism-backup-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const backupAs = (abs) => {
    const rel = path.relative(vault, abs);
    const dest = path.join(backupDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(abs, dest);
  };

  for (const [oldAbs, newAbs] of imageMap) {
    if (oldAbs === newAbs) continue;
    backupAs(oldAbs);
    fs.mkdirSync(path.dirname(newAbs), { recursive: true });
    fs.renameSync(oldAbs, newAbs);
  }
  for (const [note, , next] of changedNotes) {
    backupAs(note);
    fs.writeFileSync(note, next, "utf-8");
  }
  console.log(`applied. backup: ${backupDir}`);
}
