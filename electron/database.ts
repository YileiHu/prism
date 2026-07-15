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
      notes TEXT NOT NULL DEFAULT '',
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

    CREATE VIRTUAL TABLE IF NOT EXISTS resources_fts USING fts5(title, notes, url, content='resources', content_rowid='id');

    CREATE TABLE IF NOT EXISTS obsidian_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      modified_at TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS obsidian_fts USING fts5(title, content, tags, content='obsidian_notes', content_rowid='id');
  `);

  // Triggers to keep FTS in sync
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS resources_ai AFTER INSERT ON resources BEGIN
      INSERT INTO resources_fts(rowid, title, notes, url) VALUES (new.id, new.title, new.notes, new.url);
    END;
    CREATE TRIGGER IF NOT EXISTS resources_ad AFTER DELETE ON resources BEGIN
      INSERT INTO resources_fts(resources_fts, rowid, title, notes, url) VALUES('delete', old.id, old.title, old.notes, old.url);
    END;
    CREATE TRIGGER IF NOT EXISTS resources_au AFTER UPDATE ON resources BEGIN
      INSERT INTO resources_fts(resources_fts, rowid, title, notes, url) VALUES('delete', old.id, old.title, old.notes, old.url);
      INSERT INTO resources_fts(rowid, title, notes, url) VALUES (new.id, new.title, new.notes, new.url);
    END;

    CREATE TRIGGER IF NOT EXISTS obsidian_ai AFTER INSERT ON obsidian_notes BEGIN
      INSERT INTO obsidian_fts(rowid, title, content, tags) VALUES (new.id, new.title, new.content, new.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS obsidian_ad AFTER DELETE ON obsidian_notes BEGIN
      INSERT INTO obsidian_fts(obsidian_fts, rowid, title, content, tags) VALUES('delete', old.id, old.title, old.content, old.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS obsidian_au AFTER UPDATE ON obsidian_notes BEGIN
      INSERT INTO obsidian_fts(obsidian_fts, rowid, title, content, tags) VALUES('delete', old.id, old.title, old.content, old.tags);
      INSERT INTO obsidian_fts(rowid, title, content, tags) VALUES (new.id, new.title, new.content, new.tags);
    END;

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
  `);
}

// ---- Resource operations ----

export interface Resource {
  id: number;
  url: string;
  title: string;
  notes: string;
  created_at: string;
  tags: string[];
}

export function addResource(url: string, title: string, notes: string, tags: string[]): Resource {
  const stmt = db.prepare("INSERT INTO resources (url, title, notes) VALUES (?, ?, ?)");
  const result = stmt.run(url, title, notes);
  const id = result.lastInsertRowid as number;

  for (const tagName of tags) {
    const tagStmt = db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)");
    tagStmt.run(tagName.trim());
    const tag = db.prepare("SELECT id FROM tags WHERE name = ?").get(tagName.trim()) as { id: number };
    db.prepare("INSERT INTO resource_tags (resource_id, tag_id) VALUES (?, ?)").run(id, tag.id);
  }

  return getResource(id)!;
}

export function getResources(): Resource[] {
  const rows = db.prepare(`
    SELECT r.* FROM resources r ORDER BY r.created_at DESC
  `).all() as any[];

  return rows.map(enrichResource);
}

export function getResource(id: number): Resource | null {
  const row = db.prepare("SELECT * FROM resources WHERE id = ?").get(id) as any;
  if (!row) return null;
  return enrichResource(row);
}

export function updateResource(id: number, title: string, notes: string, tags: string[]): Resource | null {
  db.prepare("UPDATE resources SET title = ?, notes = ? WHERE id = ?").run(title, notes, id);
  db.prepare("DELETE FROM resource_tags WHERE resource_id = ?").run(id);

  for (const tagName of tags) {
    const trimmed = tagName.trim();
    if (!trimmed) continue;
    db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(trimmed);
    const tag = db.prepare("SELECT id FROM tags WHERE name = ?").get(trimmed) as { id: number };
    db.prepare("INSERT INTO resource_tags (resource_id, tag_id) VALUES (?, ?)").run(id, tag.id);
  }

  return getResource(id);
}

export function deleteResource(id: number): boolean {
  const result = db.prepare("DELETE FROM resources WHERE id = ?").run(id);
  return result.changes > 0;
}

export function searchResources(query: string): Resource[] {
  const rows = db.prepare(`
    SELECT r.* FROM resources r
    JOIN resources_fts fts ON r.id = fts.rowid
    WHERE resources_fts MATCH ?
    ORDER BY rank
  `).all(query) as any[];

  return rows.map(enrichResource);
}

function enrichResource(row: any): Resource {
  const tags = db.prepare(`
    SELECT t.name FROM tags t
    JOIN resource_tags rt ON t.id = rt.tag_id
    WHERE rt.resource_id = ?
  `).all(row.id) as { name: string }[];

  return {
    id: row.id,
    url: row.url,
    title: row.title,
    notes: row.notes,
    created_at: row.created_at,
    tags: tags.map((t) => t.name),
  };
}

// ---- Obsidian note operations ----

export interface ObsidianNote {
  id: number;
  path: string;
  title: string;
  content: string;
  tags: string;
  modified_at: string;
}

export function setVaultNotes(notes: { path: string; title: string; content: string; tags: string; modified_at: string }[]): void {
  const clearAll = db.prepare("DELETE FROM obsidian_notes");
  const insert = db.prepare("INSERT INTO obsidian_notes (path, title, content, tags, modified_at) VALUES (?, ?, ?, ?, ?)");

  const transaction = db.transaction(() => {
    clearAll.run();
    for (const note of notes) {
      insert.run(note.path, note.title, note.content, note.tags, note.modified_at);
    }
  });

  transaction();
}

export function getNotes(): ObsidianNote[] {
  return db.prepare("SELECT * FROM obsidian_notes ORDER BY modified_at DESC").all() as ObsidianNote[];
}

export function searchNotes(query: string): ObsidianNote[] {
  return db.prepare(`
    SELECT * FROM obsidian_notes
    WHERE id IN (SELECT rowid FROM obsidian_fts WHERE obsidian_fts MATCH ?)
    ORDER BY modified_at DESC
  `).all(query) as ObsidianNote[];
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
