import Database from "better-sqlite3";
import path from "path";
import { app } from "electron";

let db: Database.Database;

export function initDatabase(): void {
  const dbPath = path.join(app.getPath("userData"), "prism.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS resource_tags (
      resource_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (resource_id, tag_id),
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS obsidian_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vault_path TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      modified_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_obsidian_modified ON obsidian_notes(modified_at DESC);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
  `);

  // Migration: rows written before vault_path existed can't be attributed to a
  // vault, so drop them and let each vault re-index on next scan.
  const noteCols = db.prepare("PRAGMA table_info(obsidian_notes)").all() as { name: string }[];
  if (!noteCols.some((c) => c.name === "vault_path")) {
    db.exec(`
      ALTER TABLE obsidian_notes ADD COLUMN vault_path TEXT NOT NULL DEFAULT '';
      DELETE FROM obsidian_notes;
    `);
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_obsidian_vault ON obsidian_notes(vault_path)");
}

// ---- Resource operations ----

interface ResourceRow {
  id: number;
  url: string;
  title: string;
  created_at: string;
  tag_names: string | null;
}

export interface Resource {
  id: number;
  url: string;
  title: string;
  created_at: string;
  tags: string[];
}

export function addResource(url: string, title: string, tags: string[]): Resource {
  const insertResource = db.prepare("INSERT INTO resources (url, title) VALUES (?, ?)");
  const id = db.transaction(() => {
    const resourceId = insertResource.run(url, title).lastInsertRowid as number;
    linkTags(resourceId, tags);
    return resourceId;
  })();

  return getResource(id)!;
}

function linkTags(resourceId: number, tags: string[]): void {
  const insertTag = db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)");
  const getTag = db.prepare("SELECT id FROM tags WHERE name = ?");
  const link = db.prepare("INSERT INTO resource_tags (resource_id, tag_id) VALUES (?, ?)");
  for (const tagName of tags) {
    const trimmed = tagName.trim();
    if (!trimmed) continue;
    insertTag.run(trimmed);
    const tag = getTag.get(trimmed) as { id: number };
    link.run(resourceId, tag.id);
  }
}

function pruneOrphanTags(): void {
  db.prepare("DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM resource_tags rt WHERE rt.tag_id = tags.id)").run();
}

// \x1f (unit separator) can't appear in tag names typed by users, unlike commas
const RESOURCE_SELECT = `
  SELECT r.*, (
    SELECT group_concat(t.name, char(31)) FROM tags t
    JOIN resource_tags rt ON t.id = rt.tag_id
    WHERE rt.resource_id = r.id
  ) AS tag_names
  FROM resources r
`;

export function getResources(): Resource[] {
  const rows = db.prepare(`${RESOURCE_SELECT} ORDER BY r.created_at DESC`).all() as ResourceRow[];
  return rows.map(rowToResource);
}

export function getResource(id: number): Resource | null {
  const row = db.prepare(`${RESOURCE_SELECT} WHERE r.id = ?`).get(id) as ResourceRow | undefined;
  if (!row) return null;
  return rowToResource(row);
}

export function updateResource(id: number, url: string, title: string, tags: string[]): Resource | null {
  db.transaction(() => {
    db.prepare("UPDATE resources SET url = ?, title = ? WHERE id = ?").run(url, title, id);
    db.prepare("DELETE FROM resource_tags WHERE resource_id = ?").run(id);
    linkTags(id, tags);
    pruneOrphanTags();
  })();

  return getResource(id);
}

export function deleteResource(id: number): boolean {
  let changes = 0;
  db.transaction(() => {
    changes = db.prepare("DELETE FROM resources WHERE id = ?").run(id).changes;
    pruneOrphanTags();
  })();
  return changes > 0;
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function searchResources(query: string): Resource[] {
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const clauses = terms.map(() => "r.title LIKE ? ESCAPE '\\'").join(" AND ");
  const params = terms.map((t) => `%${escapeLike(t)}%`);

  const rows = db.prepare(`${RESOURCE_SELECT} WHERE ${clauses} ORDER BY r.created_at DESC`).all(...params) as ResourceRow[];
  return rows.map(rowToResource);
}

function rowToResource(row: ResourceRow): Resource {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    created_at: row.created_at,
    tags: row.tag_names ? row.tag_names.split("\x1f") : [],
  };
}

// ---- Obsidian note operations ----

export interface ObsidianNote {
  id: number;
  vault_path: string;
  path: string;
  title: string;
  content: string;
  tags: string;
  modified_at: string;
}

export interface NoteUpsertRow {
  path: string;
  title: string;
  content: string;
  tags: string;
  modified_at: string;
}

export function getNoteMtimes(vaultPath: string): { path: string; modified_at: string }[] {
  return db.prepare("SELECT path, modified_at FROM obsidian_notes WHERE vault_path = ?").all(vaultPath) as { path: string; modified_at: string }[];
}

const SYNC_CHUNK = 500;

export function syncVaultNotes(vaultPath: string, upsert: NoteUpsertRow[], deletePaths: string[]): void {
  // ON CONFLICT keeps the row id stable, unlike INSERT OR REPLACE
  const upsertStmt = db.prepare(`
    INSERT INTO obsidian_notes (vault_path, path, title, content, tags, modified_at)
    VALUES (@vaultPath, @path, @title, @content, @tags, @modifiedAt)
    ON CONFLICT(path) DO UPDATE SET
      vault_path = excluded.vault_path,
      title = excluded.title,
      content = excluded.content,
      tags = excluded.tags,
      modified_at = excluded.modified_at
  `);
  const deleteStmt = db.prepare("DELETE FROM obsidian_notes WHERE vault_path = ? AND path = ?");

  // Chunked transactions so huge vaults don't block the main process in one long txn
  for (let i = 0; i < upsert.length; i += SYNC_CHUNK) {
    const chunk = upsert.slice(i, i + SYNC_CHUNK);
    db.transaction(() => {
      for (const n of chunk) {
        upsertStmt.run({ vaultPath, path: n.path, title: n.title, content: n.content, tags: n.tags, modifiedAt: n.modified_at });
      }
    })();
  }
  if (deletePaths.length > 0) {
    db.transaction(() => {
      for (const p of deletePaths) deleteStmt.run(vaultPath, p);
    })();
  }
}

export interface ObsidianNoteBrief {
  id: number;
  path: string;
  title: string;
  tags: string;
  modified_at: string;
}

export function getNoteList(vaultPath: string): ObsidianNoteBrief[] {
  return db.prepare("SELECT id, path, title, tags, modified_at FROM obsidian_notes WHERE vault_path = ? ORDER BY modified_at DESC").all(vaultPath) as ObsidianNoteBrief[];
}

export function searchNotes(vaultPath: string, query: string): ObsidianNoteBrief[] {
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const clauses = terms.map(() => "title LIKE ? ESCAPE '\\'").join(" AND ");
  const params = terms.map((t) => `%${escapeLike(t)}%`);

  return db.prepare(`
    SELECT id, path, title, tags, modified_at FROM obsidian_notes
    WHERE vault_path = ? AND ${clauses}
    ORDER BY modified_at DESC
  `).all(vaultPath, ...params) as ObsidianNoteBrief[];
}

export function insertNote(note: NoteUpsertRow & { vault_path: string }): ObsidianNote {
  const stmt = db.prepare(
    "INSERT INTO obsidian_notes (vault_path, path, title, content, tags, modified_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const result = stmt.run(note.vault_path, note.path, note.title, note.content, note.tags, note.modified_at);
  const id = result.lastInsertRowid as number;
  return db.prepare("SELECT * FROM obsidian_notes WHERE id = ?").get(id) as ObsidianNote;
}

export function renameNoteInDb(oldPath: string, newPath: string, newTitle: string): ObsidianNote | null {
  const changes = db.prepare("UPDATE obsidian_notes SET path = ?, title = ? WHERE path = ?").run(newPath, newTitle, oldPath).changes;
  if (changes === 0) return null;
  return db.prepare("SELECT * FROM obsidian_notes WHERE path = ?").get(newPath) as ObsidianNote;
}

export function deleteNotesByPaths(paths: string[]): void {
  if (paths.length === 0) return;
  // Stay well under SQLite's default 999 bind-variable limit
  const CHUNK = 500;
  db.transaction(() => {
    for (let i = 0; i < paths.length; i += CHUNK) {
      const chunk = paths.slice(i, i + CHUNK);
      db.prepare(`DELETE FROM obsidian_notes WHERE path IN (${chunk.map(() => "?").join(",")})`).run(...chunk);
    }
  })();
}

// ---- Settings ----

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

export function getAllTags(): { name: string; count: number }[] {
  return db.prepare(`
    SELECT t.name, COUNT(rt.resource_id) as count
    FROM tags t
    JOIN resource_tags rt ON t.id = rt.tag_id
    GROUP BY t.id
    ORDER BY count DESC
  `).all() as { name: string; count: number }[];
}
