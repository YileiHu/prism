// Verify every standard image link ![](path) in a vault's notes resolves to
// an existing file. Usage: node scripts/verify-attachments.mjs <vault...>
import fs from "fs";
import path from "path";

let ok = 0, bad = 0;
for (const vault of process.argv.slice(2)) {
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (full.toLowerCase().endsWith(".md")) {
        const text = fs.readFileSync(full, "utf-8");
        for (const m of text.matchAll(/!\[[^\]]*\]\(<?([^)>]+)>?\)/g)) {
          try {
            const p = path.resolve(path.dirname(full), decodeURIComponent(m[1]));
            if (fs.existsSync(p)) ok++;
            else { bad++; console.log(`BROKEN: ${m[0]} in ${path.relative(vault, full)}`); }
          } catch { bad++; console.log(`UNPARSEABLE: ${m[0]} in ${path.relative(vault, full)}`); }
        }
      }
    }
  })(path.resolve(vault));
}
console.log(`ok: ${ok}, broken: ${bad}`);
process.exit(bad ? 1 : 0);
