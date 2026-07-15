import fs from "fs";
import path from "path";

const VAULT_PATH = "D:/MyDocuments/Obsidian/知识资料";

// ---- Parse .base files ----

function parseBaseFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const name = path.basename(filePath, ".base").replace(/^[^\w一-鿿]+/, "").trim();

  // Extract all file.hasTag("...") calls from the raw text
  const tags = [];
  const tagRegex = /file\.hasTag\("(.+?)"\)/g;
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    if (!tags.includes(match[1])) tags.push(match[1]);
  }

  if (tags.length === 0) return null;
  return { name, tags };
}

// ---- Scan .md files for tags ----

function scanMarkdownFiles(dirPath) {
  const results = []; // { relativePath, tags: string[] }

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".")) walk(fullPath);
      } else if (entry.name.endsWith(".md")) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const tagSet = new Set();

          // YAML frontmatter tags
          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (fmMatch) {
            const fm = fmMatch[1];
            const inlineList = fm.match(/^tags:\s*\[(.+?)\]\s*$/m);
            if (inlineList) {
              inlineList[1].split(",").forEach((t) => {
                const tag = t.trim().replace(/^["']|["']$/g, "");
                if (tag) tagSet.add(tag);
              });
            }
            const listMatch = fm.match(/^tags:\s*\n((?:\s+-\s+.+\n?)+)/m);
            if (listMatch) {
              const items = listMatch[1].match(/-\s*(.+)/g);
              if (items) {
                items.forEach((t) => {
                  const tag = t.replace(/^-\s*/, "").trim().replace(/^["']|["']$/g, "");
                  if (tag) tagSet.add(tag);
                });
              }
            }
          }

          // Inline #tags (strip code blocks)
          const bodyStart = fmMatch ? fmMatch[0].length : 0;
          let body = content.slice(bodyStart);
          body = body.replace(/```[\s\S]*?```/g, "");
          body = body.replace(/`[^`]+`/g, "");
          const bodyTags = body.match(/(?:^|\s)#([\w一-鿿\p{L}-]+)/gu) || [];
          bodyTags.forEach((t) => {
            const tag = t.trim().replace(/^#/, "");
            if (tag && /[\p{L}]/u.test(tag) && !/^\d+$/.test(tag)) tagSet.add(tag);
          });

          if (tagSet.size > 0) {
            const relPath = path.relative(dirPath, fullPath).replace(/\\/g, "/");
            results.push({ relativePath: relPath, tags: Array.from(tagSet) });
          }
        } catch {
          // skip
        }
      }
    }
  }

  walk(dirPath);
  return results;
}

// ---- Main ----

console.log("Reading .base files from:", VAULT_PATH);

const baseFiles = fs.readdirSync(VAULT_PATH)
  .filter((f) => f.endsWith(".base"))
  .map((f) => path.join(VAULT_PATH, f));

console.log(`Found ${baseFiles.length} .base files\n`);

const rules = baseFiles
  .map(parseBaseFile)
  .filter(Boolean);

console.log("Classification rules:");
for (const rule of rules) {
  console.log(`  ${rule.name} ← tags: [${rule.tags.join(", ")}]`);
}

console.log("\nScanning markdown files...");
const notes = scanMarkdownFiles(VAULT_PATH);
console.log(`Found ${notes.length} notes with tags\n`);

// Match notes to collections, auto-group by secondary tags
const collections = rules.map((rule) => {
  const filterTagsLower = rule.tags.map((t) => t.toLowerCase());

  // Find matching notes with their full tag info
  const matched = notes.filter((note) =>
    filterTagsLower.some((ft) =>
      note.tags.some((nt) => nt.toLowerCase() === ft)
    )
  );

  // Group by secondary tag (first tag that's not a filter tag)
  const groupMap = new Map(); // groupName → notePaths[]
  const ungrouped = [];

  for (const note of matched) {
    const secondary = note.tags.find(
      (nt) => !filterTagsLower.includes(nt.toLowerCase())
    );
    if (secondary) {
      if (!groupMap.has(secondary)) groupMap.set(secondary, []);
      groupMap.get(secondary).push(note.relativePath);
    } else {
      ungrouped.push(note.relativePath);
    }
  }

  // Build groups sorted by note count desc
  const groups = Array.from(groupMap.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, paths]) => ({
      id: crypto.randomUUID().slice(0, 8),
      name,
      notePaths: paths.sort(),
    }));

  const sortedUngrouped = ungrouped.sort();

  console.log(`  ${rule.name}: ${matched.length} notes → ${groups.length} groups + ${sortedUngrouped.length} ungrouped`);
  for (const g of groups) {
    console.log(`    ${g.name}: ${g.notePaths.length} notes`);
  }

  return {
    id: crypto.randomUUID().slice(0, 8),
    name: rule.name,
    notePaths: sortedUngrouped,
    groups: groups.length > 0 ? groups : undefined,
  };
});

// Write collections.json
const outputData = {
  version: 2,
  collections,
};

const prismDir = path.join(VAULT_PATH, ".prism");
if (!fs.existsSync(prismDir)) fs.mkdirSync(prismDir, { recursive: true });

const outputPath = path.join(prismDir, "collections.json");
fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), "utf-8");

console.log(`\nWritten to: ${outputPath}`);
console.log(`Total collections: ${collections.length}`);
console.log(
  `Total note references: ${collections.reduce((sum, c) => sum + c.notePaths.length, 0)}`
);
