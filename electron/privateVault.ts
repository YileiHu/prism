// Private vault support: per-vault data key wrapped by a password-derived key,
// per-file AES-256-GCM, in-memory unlock sessions with idle relock, and the
// filesystem helpers used to encrypt/decrypt an existing vault in place.
//
// On-disk file format (all multi-byte fields big-endian-free, fixed order):
//   "PVD1" | version(1) | nonce(12) | tag(16) | ciphertext
// The magic makes legacy plaintext detectable, so an interrupted migration can
// still be opened and resumed. Filenames stay plaintext by design.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { pathKey } from "./paths";

const MAGIC = Buffer.from("PVD1", "ascii");
const FORMAT_VERSION = 1;
const NONCE_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const SALT_LEN = 16;
const HEADER_LEN = MAGIC.length + 1 + NONCE_LEN + TAG_LEN;
const KDF = { name: "scrypt" as const, N: 32768, r: 8, p: 1 };
const SCRYPT_MAXMEM = 128 * 1024 * 1024;
const CACHE_LIMIT_BYTES = 96 * 1024 * 1024;

const scryptAsync = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

export interface VaultMetaWrap {
  type: "password" | "recovery";
  nonce: string;
  tag: string;
  ct: string;
}

export interface VaultMeta {
  version: 1;
  kdf: { name: "scrypt"; N: number; r: number; p: number; salt: string };
  wraps: VaultMetaWrap[];
}

interface VaultSession {
  dek: Buffer;
  ops: number;
  lastActive: number;
  timer: ReturnType<typeof setTimeout> | null;
  locking: boolean;
}

interface AssetCacheEntry {
  mtimeMs: number;
  data: Buffer;
}

export type ProgressFn = (done: number, total: number) => void;

const sessions = new Map<string, VaultSession>();
const assetCache = new Map<string, AssetCacheEntry>();
let assetCacheBytes = 0;
let idleMinutesProvider: () => number = () => 10;
let lockListener: (vaultPath: string) => void = () => {};
let unlockListener: (vaultPath: string) => void = () => {};

export function normalizeVaultPath(vaultPath: string): string {
  return pathKey(vaultPath);
}

export function markerPath(vaultPath: string): string {
  return path.join(vaultPath, ".prism", "private.json");
}

export function isPrivateVault(vaultPath: string): boolean {
  try {
    return fs.statSync(markerPath(vaultPath)).isFile();
  } catch {
    return false;
  }
}

export function listPrivateVaultRoots(vaultPaths: string[]): string[] {
  return vaultPaths.filter((vaultPath) => isPrivateVault(vaultPath));
}

export function setIdleMinutesProvider(fn: () => number): void {
  idleMinutesProvider = fn;
}

export function setLockListener(fn: (vaultPath: string) => void): void {
  lockListener = fn;
}

export function setUnlockListener(fn: (vaultPath: string) => void): void {
  unlockListener = fn;
}

// ---- Meta / key wrapping ----

function readMetaRaw(vaultPath: string): VaultMeta {
  const meta = JSON.parse(fs.readFileSync(markerPath(vaultPath), "utf-8")) as VaultMeta;
  if (!meta || meta.version !== 1 || !meta.kdf || !Array.isArray(meta.wraps)) {
    throw new Error("CRYPTO_INVALID");
  }
  return meta;
}

export function readMeta(vaultPath: string): VaultMeta | null {
  try {
    return readMetaRaw(vaultPath);
  } catch {
    return null;
  }
}

function writeMetaAtomic(vaultPath: string, meta: VaultMeta): void {
  const file = markerPath(vaultPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(meta, null, 2), "utf-8");
    fs.renameSync(temp, file);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch { /* ignore */ }
    throw error;
  }
}

async function deriveKek(password: string, kdf: VaultMeta["kdf"]): Promise<Buffer> {
  return scryptAsync(password, Buffer.from(kdf.salt, "base64"), KEY_LEN, {
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
    maxmem: SCRYPT_MAXMEM,
  });
}

function wrapKey(kek: Buffer, dek: Buffer): VaultMetaWrap {
  const nonce = crypto.randomBytes(NONCE_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", kek, nonce);
  const ct = Buffer.concat([cipher.update(dek), cipher.final()]);
  return {
    type: "password",
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ct: ct.toString("base64"),
  };
}

function unwrapKey(kek: Buffer, wrap: VaultMetaWrap): Buffer {
  const decipher = crypto.createDecipheriv("aes-256-gcm", kek, Buffer.from(wrap.nonce, "base64"));
  decipher.setAuthTag(Buffer.from(wrap.tag, "base64"));
  const dek = Buffer.concat([decipher.update(Buffer.from(wrap.ct, "base64")), decipher.final()]);
  if (dek.length !== KEY_LEN) throw new Error("CRYPTO_INVALID");
  return dek;
}

function passwordWrap(meta: VaultMeta): VaultMetaWrap {
  const wrap = meta.wraps.find((entry) => entry.type === "password");
  if (!wrap) throw new Error("CRYPTO_INVALID");
  return wrap;
}

// ---- Session lifecycle ----

function clearAssetCache(): void {
  for (const entry of assetCache.values()) entry.data.fill(0);
  assetCache.clear();
  assetCacheBytes = 0;
}

function armIdleTimer(vaultPath: string, session: VaultSession): void {
  if (session.timer) clearTimeout(session.timer);
  const minutes = Math.max(1, Math.floor(idleMinutesProvider()) || 10);
  session.timer = setTimeout(() => {
    session.timer = null;
    void lockVault(vaultPath);
  }, minutes * 60_000);
}

export function isUnlocked(vaultPath: string): boolean {
  return sessions.has(normalizeVaultPath(vaultPath));
}

export function touchVault(vaultPath: string): void {
  const session = sessions.get(normalizeVaultPath(vaultPath));
  if (!session) return;
  session.lastActive = Date.now();
  armIdleTimer(vaultPath, session);
}

export async function unlockVault(vaultPath: string, password: string): Promise<void> {
  const meta = readMetaRaw(vaultPath);
  let dek: Buffer;
  try {
    const kek = await deriveKek(password, meta.kdf);
    try {
      dek = unwrapKey(kek, passwordWrap(meta));
    } finally {
      kek.fill(0);
    }
  } catch {
    throw new Error("BAD_PASSWORD");
  }
  const key = normalizeVaultPath(vaultPath);
  const existing = sessions.get(key);
  if (existing) {
    existing.dek.fill(0);
    if (existing.timer) clearTimeout(existing.timer);
  }
  const session: VaultSession = { dek, ops: 0, lastActive: Date.now(), timer: null, locking: false };
  sessions.set(key, session);
  armIdleTimer(vaultPath, session);
  unlockListener(vaultPath);
}

// Drop a session without notifying the renderer (used when the marker goes
// away, e.g. after making a vault public — the lock event would be noise).
export async function dropSession(vaultPath: string): Promise<void> {
  const key = normalizeVaultPath(vaultPath);
  const session = sessions.get(key);
  if (!session) return;
  session.locking = true;
  while (session.ops > 0) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (session.timer) clearTimeout(session.timer);
  session.dek.fill(0);
  sessions.delete(key);
  clearAssetCache();
}

export async function lockVault(vaultPath: string): Promise<void> {
  if (!sessions.has(normalizeVaultPath(vaultPath))) return;
  await dropSession(vaultPath);
  lockListener(vaultPath);
}

export async function lockAllVaults(): Promise<void> {
  // Sessions are keyed by normalized path, which is a fine lock-event payload —
  // the renderer matches vault paths case- and separator-insensitively.
  for (const key of Array.from(sessions.keys())) {
    await dropSession(key);
    lockListener(key);
  }
  clearAssetCache();
}

// Run fn with a private copy of the DEK. The copy is wiped afterwards so a
// concurrent lock cannot zero the key mid-operation.
export async function withVaultKey<T>(
  vaultPath: string,
  fn: (dek: Buffer) => Promise<T> | T,
): Promise<T> {
  const session = sessions.get(normalizeVaultPath(vaultPath));
  if (!session || session.locking) throw new Error("VAULT_LOCKED");
  session.ops += 1;
  session.lastActive = Date.now();
  armIdleTimer(vaultPath, session);
  const dek = Buffer.from(session.dek);
  try {
    return await fn(dek);
  } finally {
    dek.fill(0);
    session.ops -= 1;
  }
}

// Renderer activity (pointer/key) keeps every unlocked vault alive.
export function touchAllVaults(): void {
  for (const [key, session] of sessions) {
    session.lastActive = Date.now();
    armIdleTimer(key, session);
  }
}

// Call after the idle-minutes setting changes so live sessions pick it up.
export function refreshIdleTimers(): void {
  for (const [key, session] of sessions) armIdleTimer(key, session);
}

// ---- Per-file encryption ----

export function isEncrypted(data: Buffer): boolean {
  return data.length >= HEADER_LEN
    && data.subarray(0, MAGIC.length).equals(MAGIC)
    && data[MAGIC.length] === FORMAT_VERSION;
}

export function encryptBuffer(dek: Buffer, data: Buffer): Buffer {
  const nonce = crypto.randomBytes(NONCE_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", dek, nonce);
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([
    MAGIC,
    Buffer.from([FORMAT_VERSION]),
    nonce,
    cipher.getAuthTag(),
    ct,
  ]);
}

// Plaintext (legacy) input is returned as-is so a partially migrated vault
// remains readable; callers that rewrite the content will re-encrypt it.
export function decryptBuffer(dek: Buffer, data: Buffer): Buffer {
  if (!isEncrypted(data)) return data;
  const nonce = data.subarray(MAGIC.length + 1, MAGIC.length + 1 + NONCE_LEN);
  const tag = data.subarray(MAGIC.length + 1 + NONCE_LEN, HEADER_LEN);
  const ct = data.subarray(HEADER_LEN);
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", dek, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new Error("CRYPTO_INVALID");
  }
}

function writeFileAtomicSync(filePath: string, data: Buffer): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(temp, data);
    fs.renameSync(temp, filePath);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch { /* ignore */ }
    throw error;
  }
}

export async function readEncryptedFile(filePath: string, dek: Buffer): Promise<Buffer> {
  return decryptBuffer(dek, await fs.promises.readFile(filePath));
}

export async function readEncryptedText(filePath: string, dek: Buffer): Promise<string> {
  return (await readEncryptedFile(filePath, dek)).toString("utf-8");
}

export async function writeEncryptedFile(
  filePath: string,
  dek: Buffer,
  data: Buffer | string,
): Promise<{ modified_at: string; mtimeMs: number }> {
  const plain = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  writeFileAtomicSync(filePath, encryptBuffer(dek, plain));
  const stat = await fs.promises.stat(filePath);
  return { modified_at: stat.mtime.toISOString(), mtimeMs: stat.mtimeMs };
}

// ---- Attachment cache ----

function cacheGet(filePath: string, mtimeMs: number): Buffer | null {
  const entry = assetCache.get(normalizeVaultPath(filePath));
  if (!entry || entry.mtimeMs !== mtimeMs) return null;
  return entry.data;
}

function cachePut(filePath: string, mtimeMs: number, data: Buffer): void {
  if (data.length > CACHE_LIMIT_BYTES) return;
  const key = normalizeVaultPath(filePath);
  const old = assetCache.get(key);
  if (old) {
    assetCacheBytes -= old.data.length;
    assetCache.delete(key);
  }
  assetCache.set(key, { mtimeMs, data });
  assetCacheBytes += data.length;
  while (assetCacheBytes > CACHE_LIMIT_BYTES && assetCache.size > 0) {
    const first = assetCache.keys().next().value as string | undefined;
    if (first === undefined) break;
    const evicted = assetCache.get(first);
    if (evicted) assetCacheBytes -= evicted.data.length;
    assetCache.delete(first);
  }
}

export async function readAssetBytes(filePath: string, dek: Buffer): Promise<Buffer> {
  const stat = await fs.promises.stat(filePath);
  const cached = cacheGet(filePath, stat.mtimeMs);
  if (cached) return cached;
  const data = decryptBuffer(dek, await fs.promises.readFile(filePath));
  cachePut(filePath, stat.mtimeMs, data);
  return data;
}

export function clearAssetCacheForTest(): void {
  clearAssetCache();
}

// ---- Filesystem walking / listing ----

function isExcludedRoot(dir: string, excludedRoots: string[]): boolean {
  const target = normalizeVaultPath(dir);
  return excludedRoots.some((root) => normalizeVaultPath(root) === target);
}

export function listNoteFiles(
  vaultPath: string,
  excludedRoots: string[] = [],
): { path: string; title: string; modifiedAt: string }[] {
  const notes: { path: string; title: string; modifiedAt: string }[] = [];
  const queue: string[] = [vaultPath];
  while (queue.length > 0) {
    const dir = queue.shift()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue;
        if (isExcludedRoot(full, excludedRoots)) continue;
        queue.push(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        try {
          const stat = fs.statSync(full);
          notes.push({
            path: full,
            title: entry.name.replace(/\.md$/i, ""),
            modifiedAt: stat.mtime.toISOString(),
          });
        } catch { /* skip unreadable */ }
      }
    }
  }
  notes.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : a.modifiedAt > b.modifiedAt ? -1 : 0));
  return notes;
}

export interface MigrationTargets {
  paths: string[];
}

export function collectMigrationTargets(
  vaultPath: string,
  attachmentsRelDir: string,
  canvasDir: string,
  excludedRoots: string[] = [],
): MigrationTargets {
  const paths = new Set<string>();
  const addDir = (dir: string, onlyMarkdown: boolean, onlyJson: boolean) => {
    const queue: string[] = [dir];
    while (queue.length > 0) {
      const current = queue.shift()!;
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.startsWith(".")) continue;
          if (isExcludedRoot(full, excludedRoots)) continue;
          queue.push(full);
        } else if (entry.isFile()) {
          const lower = entry.name.toLowerCase();
          if (onlyMarkdown && !lower.endsWith(".md")) continue;
          if (onlyJson && !lower.endsWith(".json")) continue;
          paths.add(full);
        }
      }
    }
  };
  addDir(vaultPath, true, false);
  addDir(path.join(vaultPath, ...attachmentsRelDir.split("/")), false, false);
  addDir(canvasDir, false, true);
  return { paths: Array.from(paths) };
}

// ---- Key lifecycle operations ----

export async function makeVaultPrivate(
  vaultPath: string,
  password: string,
  attachmentsRelDir: string,
  canvasDir: string,
  excludedRoots: string[],
  onProgress: ProgressFn,
): Promise<{ files: number; resumed: boolean }> {
  const resumed = isPrivateVault(vaultPath);
  let meta: VaultMeta;
  let dek: Buffer;
  if (resumed) {
    // Resume after an interrupted conversion: unlock with the same password
    // and encrypt whatever is still plaintext.
    meta = readMetaRaw(vaultPath);
    const kek = await deriveKek(password, meta.kdf);
    try {
      dek = unwrapKey(kek, passwordWrap(meta));
    } finally {
      kek.fill(0);
    }
  } else {
    const salt = crypto.randomBytes(SALT_LEN);
    dek = crypto.randomBytes(KEY_LEN);
    const kdf = { name: KDF.name, N: KDF.N, r: KDF.r, p: KDF.p, salt: salt.toString("base64") };
    const kek = await deriveKek(password, kdf);
    try {
      meta = { version: 1, kdf, wraps: [wrapKey(kek, dek)] };
    } finally {
      kek.fill(0);
    }
    // Marker first: readers tolerate legacy plaintext, so a crash mid-way
    // still leaves the vault openable and the conversion resumable.
    writeMetaAtomic(vaultPath, meta);
  }

  try {
    const targets = collectMigrationTargets(vaultPath, attachmentsRelDir, canvasDir, excludedRoots);
    let done = 0;
    let files = 0;
    for (const file of targets.paths) {
      done += 1;
      try {
        const data = await fs.promises.readFile(file);
        if (!isEncrypted(data)) {
          writeFileAtomicSync(file, encryptBuffer(dek, data));
          files += 1;
        }
      } catch {
        // Leave unreadable files untouched; the migration can be retried.
      }
      onProgress(done, targets.paths.length);
    }
    return { files, resumed };
  } finally {
    dek.fill(0);
  }
}

export async function makeVaultPublic(
  vaultPath: string,
  attachmentsRelDir: string,
  canvasDir: string,
  excludedRoots: string[],
  onProgress: ProgressFn,
): Promise<{ files: number }> {
  return withVaultKey(vaultPath, async (dek) => {
    const targets = collectMigrationTargets(vaultPath, attachmentsRelDir, canvasDir, excludedRoots);
    let done = 0;
    let files = 0;
    for (const file of targets.paths) {
      done += 1;
      try {
        const data = await fs.promises.readFile(file);
        if (isEncrypted(data)) {
          writeFileAtomicSync(file, decryptBuffer(dek, data));
          files += 1;
        }
      } catch {
        // Corrupt file: abort the whole conversion rather than silently
        // leaving a broken note behind.
        throw new Error("CRYPTO_INVALID");
      }
      onProgress(done, targets.paths.length);
    }
    fs.rmSync(markerPath(vaultPath), { force: true });
    return { files };
  });
}

export async function changeVaultPassword(
  vaultPath: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const meta = readMetaRaw(vaultPath);
  let dek: Buffer;
  try {
    const oldKek = await deriveKek(currentPassword, meta.kdf);
    try {
      dek = unwrapKey(oldKek, passwordWrap(meta));
    } finally {
      oldKek.fill(0);
    }
  } catch {
    throw new Error("BAD_PASSWORD");
  }
  try {
    const salt = crypto.randomBytes(SALT_LEN);
    const kdf = { name: KDF.name, N: KDF.N, r: KDF.r, p: KDF.p, salt: salt.toString("base64") };
    const newKek = await deriveKek(newPassword, kdf);
    try {
      const others = meta.wraps.filter((entry) => entry.type !== "password");
      writeMetaAtomic(vaultPath, {
        version: 1,
        kdf,
        wraps: [wrapKey(newKek, dek), ...others],
      });
    } finally {
      newKek.fill(0);
    }
  } finally {
    dek.fill(0);
  }
}

export function privacyStatus(vaultPath: string): { private: boolean; locked: boolean } {
  const isPrivate = isPrivateVault(vaultPath);
  return { private: isPrivate, locked: isPrivate && !isUnlocked(vaultPath) };
}
