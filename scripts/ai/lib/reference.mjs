// Shared source parsing and reference-document generation for Prism.
//
// Used by scripts/ai/gen-reference.mjs (writes docs/reference/*.md) and
// scripts/ai/check-docs.mjs (re-generates in memory and validates contracts).
//
// Rules for generated output:
//   - only stable facts: names, channels, keys, SQL, exports
//   - no line numbers, line counts, timestamps or mtimes
//   - deterministic ordering and LF newlines
//
// Only Node built-ins are used so the scripts run without npm install.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

export const SOURCES = {
  preload: "electron/preload.ts",
  main: "electron/main.ts",
  settings: "src/shared/settings.ts",
  database: "electron/database.ts",
  changelog: "src/data/changelog.ts",
  zh: "src/i18n/zh.ts",
  en: "src/i18n/en.ts",
  shortcuts: "src/shared/shortcuts.ts",
  settingsUiDir: "src/components/settings",
  shortcutsUi: "src/components/settings/ShortcutsSection.tsx",
  dataModelDoc: "docs/architecture/data-model.md",
  packageJson: "package.json",
};

export function read(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), "utf8");
}

export function exists(relPath) {
  return fs.existsSync(path.join(REPO_ROOT, relPath));
}

export function toPosix(value) {
  return value.replace(/\\/g, "/");
}

export function repoRel(absPath) {
  return toPosix(path.relative(REPO_ROOT, absPath));
}

/** Recursively list files under a repo-relative directory, sorted by path. */
export function walk(relDir, extensions) {
  const root = path.join(REPO_ROOT, relDir);
  if (!fs.existsSync(root)) return [];
  const allowed = new Set(extensions.map((ext) => ext.toLowerCase()));
  const out = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(abs);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (allowed.size === 0 || allowed.has(ext)) out.push(repoRel(abs));
      }
    }
  };
  visit(root);
  return out.sort();
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

/** Return the index just after the matching close bracket (does not skip strings). */
function matchBracket(text, openIndex) {
  const open = text[openIndex];
  const close = open === "{" ? "}" : open === "[" ? "]" : open === "(" ? ")" : null;
  if (!close) throw new Error(`matchBracket: not an opening bracket at ${openIndex}`);
  let depth = 0;
  let quote = null;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Split a JS object literal body into top-level entries.
 * Returns [{ key, value }] preserving source order.
 */
function objectEntries(body) {
  const entries = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  const push = (end) => {
    const raw = body.slice(start, end).trim();
    if (!raw) return;
    const colon = topLevelColon(raw);
    if (colon === -1) return;
    const key = raw
      .slice(0, colon)
      .trim()
      .replace(/^["']|["']$/g, "");
    const value = raw.slice(colon + 1).trim().replace(/,$/, "").trim();
    entries.push({ key, value });
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{" || ch === "[" || ch === "(") depth++;
    else if (ch === "}" || ch === "]" || ch === ")") depth--;
    else if (ch === ":" && depth === 0) {
      // handled by topLevelColon below; keep scanning for the entry end
    } else if (ch === "," && depth === 0) {
      push(i);
      start = i + 1;
    }
  }
  push(body.length);
  return entries;
}

function topLevelColon(raw) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{" || ch === "[" || ch === "(") depth++;
    else if (ch === "}" || ch === "]" || ch === ")") depth--;
    else if (ch === ":" && depth === 0) return i;
  }
  return -1;
}

/** Extract the body of the first object literal assigned after `marker`. */
function objectBodyAfter(text, marker) {
  const start = text.indexOf(marker);
  if (start === -1) throw new Error(`objectBodyAfter: marker not found: ${marker}`);
  const open = text.indexOf("{", start + marker.length);
  if (open === -1) throw new Error(`objectBodyAfter: no "{" after ${marker}`);
  const end = matchBracket(text, open);
  if (end === -1) throw new Error(`objectBodyAfter: unbalanced object after ${marker}`);
  return text.slice(open + 1, end - 1);
}

// ---------------------------------------------------------------------------
// Preload API (window.prism)
// ---------------------------------------------------------------------------

/**
 * Parse `electron/preload.ts`.
 * Returns groups of methods with their IPC channel, kind and parameter list.
 *
 * kind: "invoke" (renderer calls main) | "event" (main pushes to renderer)
 */
export function parsePreload(text = read(SOURCES.preload)) {
  const lines = text.split(/\r?\n/);
  const methods = [];
  let group = "API";
  let pendingGroup = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const comment = /^\s{2}\/\/ (.+)$/.exec(line);
    if (comment) {
      pendingGroup = comment[1].trim();
      continue;
    }
    const start = /^\s{2}([A-Za-z_$][\w$]*):\s*(.*)$/.exec(line);
    if (!start) continue;

    const name = start[1];
    const block = [start[2]];
    let j = i + 1;
    for (; j < lines.length; j++) {
      // A group comment belongs to the next method; leave it for the outer loop.
      if (/^\s{2}\/\/ /.test(lines[j])) break;
      if (/^\s{2}[A-Za-z_$][\w$]*:\s*/.test(lines[j]) || /^\};?\s*$/.test(lines[j])) break;
      block.push(lines[j]);
    }
    const body = block.join("\n");
    const invoke = /ipcRenderer\.invoke\(\s*"([^"]+)"/.exec(body);
    const event = /ipcRenderer\.on\(\s*"([^"]+)"/.exec(body);
    if (!invoke && !event) continue;

    const openParen = body.indexOf("(");
    let params = "";
    if (openParen !== -1) {
      const endParen = matchBracket(body, openParen);
      if (endParen !== -1) params = body.slice(openParen + 1, endParen - 1);
    }

    if (pendingGroup) {
      group = pendingGroup;
      pendingGroup = null;
    }
    methods.push({
      name,
      group,
      kind: invoke ? "invoke" : "event",
      channel: (invoke || event)[1],
      params: params.replace(/\s+/g, " ").trim(),
    });
    i = j - 1;
  }

  return {
    methods,
    invokeMethods: methods.filter((m) => m.kind === "invoke"),
    eventMethods: methods.filter((m) => m.kind === "event"),
    groups: [...new Set(methods.map((m) => m.group))],
  };
}

/** Parse ipcMain handlers and main→renderer push channels from main.ts. */
export function parseMain(text = read(SOURCES.main)) {
  const handles = new Set();
  for (const m of text.matchAll(/ipcMain\.handle\(\s*"([^"]+)"/g)) handles.add(m[1]);
  const sends = new Set();
  for (const m of text.matchAll(/webContents\.send\(\s*"([^"]+)"/g)) sends.add(m[1]);
  return { handles, sends };
}

// ---------------------------------------------------------------------------
// Settings registry
// ---------------------------------------------------------------------------

function parseMeta(value) {
  const kind = /kind:\s*"(\w+)"/.exec(value)?.[1] ?? "";
  const optionsRaw = /options:\s*\[([^\]]*)\]/.exec(value)?.[1] ?? "";
  const options = [...optionsRaw.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  const range = /range:\s*\{([^}]*)\}/.exec(value)?.[1] ?? "";
  const numbers = {};
  for (const key of ["min", "max", "step"]) {
    const m = new RegExp(`${key}:\\s*(-?[\\d.]+)`).exec(range);
    if (m) numbers[key] = Number(m[1]);
  }
  return { kind, options, range: numbers, raw: value };
}

export function parseSettings(text = read(SOURCES.settings)) {
  const defaultsBody = objectBodyAfter(text, "DEFAULT_SETTINGS");
  const metaBody = objectBodyAfter(text, "SETTING_META");
  const defaults = new Map(objectEntries(defaultsBody).map((e) => [e.key, e.value]));
  const meta = new Map(objectEntries(metaBody).map((e) => [e.key, parseMeta(e.value)]));
  return {
    defaults,
    meta,
    keys: [...defaults.keys()],
  };
}

/** Which settings UI files mention each setting key. */
export function parseSettingsUi(keys) {
  const files = walk(SOURCES.settingsUiDir, [".tsx"]);
  const texts = new Map(files.map((file) => [file, read(file)]));
  const result = new Map();
  const add = (key, file) => {
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(path.basename(file));
  };
  for (const file of files) {
    const text = texts.get(file);
    for (const key of keys) {
      const pattern = new RegExp(
        `(?:set\\(\\s*"${key}"|values\\.${key}\\b|"${key}"\\s*,)`,
      );
      if (pattern.test(text)) add(key, file);
    }
  }
  // NoteColors builds md_h1/… keys from a prefix, so the literal key never
  // appears in the source. Attribute the md_* group to that component.
  const noteColors = files.find((file) => path.basename(file) === "NoteColors.tsx");
  if (noteColors && texts.get(noteColors).includes("md_")) {
    for (const key of keys) {
      if (key.startsWith("md_") && !result.has(key)) add(key, noteColors);
    }
  }
  for (const value of result.values()) value.sort();
  return result;
}

// ---------------------------------------------------------------------------
// Database schema
// ---------------------------------------------------------------------------

function dedent(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const indents = lines.filter((line) => line.trim()).map((line) => /^ */.exec(line)[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(min)).join("\n").trim();
}

export function parseDatabase(text = read(SOURCES.database)) {
  const tables = [];
  const tableRe = /CREATE TABLE IF NOT EXISTS\s+(\w+)/g;
  for (const match of text.matchAll(tableRe)) {
    const open = text.indexOf("(", match.index + match[0].length);
    const end = matchBracket(text, open);
    if (end === -1) continue;
    tables.push({
      name: match[1],
      columns: dedent(text.slice(open + 1, end - 1)),
    });
  }

  const indexes = [...text.matchAll(
    /CREATE INDEX IF NOT EXISTS\s+(\w+)\s+ON\s+(\w+)\s*\(([^)]*)\)/g,
  )].map((m) => ({ name: m[1], table: m[2], columns: m[3].replace(/\s+/g, " ").trim() }));

  const alterations = [];
  for (const m of text.matchAll(/ALTER TABLE\s+(\w+)\s+([^;]+);/g)) {
    alterations.push(`${m[1]} | ${m[2].replace(/\s+/g, " ").trim()}`);
  }

  return { tables, indexes, alterations };
}

// ---------------------------------------------------------------------------
// Changelog, i18n, shortcuts, exports
// ---------------------------------------------------------------------------

export function parseChangelog(text = read(SOURCES.changelog)) {
  return [...text.matchAll(/version:\s*"([^"]+)"/g)].map((m) => m[1]);
}

export function parseI18n(text = read(SOURCES.zh)) {
  const entries = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*"([^"]+)":\s*"(.*)",?\s*$/.exec(line);
    if (!m) continue;
    entries.set(m[1], m[2]);
  }
  return entries;
}

export function placeholders(value) {
  return new Set([...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
}

export function parseShortcutActions(text = read(SOURCES.shortcuts)) {
  const body = /SHORTCUT_ACTIONS\s*=\s*\[([^\]]*)\]/s.exec(text)?.[1] ?? "";
  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** Top-level export names for one source file. */
export function parseExports(text) {
  const names = new Set();
  for (const m of text.matchAll(/^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(m[1]);
  }
  for (const m of text.matchAll(/^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(m[1]);
  }
  for (const m of text.matchAll(/^\s*export\s+(?:class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(m[1]);
  }
  for (const m of text.matchAll(/^\s*export\s+default\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(m[1]);
  }
  for (const m of text.matchAll(/^\s*export\s+default\s+([A-Za-z_$][\w$]*)\s*;/gm)) {
    names.add(m[1]);
  }
  for (const m of text.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  return [...names].sort();
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

export function collect() {
  const preload = parsePreload();
  const main = parseMain();
  const settings = parseSettings();
  const ui = parseSettingsUi(settings.keys);
  const database = parseDatabase();
  const changelog = parseChangelog();
  const zh = parseI18n(read(SOURCES.zh));
  const en = parseI18n(read(SOURCES.en));
  const shortcutActions = parseShortcutActions();
  const packageJson = JSON.parse(read(SOURCES.packageJson));
  return {
    preload,
    main,
    settings,
    settingsUi: ui,
    database,
    changelog,
    i18n: { zh, en },
    shortcutActions,
    version: packageJson.version,
    scripts: packageJson.scripts ?? {},
  };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const BANNER = (sources) =>
  `<!-- AUTO-GENERATED by \`npm run docs\` from ${sources}. Do not edit by hand. -->\n`;

function cell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>")
    .trim();
}

function safeSourceLink(relPath, label) {
  return `[${label ?? relPath}](../../${relPath})`;
}

export function generateIpc(data) {
  const { preload, main } = data;
  const lines = [];
  lines.push(BANNER("`electron/preload.ts` and `electron/main.ts`"));
  lines.push("# IPC 参考（window.prism）");
  lines.push("");
  lines.push(
    "Renderer 只能通过 `window.prism` 访问主进程；本文件由源码生成，通道与 handler 的一致性由 `npm run docs:check` 保证。",
  );
  lines.push("");
  lines.push("## 总览");
  lines.push("");
  lines.push(`- Renderer 方法：**${preload.methods.length}**（invoke ${preload.invokeMethods.length} / event ${preload.eventMethods.length}）`);
  lines.push(`- main 处理器：**${main.handles.size}**`);
  lines.push(`- main 推送事件：**${main.sends.size}**`);
  lines.push("");
  lines.push(`源码：${safeSourceLink("electron/preload.ts", "preload.ts")} · ${safeSourceLink("electron/main.ts", "main.ts")}`);
  lines.push("");
  lines.push("## Renderer 方法");
  lines.push("");
  for (const group of preload.groups) {
    const methods = preload.methods.filter((m) => m.group === group);
    lines.push(`### ${group}`);
    lines.push("");
    lines.push("| Renderer 方法 | 通道 | 方向 | 参数 | main handler |");
    lines.push("|---|---|---|---|---|");
    for (const method of methods) {
      const direction = method.kind === "invoke" ? "renderer → main" : "main → renderer";
      const handler = method.kind === "invoke"
        ? (main.handles.has(method.channel) ? "✓" : "—")
        : "—";
      lines.push(
        `| \`${method.name}\` | \`${method.channel}\` | ${direction} | ${cell(method.params) || "—"} | ${handler} |`,
      );
    }
    lines.push("");
  }
  lines.push("## main 推送事件");
  lines.push("");
  lines.push("| 事件通道 | 是否在 preload 订阅 | 订阅方法 |");
  lines.push("|---|---|---|");
  const eventByChannel = new Map(preload.eventMethods.map((m) => [m.channel, m.name]));
  for (const channel of [...main.sends].sort()) {
    const method = eventByChannel.get(channel);
    lines.push(`| \`${channel}\` | ${method ? "✓" : "—"} | ${method ? `\`${method}\`` : "—"} |`);
  }
  lines.push("");
  return lines.join("\n");
}

export function generateSettings(data) {
  const { settings, settingsUi } = data;
  const lines = [];
  lines.push(BANNER("`src/shared/settings.ts` and `src/components/settings/*.tsx`"));
  lines.push("# 设置项参考");
  lines.push("");
  lines.push(
    "注册表在 `src/shared/settings.ts`：默认值、校验与编解码都从这里出发。新增设置项后重新运行 `npm run docs`。",
  );
  lines.push("");
  lines.push(`共 **${settings.keys.length}** 个注册项。`);
  lines.push("");
  lines.push("| 键 | 类型 | 默认值 | 范围 / 选项 | 设置界面 |");
  lines.push("|---|---|---|---|---|");
  for (const key of settings.keys) {
    const meta = settings.meta.get(key) ?? { kind: "unknown", options: [], range: {} };
    const type = meta.kind || "unknown";
    let range = "—";
    if (meta.options?.length) range = meta.options.join(" / ");
    else if (meta.range && Object.keys(meta.range).length) {
      range = `min ${meta.range.min ?? "?"} / max ${meta.range.max ?? "?"} / step ${meta.range.step ?? "?"}`;
    }
    const ui = settingsUi.get(key) ?? [];
    lines.push(
      `| \`${key}\` | ${type} | ${cell(settings.defaults.get(key) ?? "—")} | ${cell(range)} | ${ui.length ? ui.map((f) => `\`${f}\``).join(", ") : "—"} |`,
    );
  }
  lines.push("");
  lines.push("> `vault_paths`、`workspace_v1`、`last_coll_*`、`image_path_style`、`browser_path` 等运行键直接以 settings 行存取，不属于 `AppSettings` 注册表；见 `docs/architecture/data-model.md`。");
  lines.push("");
  return lines.join("\n");
}

export function generateDatabase(data) {
  const { database } = data;
  const lines = [];
  lines.push(BANNER("`electron/database.ts`"));
  lines.push("# 数据库参考");
  lines.push("");
  lines.push(
    `SQLite 文件位于 Electron \`userData/prism.db\`，WAL 模式。本文件直接抽取建表语句，共 **${database.tables.length}** 张表；语义与迁移说明见 \`docs/architecture/data-model.md\`。`,
  );
  lines.push("");
  lines.push(`源码：${safeSourceLink("electron/database.ts", "database.ts")}`);
  lines.push("");
  lines.push("## 表");
  lines.push("");
  for (const table of database.tables) {
    lines.push(`### \`${table.name}\``);
    lines.push("");
    lines.push("```sql");
    lines.push(table.columns);
    lines.push("```");
    lines.push("");
  }
  lines.push("## 索引");
  lines.push("");
  if (database.indexes.length === 0) {
    lines.push("（无）");
  } else {
    lines.push("| 索引 | 表 | 列 |");
    lines.push("|---|---|---|");
    for (const index of database.indexes) {
      lines.push(`| \`${index.name}\` | \`${index.table}\` | ${cell(index.columns)} |`);
    }
  }
  lines.push("");
  lines.push("## 迁移语句");
  lines.push("");
  if (database.alterations.length === 0) {
    lines.push("（无）");
  } else {
    for (const alteration of database.alterations) {
      lines.push(`- \`${alteration}\``);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function generateCodeMap() {
  const files = [
    ...walk("src", [".ts", ".tsx"]),
    ...walk("electron", [".ts", ".tsx"]),
    ...walk("scripts", [".mjs", ".js"]),
  ];
  const groups = new Map();
  for (const file of files) {
    const text = read(file);
    const exports = parseExports(text);
    const dir = path.posix.dirname(file);
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push({ file, exports });
  }
  const lines = [];
  lines.push(BANNER("`src/**`, `electron/**` and `scripts/**`"));
  lines.push("# 代码地图");
  lines.push("");
  lines.push(
    "按目录列出源文件与顶层导出符号，用于定位；不含行号或行数（那些会随日常编辑漂移）。",
  );
  lines.push("");
  for (const dir of [...groups.keys()].sort()) {
    lines.push(`## \`${dir}/\``);
    lines.push("");
    for (const item of groups.get(dir).sort((a, b) => a.file.localeCompare(b.file))) {
      const name = path.posix.basename(item.file);
      const suffix = item.exports.length ? ` — ${item.exports.map((n) => `\`${n}\``).join(", ")}` : "";
      lines.push(`- \`${name}\`${suffix}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function generateAll(data = collect()) {
  return {
    "docs/reference/ipc.md": generateIpc(data),
    "docs/reference/settings.md": generateSettings(data),
    "docs/reference/database.md": generateDatabase(data),
    "docs/reference/code-map.md": generateCodeMap(),
  };
}
