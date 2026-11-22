"use strict";

// Prism-side knowledge for the canvas MCP server: find the app's settings,
// resolve vaults and canvas JSON files, and read/write them safely.
//
// The server never edits Prism's SQLite database. It only reads the settings
// table (vault_paths + canvas_dir) to discover where whiteboards live, then
// treats each whiteboard as the plain JSON file Prism already reads and writes.
// Private vaults hold encrypted content, so they are refused here.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createCanvasDoc,
  parseCanvas,
  serializeCanvas,
} = require("./lib/model.js");

const DEFAULT_CANVAS_DIR = "canvases";
const LEGACY_PROJECT_DIR = "Projects";

function toolError(code, message, extra) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  if (extra) error.details = extra;
  return error;
}

function normalizeForCompare(value) {
  const resolved = path.resolve(value);
  const trimmed = resolved.length > 3 ? resolved.replace(/[\\/]+$/, "") : resolved;
  return process.platform === "win32" ? trimmed.toLowerCase() : trimmed;
}

function samePath(a, b) {
  return normalizeForCompare(a) === normalizeForCompare(b);
}

function isPathInside(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function prismUserDataDir() {
  if (process.env.PRISM_USER_DATA) return path.resolve(process.env.PRISM_USER_DATA);
  const home = os.homedir();
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "prism");
  }
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "prism");
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "prism");
}

function prismDbPath() {
  return process.env.PRISM_DB ? path.resolve(process.env.PRISM_DB) : path.join(prismUserDataDir(), "prism.db");
}

function readPrismSettings() {
  const dbPath = prismDbPath();
  if (!fs.existsSync(dbPath)) {
    throw toolError(
      "PRISM_DB_MISSING",
      `Prism settings database not found at ${dbPath}. Start Prism once, or set PRISM_DB / PRISM_USER_DATA.`,
    );
  }
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require("node:sqlite"));
  } catch {
    throw toolError("NODE_SQLITE_MISSING", "This Node.js runtime has no node:sqlite module (Node 22.5+ is required).");
  }
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = db.prepare("SELECT key, value FROM settings").all();
    const settings = new Map(rows.map((row) => [String(row.key), String(row.value ?? "")]));
    return { dbPath, settings };
  } finally {
    db.close();
  }
}

// Mirrors electron/main.ts resolveCanvasDir: a vault-relative folder, rejecting
// absolute paths, drive letters and "..", with "canvases" as the fallback.
function sanitizeCanvasDir(raw) {
  const value = String(raw ?? "").replace(/\\/g, "/").trim();
  const segments = value.split("/").filter((segment) => segment && segment !== ".");
  if (segments.length === 0 || segments.includes("..") || path.isAbsolute(value) || /^[a-zA-Z]:/.test(value)) {
    return DEFAULT_CANVAS_DIR;
  }
  return segments.join("/");
}

function readVaultList() {
  if (process.env.PRISM_CANVAS_VAULTS) {
    let parsed;
    try {
      parsed = JSON.parse(process.env.PRISM_CANVAS_VAULTS);
    } catch (error) {
      throw toolError("BAD_VAULT_CONFIG", `PRISM_CANVAS_VAULTS is not valid JSON: ${error.message}`);
    }
    if (!Array.isArray(parsed)) throw toolError("BAD_VAULT_CONFIG", "PRISM_CANVAS_VAULTS must be a JSON array.");
    return { vaults: parsed, canvasDir: process.env.PRISM_CANVAS_DIR || DEFAULT_CANVAS_DIR, source: "env" };
  }
  const { settings } = readPrismSettings();
  let parsed = [];
  try {
    parsed = JSON.parse(settings.get("vault_paths") || "[]");
  } catch {
    parsed = [];
  }
  if (!Array.isArray(parsed)) parsed = [];
  return {
    vaults: parsed,
    canvasDir: settings.get("canvas_dir") || DEFAULT_CANVAS_DIR,
    source: "prism",
  };
}

function loadVaults() {
  const { vaults: raw, canvasDir, source } = readVaultList();
  const relativeDir = sanitizeCanvasDir(canvasDir);
  const seen = new Set();
  const vaults = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const vaultPath = typeof entry.path === "string" ? entry.path : "";
    if (!vaultPath) continue;
    const resolved = path.resolve(vaultPath);
    const key = normalizeForCompare(resolved);
    if (seen.has(key)) continue;
    seen.add(key);
    const name = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : path.basename(resolved);
    let exists = false;
    try {
      exists = fs.statSync(resolved).isDirectory();
    } catch {
      exists = false;
    }
    const privateMarker = path.join(resolved, ".prism", "private.json");
    const isPrivate = entry.private === true || fs.existsSync(privateMarker);
    vaults.push({
      name,
      path: resolved,
      private: isPrivate,
      exists,
      canvasDir: relativeDir,
      canvasDirPath: path.join(resolved, ...relativeDir.split("/")),
      source,
    });
  }
  return vaults;
}

function resolveVault(vaultRef) {
  const vaults = loadVaults();
  const name = typeof vaultRef === "string" ? vaultRef.trim() : "";
  if (!name) {
    const list = vaults.map((vault) => `${vault.name} (${vault.path})`).join("; ");
    throw toolError("VAULT_REQUIRED", `Specify a vault. Available vaults: ${list || "none configured in Prism"}.`);
  }
  const needle = normalizeForCompare(name);
  const match = vaults.find(
    (vault) =>
      normalizeForCompare(vault.path) === needle ||
      normalizeForCompare(vault.name) === needle ||
      normalizeForCompare(path.basename(vault.path)) === needle,
  );
  if (!match) {
    const list = vaults.map((vault) => vault.name).join(", ");
    throw toolError("VAULT_NOT_FOUND", `No vault matches "${name}". Available vaults: ${list || "none"}.`);
  }
  if (match.private) {
    throw toolError(
      "VAULT_PRIVATE",
      `Vault "${match.name}" is a private (encrypted) vault; its canvas files cannot be edited from outside Prism.`,
    );
  }
  if (!match.exists) {
    throw toolError("VAULT_MISSING", `Vault folder does not exist: ${match.path}`);
  }
  return match;
}

function canvasTitle(filePath) {
  return path.basename(filePath).replace(/\.json$/i, "");
}

function relativeInsideVault(vault, filePath) {
  return path.relative(vault.path, filePath).split(path.sep).join("/");
}

function isAllowedCanvasPath(vault, filePath) {
  return (
    isPathInside(vault.canvasDirPath, filePath) ||
    isPathInside(path.join(vault.path, LEGACY_PROJECT_DIR), filePath)
  );
}

function listCanvasFiles(vault) {
  const files = new Map();
  const addDir = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
      const filePath = path.join(dir, entry.name);
      let modifiedAt = 0;
      try {
        modifiedAt = fs.statSync(filePath).mtimeMs;
      } catch {
        continue;
      }
      files.set(normalizeForCompare(filePath), {
        path: filePath,
        title: canvasTitle(filePath),
        relPath: relativeInsideVault(vault, filePath),
        modifiedAt,
      });
    }
  };
  addDir(vault.canvasDirPath);
  const legacyRoot = path.join(vault.path, LEGACY_PROJECT_DIR);
  try {
    for (const entry of fs.readdirSync(legacyRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) addDir(path.join(legacyRoot, entry.name));
    }
  } catch {
    // No legacy project folders.
  }
  return Array.from(files.values()).sort((a, b) => b.modifiedAt - a.modifiedAt);
}

function resolveCanvasFile(vault, canvasRef) {
  const ref = typeof canvasRef === "string" ? canvasRef.trim() : "";
  if (!ref) {
    throw toolError("CANVAS_REQUIRED", `Specify a canvas by title or path. Use canvas_list with vault "${vault.name}" first.`);
  }
  const looksLikePath = ref.includes("/") || ref.includes("\\") || ref.toLowerCase().endsWith(".json");
  if (looksLikePath) {
    const absolute = path.isAbsolute(ref) ? ref : path.join(vault.path, ...ref.split(/[\\/]/));
    const filePath = path.resolve(absolute);
    return assertCanvasPath(vault, filePath);
  }
  const matches = listCanvasFiles(vault).filter(
    (file) => file.title.toLowerCase() === ref.toLowerCase(),
  );
  if (matches.length === 0) {
    throw toolError(
      "CANVAS_NOT_FOUND",
      `No canvas titled "${ref}" in vault "${vault.name}". Use canvas_list to see available boards.`,
    );
  }
  if (matches.length > 1) {
    throw toolError(
      "CANVAS_AMBIGUOUS",
      `More than one canvas is titled "${ref}"; pass the relPath instead: ${matches.map((file) => file.relPath).join(", ")}`,
    );
  }
  return { vault, path: matches[0].path, title: matches[0].title };
}

function assertCanvasPath(vault, filePath) {
  if (!filePath.toLowerCase().endsWith(".json")) {
    throw toolError("CANVAS_INVALID", `Whiteboards must be .json files: ${filePath}`);
  }
  if (!isPathInside(vault.path, filePath)) {
    throw toolError("CANVAS_OUTSIDE_VAULT", `Canvas path is outside vault "${vault.name}": ${filePath}`);
  }
  if (!isAllowedCanvasPath(vault, filePath)) {
    throw toolError(
      "CANVAS_OUTSIDE_VAULT",
      `Canvas must live under ${vault.canvasDirPath} (or a legacy Projects/<name>/ folder): ${filePath}`,
    );
  }
  return { vault, path: filePath, title: canvasTitle(filePath) };
}

function readCanvasFile(vault, filePath) {
  if (!fs.existsSync(filePath)) throw toolError("CANVAS_MISSING", `Canvas file no longer exists: ${filePath}`);
  const stat = fs.statSync(filePath);
  const json = fs.readFileSync(filePath, "utf8");
  const parsed = parseCanvas(json);
  return { json, stat, parsed };
}

function uniqueCanvasName(dir, title) {
  const safeName = String(title ?? "").trim().replace(/[<>:"/\\|?*]/g, "-") || "Untitled";
  let fileName = `${safeName}.json`;
  let filePath = path.join(dir, fileName);
  let counter = 1;
  while (fs.existsSync(filePath)) {
    fileName = `${safeName} ${counter}.json`;
    filePath = path.join(dir, fileName);
    counter++;
  }
  return { path: filePath, title: counter > 1 ? `${safeName} ${counter - 1}` : safeName };
}

function createCanvasFile(vault, title, doc) {
  const dir = vault.canvasDirPath;
  fs.mkdirSync(dir, { recursive: true });
  const target = uniqueCanvasName(dir, title);
  const json = serializeCanvas(parseCanvas(JSON.stringify(doc)).doc);
  fs.writeFileSync(target.path, json, "utf8");
  const stat = fs.statSync(target.path);
  return {
    vault,
    path: target.path,
    title: target.title,
    relPath: relativeInsideVault(vault, target.path),
    modifiedAt: stat.mtimeMs,
  };
}

// Atomic write: unique sibling temp file then rename, the same shape Prism uses,
// so a crash cannot leave half a document and Prism's mtime conflict check keeps
// working. `expectedModifiedAt` refuses to clobber a file edited in the meantime.
function writeCanvasFile(vault, filePath, doc, expectedModifiedAt) {
  if (!fs.existsSync(filePath)) throw toolError("CANVAS_MISSING", `Canvas file no longer exists: ${filePath}`);
  const before = fs.statSync(filePath);
  if (
    expectedModifiedAt !== null &&
    expectedModifiedAt !== undefined &&
    Math.abs(before.mtimeMs - expectedModifiedAt) > 0.5
  ) {
    throw toolError(
      "CANVAS_CONFLICT",
      `The canvas changed on disk after it was read (expected mtime ${expectedModifiedAt}, found ${before.mtimeMs}). Re-read it and apply the edit again.`,
    );
  }
  const json = serializeCanvas(parseCanvas(JSON.stringify(doc)).doc);
  const tempPath = `${filePath}.${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    fs.writeFileSync(tempPath, json, "utf8");
    const current = fs.statSync(filePath);
    if (Math.abs(current.mtimeMs - before.mtimeMs) > 0.5) {
      throw toolError(
        "CANVAS_CONFLICT",
        "The canvas changed on disk while this edit was being prepared. Re-read it and retry.",
      );
    }
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Best effort.
    }
    throw error;
  }
  const after = fs.statSync(filePath);
  return { modifiedAt: after.mtimeMs, json };
}

function emptyDoc() {
  return createCanvasDoc();
}

module.exports = {
  DEFAULT_CANVAS_DIR,
  LEGACY_PROJECT_DIR,
  emptyDoc,
  toolError,
  prismDbPath,
  prismUserDataDir,
  loadVaults,
  resolveVault,
  listCanvasFiles,
  resolveCanvasFile,
  assertCanvasPath,
  readCanvasFile,
  createCanvasFile,
  writeCanvasFile,
  canvasTitle,
  relativeInsideVault,
  isPathInside,
  samePath,
};
