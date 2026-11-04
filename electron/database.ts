import Database from "better-sqlite3";
import path from "path";
import { app } from "electron";
import type {
  FavoriteNote,
  GtdAction,
  GtdItem,
  GtdNextList,
  GtdStatus,
  NoteBrief,
  NoteContentHit,
  PdfDocument,
  RecentNote,
  Resource,
  TagInfo,
} from "../src/shared/models";

let db: Database.Database;

export function initDatabase(): void {
  const dbPath = path.join(app.getPath("userData"), "prism.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // One-time migration: drop the abandoned 2026-07 GTD experiment schema
  // (stage/category/FTS design, no status column) so the new tables can be created cleanly.
  const gtdCols = db.prepare("PRAGMA table_info(gtd_items)").all() as { name: string }[];
  if (gtdCols.length > 0 && !gtdCols.some((c) => c.name === "status")) {
    db.exec(`
      DROP TRIGGER IF EXISTS gtd_items_ai;
      DROP TRIGGER IF EXISTS gtd_items_ad;
      DROP TRIGGER IF EXISTS gtd_items_au;
      DROP TABLE IF EXISTS gtd_items_fts;
      DROP TABLE gtd_items;
      DROP TABLE IF EXISTS gtd_projects;
    `);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS resource_tags (
      resource_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (resource_id, tag_id),
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vault_path TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      modified_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_modified ON notes(modified_at DESC);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS gtd_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'inbox',
      is_next INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      archived_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_gtd_items_status ON gtd_items(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS gtd_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      is_done INTEGER NOT NULL DEFAULT 0,
      is_next INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      due_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      done_at TEXT,
      FOREIGN KEY (project_id) REFERENCES gtd_items(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_gtd_actions_project ON gtd_actions(project_id, sort_order);

    CREATE TABLE IF NOT EXISTS favorite_notes (
      path TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS recent_notes (
      path TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      opened_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS pdf_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_path TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      rel_path TEXT NOT NULL,
      title TEXT NOT NULL,
      page_count INTEGER,
      file_size INTEGER NOT NULL DEFAULT 0,
      modified_at TEXT NOT NULL,
      cover_path TEXT NOT NULL DEFAULT '',
      cover_version INTEGER NOT NULL DEFAULT 0,
      cover_custom INTEGER NOT NULL DEFAULT 0,
      cover_dirty INTEGER NOT NULL DEFAULT 0,
      added_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pdf_documents_repo ON pdf_documents(repo_path);
    CREATE INDEX IF NOT EXISTS idx_pdf_documents_modified ON pdf_documents(modified_at DESC);
  `);

  // Migration: the notes table was previously named obsidian_notes — rename
  // it in place (SQLite keeps the old index names, so recreate them)
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('obsidian_notes', 'notes')").all() as { name: string }[];
  if (tables.some((t) => t.name === "obsidian_notes") && !tables.some((t) => t.name === "notes")) {
    db.exec(`
      ALTER TABLE obsidian_notes RENAME TO notes;
      DROP INDEX IF EXISTS idx_obsidian_modified;
      DROP INDEX IF EXISTS idx_obsidian_vault;
      DELETE FROM settings WHERE key = 'obsidian_path';
    `);
  }

  // Migration: rows written before vault_path existed can't be attributed to a
  // vault, so drop them and let each vault re-index on next scan.
  const noteCols = db.prepare("PRAGMA table_info(notes)").all() as { name: string }[];
  if (noteCols.length > 0 && !noteCols.some((c) => c.name === "vault_path")) {
    db.exec(`
      ALTER TABLE notes ADD COLUMN vault_path TEXT NOT NULL DEFAULT '';
      DELETE FROM notes;
    `);
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_notes_vault ON notes(vault_path)");

  // Migration: project descriptions were added after gtd_items shipped
  const gtdItemCols = db.prepare("PRAGMA table_info(gtd_items)").all() as { name: string }[];
  if (gtdItemCols.length > 0 && !gtdItemCols.some((c) => c.name === "description")) {
    db.exec("ALTER TABLE gtd_items ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  }
  if (gtdItemCols.length > 0 && !gtdItemCols.some((c) => c.name === "color")) {
    db.exec("ALTER TABLE gtd_items ADD COLUMN color TEXT NOT NULL DEFAULT ''");
  }
  if (gtdItemCols.length > 0 && !gtdItemCols.some((c) => c.name === "due_date")) {
    db.exec("ALTER TABLE gtd_items ADD COLUMN due_date TEXT");
  }
  // Projects now end up archived instead of done, so reuse the timestamp as
  // the archive time and re-label existing completed rows.
  if (gtdItemCols.length > 0 && gtdItemCols.some((c) => c.name === "done_at") && !gtdItemCols.some((c) => c.name === "archived_at")) {
    db.exec("ALTER TABLE gtd_items RENAME COLUMN done_at TO archived_at");
  }
  db.exec("UPDATE gtd_items SET status = 'archived' WHERE status = 'done'");
  const gtdActionCols = db.prepare("PRAGMA table_info(gtd_actions)").all() as { name: string }[];
  if (gtdActionCols.length > 0 && !gtdActionCols.some((c) => c.name === "due_date")) {
    db.exec("ALTER TABLE gtd_actions ADD COLUMN due_date TEXT");
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_gtd_items_due ON gtd_items(due_date) WHERE due_date IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_gtd_actions_due ON gtd_actions(due_date) WHERE due_date IS NOT NULL;
  `);

  // Migration: resource ordering was added after resources shipped — seed it
  // from id so the existing newest-first display order is preserved.
  const resourceCols = db.prepare("PRAGMA table_info(resources)").all() as { name: string }[];
  if (resourceCols.length > 0 && !resourceCols.some((c) => c.name === "sort_order")) {
    db.exec("ALTER TABLE resources ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE resources SET sort_order = -id");
  }
  if (resourceCols.length > 0 && !resourceCols.some((c) => c.name === "notes")) {
    db.exec("ALTER TABLE resources ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_resources_sort ON resources(sort_order)");

  // Migration: tag ordering and color were added after tags shipped — seed the
  // order from the previous count-desc display so the sidebar looks unchanged.
  const tagCols = db.prepare("PRAGMA table_info(tags)").all() as { name: string }[];
  if (tagCols.length > 0 && !tagCols.some((c) => c.name === "sort_order")) {
    db.exec("ALTER TABLE tags ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
    const ordered = db.prepare(`
      SELECT t.id FROM tags t
      LEFT JOIN resource_tags rt ON rt.tag_id = t.id
      GROUP BY t.id
      ORDER BY COUNT(rt.resource_id) DESC, t.id ASC
    `).all() as { id: number }[];
    const update = db.prepare("UPDATE tags SET sort_order = ? WHERE id = ?");
    ordered.forEach((row, index) => update.run(index, row.id));
  }
  if (tagCols.length > 0 && !tagCols.some((c) => c.name === "color")) {
    db.exec("ALTER TABLE tags ADD COLUMN color TEXT NOT NULL DEFAULT ''");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_tags_sort ON tags(sort_order)");
}

// ---- Resource operations ----

interface ResourceRow {
  id: number;
  url: string;
  title: string;
  notes: string;
  created_at: string;
  tag_names: string | null;
}

export function addResource(url: string, title: string, tags: string[], notes: string): Resource {
  const insertResource = db.prepare("INSERT INTO resources (url, title, notes, sort_order) VALUES (?, ?, ?, ?)");
  const id = db.transaction(() => {
    const { next } = db.prepare("SELECT COALESCE(MIN(sort_order), 0) - 1 AS next FROM resources").get() as { next: number };
    const resourceId = insertResource.run(url, title, notes, next).lastInsertRowid as number;
    linkTags(resourceId, tags);
    return resourceId;
  })();

  return getResource(id)!;
}

function linkTags(resourceId: number, tags: string[]): void {
  const insertTag = db.prepare(
    "INSERT OR IGNORE INTO tags (name, sort_order) VALUES (?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM tags))"
  );
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
  const rows = db.prepare(`${RESOURCE_SELECT} ORDER BY r.sort_order ASC, r.id ASC`).all() as ResourceRow[];
  return rows.map(rowToResource);
}

// Reorders only the given resources, leaving them in the slots they already
// occupy in the global order so the other rows keep their relative positions.
export function reorderResources(orderedIds: number[]): void {
  if (orderedIds.length === 0) return;
  db.transaction(() => {
    const all = db.prepare("SELECT id FROM resources ORDER BY sort_order ASC, id ASC").all() as { id: number }[];
    const wanted = new Set(orderedIds);
    const slots: number[] = [];
    all.forEach((row, index) => {
      if (wanted.has(row.id)) slots.push(index);
    });
    if (new Set(orderedIds).size !== orderedIds.length || slots.length !== orderedIds.length) return;
    const next = all.map((row) => row.id);
    slots.forEach((slot, i) => { next[slot] = orderedIds[i]; });
    const update = db.prepare("UPDATE resources SET sort_order = ? WHERE id = ?");
    next.forEach((id, index) => update.run(index, id));
  })();
}

export function getResource(id: number): Resource | null {
  const row = db.prepare(`${RESOURCE_SELECT} WHERE r.id = ?`).get(id) as ResourceRow | undefined;
  if (!row) return null;
  return rowToResource(row);
}

export function updateResource(id: number, url: string, title: string, tags: string[], notes: string): Resource | null {
  db.transaction(() => {
    db.prepare("UPDATE resources SET url = ?, title = ?, notes = ? WHERE id = ?").run(url, title, notes, id);
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

export function searchResources(query: string, limit = 200): Resource[] {
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const clauses = terms.map(() => "r.title LIKE ? ESCAPE '\\'").join(" AND ");
  const params = terms.map((t) => `%${escapeLike(t)}%`);

  const rows = db.prepare(`${RESOURCE_SELECT} WHERE ${clauses} ORDER BY r.sort_order ASC, r.id ASC LIMIT ?`).all(...params, limit) as ResourceRow[];
  return rows.map(rowToResource);
}

function rowToResource(row: ResourceRow): Resource {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    notes: row.notes,
    createdAt: row.created_at,
    tags: row.tag_names ? row.tag_names.split("\x1f") : [],
  };
}

// ---- Note operations ----

export interface VaultNote {
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
  return db.prepare("SELECT path, modified_at FROM notes WHERE vault_path = ?").all(vaultPath) as { path: string; modified_at: string }[];
}

const SYNC_CHUNK = 500;

export function syncVaultNotes(vaultPath: string, upsert: NoteUpsertRow[], deletePaths: string[]): void {
  // ON CONFLICT keeps the row id stable, unlike INSERT OR REPLACE
  const upsertStmt = db.prepare(`
    INSERT INTO notes (vault_path, path, title, content, tags, modified_at)
    VALUES (@vaultPath, @path, @title, @content, @tags, @modifiedAt)
    ON CONFLICT(path) DO UPDATE SET
      vault_path = excluded.vault_path,
      title = excluded.title,
      content = excluded.content,
      tags = excluded.tags,
      modified_at = excluded.modified_at
  `);
  const deleteStmt = db.prepare("DELETE FROM notes WHERE vault_path = ? AND path = ?");

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

interface NoteBriefRow {
  id: number;
  path: string;
  title: string;
  tags: string;
  modified_at: string;
}

function toNoteBrief(row: NoteBriefRow): NoteBrief {
  return {
    id: row.id,
    path: row.path,
    title: row.title,
    tags: row.tags,
    modifiedAt: row.modified_at,
  };
}

export function getNoteList(vaultPath: string): NoteBrief[] {
  const rows = db.prepare("SELECT id, path, title, tags, modified_at FROM notes WHERE vault_path = ? ORDER BY modified_at DESC").all(vaultPath) as NoteBriefRow[];
  return rows.map(toNoteBrief);
}

export function searchNotes(vaultPath: string, query: string, limit = 200): NoteBrief[] {
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const clauses = terms.map(() => "title LIKE ? ESCAPE '\\'").join(" AND ");
  const params = terms.map((t) => `%${escapeLike(t)}%`);

  const rows = db.prepare(`
    SELECT id, path, title, tags, modified_at FROM notes
    WHERE vault_path = ? AND ${clauses}
    ORDER BY modified_at DESC
    LIMIT ?
  `).all(vaultPath, ...params, limit) as NoteBriefRow[];
  return rows.map(toNoteBrief);
}

const SNIPPET_BEFORE = 60;
const SNIPPET_AFTER = 120;

function makeSnippet(content: string, terms: string[]): string {
  const lower = content.toLowerCase();
  let matchIndex = -1;
  let matchLength = 0;
  for (const term of terms) {
    const idx = lower.indexOf(term.toLowerCase());
    if (idx !== -1 && (matchIndex === -1 || idx < matchIndex)) {
      matchIndex = idx;
      matchLength = term.length;
    }
  }
  if (matchIndex === -1) {
    return content.slice(0, SNIPPET_BEFORE + SNIPPET_AFTER).replace(/\s+/g, " ").trim();
  }

  const start = Math.max(0, matchIndex - SNIPPET_BEFORE);
  const end = Math.min(content.length, matchIndex + matchLength + SNIPPET_AFTER);
  let snippet = content.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < content.length) snippet = `${snippet}…`;
  return snippet;
}

export function searchNoteContents(vaultPath: string, query: string, limit = 200): NoteContentHit[] {
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const clauses = terms.map(() => "content LIKE ? ESCAPE '\\'").join(" AND ");
  const params = terms.map((t) => `%${escapeLike(t)}%`);

  const rows = db.prepare(`
    SELECT path, title, content FROM notes
    WHERE vault_path = ? AND ${clauses}
    ORDER BY modified_at DESC
    LIMIT ?
  `).all(vaultPath, ...params, limit) as { path: string; title: string; content: string }[];

  return rows.map(({ path, title, content }) => ({
    path,
    title,
    snippet: makeSnippet(content, terms),
  }));
}

export function insertNote(note: NoteUpsertRow & { vault_path: string }): VaultNote {
  const stmt = db.prepare(
    "INSERT INTO notes (vault_path, path, title, content, tags, modified_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const result = stmt.run(note.vault_path, note.path, note.title, note.content, note.tags, note.modified_at);
  const id = result.lastInsertRowid as number;
  return db.prepare("SELECT * FROM notes WHERE id = ?").get(id) as VaultNote;
}

export function renameNoteInDb(oldPath: string, newPath: string, newTitle: string): VaultNote | null {
  const changes = db.prepare("UPDATE notes SET path = ?, title = ? WHERE path = ?").run(newPath, newTitle, oldPath).changes;
  if (changes === 0) return null;
  return db.prepare("SELECT * FROM notes WHERE path = ?").get(newPath) as VaultNote;
}

export function deleteNotesByPaths(paths: string[]): void {
  if (paths.length === 0) return;
  // Stay well under SQLite's default 999 bind-variable limit
  const CHUNK = 500;
  db.transaction(() => {
    for (let i = 0; i < paths.length; i += CHUNK) {
      const chunk = paths.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => "?").join(",");
      db.prepare(`DELETE FROM notes WHERE path IN (${placeholders})`).run(...chunk);
      db.prepare(`DELETE FROM favorite_notes WHERE path IN (${placeholders})`).run(...chunk);
      db.prepare(`DELETE FROM recent_notes WHERE path IN (${placeholders})`).run(...chunk);
    }
  })();
}

// ---- PDF operations ----

interface PdfDocumentRow {
  id: number;
  repo_path: string;
  path: string;
  rel_path: string;
  title: string;
  page_count: number | null;
  file_size: number;
  modified_at: string;
  cover_path: string;
  cover_version: number;
  cover_custom: number;
  cover_dirty: number;
  added_at: string;
}

function toPdfDocument(row: PdfDocumentRow): PdfDocument {
  return {
    id: row.id,
    repoPath: row.repo_path,
    path: row.path,
    relPath: row.rel_path,
    title: row.title,
    pageCount: row.page_count,
    fileSize: row.file_size,
    modifiedAt: row.modified_at,
    coverPath: row.cover_path,
    coverVersion: row.cover_version,
    coverCustom: row.cover_custom === 1,
    coverDirty: row.cover_dirty === 1,
    addedAt: row.added_at,
  };
}

export interface PdfUpsertRow {
  path: string;
  rel_path: string;
  title: string;
  file_size: number;
  modified_at: string;
}

export function getPdfMtimes(repoPath: string): { path: string; modified_at: string }[] {
  return db.prepare("SELECT path, modified_at FROM pdf_documents WHERE repo_path = ?").all(repoPath) as { path: string; modified_at: string }[];
}

export function syncPdfDocuments(repoPath: string, upsert: PdfUpsertRow[], deletePaths: string[]): void {
  // ON CONFLICT keeps id/cover metadata stable. Only files whose mtime changed
  // reach this list, so invalidating the auto cover here is safe.
  const upsertStmt = db.prepare(`
    INSERT INTO pdf_documents (repo_path, path, rel_path, title, file_size, modified_at)
    VALUES (@repoPath, @path, @relPath, @title, @fileSize, @modifiedAt)
    ON CONFLICT(path) DO UPDATE SET
      repo_path = excluded.repo_path,
      rel_path = excluded.rel_path,
      title = excluded.title,
      file_size = excluded.file_size,
      modified_at = excluded.modified_at,
      cover_dirty = CASE WHEN pdf_documents.cover_custom = 1 THEN 0 ELSE 1 END,
      cover_version = CASE WHEN pdf_documents.cover_custom = 1
        THEN pdf_documents.cover_version ELSE pdf_documents.cover_version + 1 END
  `);
  const deleteStmt = db.prepare("DELETE FROM pdf_documents WHERE repo_path = ? AND path = ?");

  for (let i = 0; i < upsert.length; i += SYNC_CHUNK) {
    const chunk = upsert.slice(i, i + SYNC_CHUNK);
    db.transaction(() => {
      for (const d of chunk) {
        upsertStmt.run({
          repoPath,
          path: d.path,
          relPath: d.rel_path,
          title: d.title,
          fileSize: d.file_size,
          modifiedAt: d.modified_at,
        });
      }
    })();
  }
  if (deletePaths.length > 0) {
    db.transaction(() => {
      for (const p of deletePaths) deleteStmt.run(repoPath, p);
    })();
  }
}

export function listPdfDocuments(repoPath: string): PdfDocument[] {
  const rows = db.prepare("SELECT * FROM pdf_documents WHERE repo_path = ? ORDER BY title COLLATE NOCASE ASC").all(repoPath) as PdfDocumentRow[];
  return rows.map(toPdfDocument);
}

export function getPdfDocument(id: number): PdfDocument | null {
  const row = db.prepare("SELECT * FROM pdf_documents WHERE id = ?").get(id) as PdfDocumentRow | undefined;
  return row ? toPdfDocument(row) : null;
}

export function getPdfDocumentsByIds(ids: number[]): PdfDocument[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT * FROM pdf_documents WHERE id IN (${placeholders})`).all(...ids) as PdfDocumentRow[];
  return rows.map(toPdfDocument);
}

export function updatePdfCover(id: number, coverPath: string, pageCount: number | null): number {
  db.prepare(`
    UPDATE pdf_documents
    SET cover_path = ?, cover_version = cover_version + 1, cover_dirty = 0,
        page_count = COALESCE(?, page_count)
    WHERE id = ?
  `).run(coverPath, pageCount, id);
  const row = db.prepare("SELECT cover_version FROM pdf_documents WHERE id = ?").get(id) as { cover_version: number } | undefined;
  return row?.cover_version ?? 0;
}

export function setPdfCustomCover(id: number, coverPath: string): number {
  db.prepare(`
    UPDATE pdf_documents
    SET cover_path = ?, cover_version = cover_version + 1,
        cover_custom = 1, cover_dirty = 0
    WHERE id = ?
  `).run(coverPath, id);
  const row = db.prepare("SELECT cover_version FROM pdf_documents WHERE id = ?").get(id) as { cover_version: number } | undefined;
  return row?.cover_version ?? 0;
}

export function resetPdfCover(id: number): number {
  db.prepare(`
    UPDATE pdf_documents
    SET cover_custom = 0, cover_dirty = 1, cover_version = cover_version + 1
    WHERE id = ?
  `).run(id);
  const row = db.prepare("SELECT cover_version FROM pdf_documents WHERE id = ?").get(id) as { cover_version: number } | undefined;
  return row?.cover_version ?? 0;
}

export function setPdfPageCount(id: number, pageCount: number): void {
  db.prepare("UPDATE pdf_documents SET page_count = ? WHERE id = ?").run(pageCount, id);
}

export function deletePdfDocuments(ids: number[]): void {
  if (ids.length === 0) return;
  for (let i = 0; i < ids.length; i += SYNC_CHUNK) {
    const chunk = ids.slice(i, i + SYNC_CHUNK);
    const placeholders = chunk.map(() => "?").join(",");
    db.prepare(`DELETE FROM pdf_documents WHERE id IN (${placeholders})`).run(...chunk);
  }
}

// ---- Settings ----

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export function getAllTags(): TagInfo[] {
  return db.prepare(`
    SELECT t.name, COUNT(rt.resource_id) as count, t.color
    FROM tags t
    JOIN resource_tags rt ON t.id = rt.tag_id
    GROUP BY t.id
    ORDER BY t.sort_order ASC, t.id ASC
  `).all() as TagInfo[];
}

export function reorderTags(orderedNames: string[]): void {
  const update = db.prepare("UPDATE tags SET sort_order = ? WHERE name = ?");
  db.transaction(() => {
    orderedNames.forEach((name, index) => update.run(index, name));
  })();
}

export function setTagColor(name: string, color: string): void {
  db.prepare("UPDATE tags SET color = ? WHERE name = ?").run(color, name);
}

// Renaming onto an existing tag merges the two: links are unioned into the
// target and the old row is deleted.
export function renameTag(oldName: string, newName: string): void {
  if (oldName === newName) return;
  db.transaction(() => {
    const oldTag = db.prepare("SELECT id, color FROM tags WHERE name = ?").get(oldName) as { id: number; color: string } | undefined;
    if (!oldTag) return;
    const target = db.prepare("SELECT id, color FROM tags WHERE name = ?").get(newName) as { id: number; color: string } | undefined;
    if (!target) {
      db.prepare("UPDATE tags SET name = ? WHERE id = ?").run(newName, oldTag.id);
      return;
    }
    db.prepare(
      "INSERT OR IGNORE INTO resource_tags (resource_id, tag_id) SELECT resource_id, ? FROM resource_tags WHERE tag_id = ?"
    ).run(target.id, oldTag.id);
    db.prepare("DELETE FROM tags WHERE id = ?").run(oldTag.id);
    if (!target.color && oldTag.color) {
      db.prepare("UPDATE tags SET color = ? WHERE id = ?").run(oldTag.color, target.id);
    }
  })();
}

export function deleteTag(name: string): void {
  db.prepare("DELETE FROM tags WHERE name = ?").run(name);
}

// ---- GTD operations ----

interface GtdItemRow {
  id: number;
  title: string;
  status: GtdStatus;
  is_next: number;
  description: string;
  color: string;
  due_date: string | null;
  created_at: string;
  archived_at: string | null;
  action_count: number;
  done_action_count: number;
}

interface GtdActionRow {
  id: number;
  project_id: number;
  title: string;
  is_done: number;
  is_next: number;
  sort_order: number;
  due_date: string | null;
  created_at: string;
  done_at: string | null;
}

function toGtdItem(row: GtdItemRow): GtdItem {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    isNext: row.is_next === 1,
    description: row.description,
    color: row.color,
    dueDate: row.due_date,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    actionCount: row.action_count,
    doneActionCount: row.done_action_count,
  };
}

function toGtdAction(row: GtdActionRow): GtdAction {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    isDone: row.is_done === 1,
    isNext: row.is_next === 1,
    sortOrder: row.sort_order,
    dueDate: row.due_date,
    createdAt: row.created_at,
    doneAt: row.done_at,
  };
}

const GTD_STATUSES: GtdStatus[] = ["inbox", "someday", "waiting", "project", "archived"];

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function assertDateKey(value: string | null): void {
  if (value === null) return;
  const match = DATE_KEY_RE.exec(value);
  if (!match) throw new Error(`Invalid due date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    throw new Error(`Invalid due date: ${value}`);
  }
}

const GTD_ITEM_SELECT = `
  SELECT i.*, (SELECT COUNT(*) FROM gtd_actions a WHERE a.project_id = i.id) AS action_count,
    (SELECT COUNT(*) FROM gtd_actions a WHERE a.project_id = i.id AND a.is_done = 1) AS done_action_count
  FROM gtd_items i
`;

export function addGtdItem(title: string): GtdItem {
  const id = db.prepare("INSERT INTO gtd_items (title) VALUES (?)").run(title).lastInsertRowid as number;
  return getGtdItem(id)!;
}

export function getGtdItem(id: number): GtdItem | null {
  const row = db.prepare(`${GTD_ITEM_SELECT} WHERE i.id = ?`).get(id) as GtdItemRow | undefined;
  return row ? toGtdItem(row) : null;
}

export function getGtdItems(status: GtdStatus): GtdItem[] {
  const rows = db.prepare(`${GTD_ITEM_SELECT} WHERE i.status = ? ORDER BY COALESCE(i.archived_at, i.created_at) DESC`).all(status) as GtdItemRow[];
  return rows.map(toGtdItem);
}

export function getGtdCounts(): Record<GtdStatus, number> {
  const rows = db.prepare("SELECT status, COUNT(*) AS count FROM gtd_items GROUP BY status").all() as { status: GtdStatus; count: number }[];
  const counts = Object.fromEntries(GTD_STATUSES.map((s) => [s, 0])) as Record<GtdStatus, number>;
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

export function setGtdItemStatus(id: number, status: GtdStatus): void {
  if (!GTD_STATUSES.includes(status)) throw new Error(`Invalid GTD status: ${status}`);
  db.prepare(`
    UPDATE gtd_items SET status = ?,
      archived_at = CASE WHEN ? = 'archived' THEN datetime('now') ELSE NULL END,
      is_next = CASE WHEN ? = 'waiting' THEN is_next ELSE 0 END,
      due_date = CASE WHEN ? = 'waiting' THEN due_date ELSE NULL END
    WHERE id = ?
  `).run(status, status, status, status, id);
}

// Archiving leaves actions untouched so unarchiving restores the project
// exactly as it was.
export function setGtdItemArchived(id: number, archived: boolean): void {
  if (archived) {
    db.prepare("UPDATE gtd_items SET status = 'archived', archived_at = datetime('now') WHERE id = ? AND status = 'project'").run(id);
  } else {
    db.prepare("UPDATE gtd_items SET status = 'project', archived_at = NULL WHERE id = ? AND status = 'archived'").run(id);
  }
}

export function renameGtdItem(id: number, title: string): void {
  db.prepare("UPDATE gtd_items SET title = ? WHERE id = ?").run(title, id);
}

export function setGtdItemDescription(id: number, description: string): void {
  db.prepare("UPDATE gtd_items SET description = ? WHERE id = ?").run(description, id);
}

export function setGtdItemColor(id: number, color: string): void {
  db.prepare("UPDATE gtd_items SET color = ? WHERE id = ?").run(color, id);
}

export function setGtdItemDueDate(id: number, dueDate: string | null): void {
  assertDateKey(dueDate);
  db.prepare("UPDATE gtd_items SET due_date = ? WHERE id = ? AND status = 'waiting'").run(dueDate, id);
}

export function deleteGtdItem(id: number): boolean {
  return db.prepare("DELETE FROM gtd_items WHERE id = ?").run(id).changes > 0;
}

export function setGtdItemNext(id: number, isNext: boolean): void {
  db.prepare("UPDATE gtd_items SET is_next = ? WHERE id = ? AND status = 'waiting'").run(isNext ? 1 : 0, id);
}

export function getGtdActions(projectId: number): GtdAction[] {
  const rows = db.prepare("SELECT * FROM gtd_actions WHERE project_id = ? ORDER BY sort_order ASC, id ASC").all(projectId) as GtdActionRow[];
  return rows.map(toGtdAction);
}

export function getGtdAction(id: number): GtdAction | null {
  const row = db.prepare("SELECT * FROM gtd_actions WHERE id = ?").get(id) as GtdActionRow | undefined;
  return row ? toGtdAction(row) : null;
}

export function addGtdAction(projectId: number, title: string): GtdAction {
  const id = db.prepare(`
    INSERT INTO gtd_actions (project_id, title, sort_order)
    VALUES (?, ?, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM gtd_actions WHERE project_id = ?))
  `).run(projectId, title, projectId).lastInsertRowid as number;
  return getGtdAction(id)!;
}

export function renameGtdAction(id: number, title: string): void {
  db.prepare("UPDATE gtd_actions SET title = ? WHERE id = ?").run(title, id);
}

export function setGtdActionDueDate(id: number, dueDate: string | null): void {
  assertDateKey(dueDate);
  db.prepare("UPDATE gtd_actions SET due_date = ? WHERE id = ?").run(dueDate, id);
}

function promoteFrontmostAction(projectId: number): void {
  const first = db.prepare(
    "SELECT id FROM gtd_actions WHERE project_id = ? AND is_done = 0 ORDER BY sort_order ASC, id ASC LIMIT 1"
  ).get(projectId) as { id: number } | undefined;
  db.prepare("UPDATE gtd_actions SET is_next = 0 WHERE project_id = ?").run(projectId);
  if (first) db.prepare("UPDATE gtd_actions SET is_next = 1 WHERE id = ?").run(first.id);
}

export function toggleGtdAction(id: number): void {
  db.transaction(() => {
    const row = db.prepare("SELECT project_id, is_done FROM gtd_actions WHERE id = ?").get(id) as
      { project_id: number; is_done: number } | undefined;
    if (!row) return;
    // SET expressions read the pre-update is_done, so all three stay consistent
    db.prepare(`
      UPDATE gtd_actions SET
        is_done = 1 - is_done,
        done_at = CASE WHEN is_done = 0 THEN datetime('now') ELSE NULL END,
        is_next = CASE WHEN is_done = 0 THEN 0 ELSE is_next END
      WHERE id = ?
    `).run(id);
    // Newly completed → hand "next" to the frontmost remaining action
    if (row.is_done === 0) promoteFrontmostAction(row.project_id);
  })();
}

export function reorderGtdActions(projectId: number, orderedIds: number[]): void {
  db.transaction(() => {
    const update = db.prepare("UPDATE gtd_actions SET sort_order = ? WHERE id = ? AND project_id = ?");
    orderedIds.forEach((actionId, index) => update.run(index, actionId, projectId));
  })();
}

export function deleteGtdAction(id: number): void {
  db.prepare("DELETE FROM gtd_actions WHERE id = ?").run(id);
}

export function setGtdActionNext(projectId: number, actionId: number | null): void {
  db.transaction(() => {
    db.prepare("UPDATE gtd_actions SET is_next = 0 WHERE project_id = ?").run(projectId);
    if (actionId !== null) {
      db.prepare("UPDATE gtd_actions SET is_next = 1 WHERE id = ? AND project_id = ? AND is_done = 0").run(actionId, projectId);
    }
  })();
}

interface GtdNextProjectRow {
  id: number;
  title: string;
  status: GtdStatus;
  is_next: number;
  description: string;
  color: string;
  due_date: string | null;
  created_at: string;
  archived_at: string | null;
  action_count: number;
  done_action_count: number;
  action_id: number;
  action_title: string;
  action_is_done: number;
  action_is_next: number;
  action_sort_order: number;
  action_due_date: string | null;
  action_created_at: string;
  action_done_at: string | null;
}

export function getGtdNextList(): GtdNextList {
  const waitingRows = db.prepare(`${GTD_ITEM_SELECT} WHERE i.status = 'waiting' AND i.is_next = 1 ORDER BY i.created_at DESC`).all() as GtdItemRow[];
  const rows = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM gtd_actions a WHERE a.project_id = p.id) AS action_count,
      (SELECT COUNT(*) FROM gtd_actions a WHERE a.project_id = p.id AND a.is_done = 1) AS done_action_count,
      a.id AS action_id, a.title AS action_title, a.is_done AS action_is_done, a.is_next AS action_is_next,
      a.sort_order AS action_sort_order, a.due_date AS action_due_date,
      a.created_at AS action_created_at, a.done_at AS action_done_at
    FROM gtd_items p
    JOIN (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY project_id ORDER BY is_next DESC, sort_order ASC, id ASC
      ) AS rn
      FROM gtd_actions
      WHERE is_done = 0
    ) a ON a.project_id = p.id AND a.rn = 1
    WHERE p.status = 'project'
    ORDER BY p.created_at DESC
  `).all() as GtdNextProjectRow[];
  return {
    waiting: waitingRows.map(toGtdItem),
    projects: rows.map((row) => ({
      project: toGtdItem({
        id: row.id,
        title: row.title,
        status: row.status,
        is_next: row.is_next,
        description: row.description,
        color: row.color,
        due_date: row.due_date,
        created_at: row.created_at,
        archived_at: row.archived_at,
        action_count: row.action_count,
        done_action_count: row.done_action_count,
      }),
      action: toGtdAction({
        id: row.action_id,
        project_id: row.id,
        title: row.action_title,
        is_done: row.action_is_done,
        is_next: row.action_is_next,
        sort_order: row.action_sort_order,
        due_date: row.action_due_date,
        created_at: row.action_created_at,
        done_at: row.action_done_at,
      }),
    })),
  };
}

// ---- Favorite / recent notes ----

export function toggleFavoriteNote(notePath: string, title: string): boolean {
  const existing = db.prepare("SELECT path FROM favorite_notes WHERE path = ?").get(notePath);
  if (existing) {
    db.prepare("DELETE FROM favorite_notes WHERE path = ?").run(notePath);
    return false;
  }
  db.prepare("INSERT INTO favorite_notes (path, title) VALUES (?, ?)").run(notePath, title);
  return true;
}

export function getFavoriteNotes(): FavoriteNote[] {
  const rows = db.prepare("SELECT * FROM favorite_notes ORDER BY created_at DESC").all() as
    { path: string; title: string; created_at: string }[];
  return rows.map((row) => ({ path: row.path, title: row.title, createdAt: row.created_at }));
}

export function getFavoriteStatus(paths: string[]): string[] {
  if (paths.length === 0) return [];
  const CHUNK = 500;
  const found: string[] = [];
  for (let i = 0; i < paths.length; i += CHUNK) {
    const chunk = paths.slice(i, i + CHUNK);
    const rows = db
      .prepare(`SELECT path FROM favorite_notes WHERE path IN (${chunk.map(() => "?").join(",")})`)
      .all(...chunk) as { path: string }[];
    for (const r of rows) found.push(r.path);
  }
  return found;
}

const RECENT_KEEP = 100;

export function recordRecentOpen(notePath: string): void {
  const row = db.prepare("SELECT title FROM notes WHERE path = ?").get(notePath) as { title: string } | undefined;
  const title = row?.title ?? path.basename(notePath, path.extname(notePath));
  db.transaction(() => {
    db.prepare("INSERT OR REPLACE INTO recent_notes (path, title, opened_at) VALUES (?, ?, datetime('now', 'localtime'))").run(notePath, title);
    db.prepare("DELETE FROM recent_notes WHERE path NOT IN (SELECT path FROM recent_notes ORDER BY opened_at DESC LIMIT ?)").run(RECENT_KEEP);
  })();
}

export function getRecentNotes(limit = 20): RecentNote[] {
  const rows = db.prepare("SELECT * FROM recent_notes ORDER BY opened_at DESC LIMIT ?").all(limit) as
    { path: string; title: string; opened_at: string }[];
  return rows.map((row) => ({ path: row.path, title: row.title, openedAt: row.opened_at }));
}

// Keep favorites/recents pointing at the right file after a rename, even when
// the note wasn't indexed (renameNoteInDb returns null for those).
export function renameNoteEntry(oldPath: string, newPath: string, newTitle: string): void {
  db.transaction(() => {
    db.prepare("UPDATE favorite_notes SET path = ?, title = ? WHERE path = ?").run(newPath, newTitle, oldPath);
    db.prepare("UPDATE recent_notes SET path = ?, title = ? WHERE path = ?").run(newPath, newTitle, oldPath);
  })();
}
