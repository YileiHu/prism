import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { app } from "electron";
import type {
  GtdProject,
  GtdProjectLinkKind,
  GtdTask,
  GtdTaskPatch,
  NoteBrief,
  NoteContentHit,
  PdfDocument,
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

    CREATE TABLE IF NOT EXISTS gtd_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      archived_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_gtd_projects_archived ON gtd_projects(archived_at, created_at DESC);

    CREATE TABLE IF NOT EXISTS gtd_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      project_id INTEGER,
      scheduled_date TEXT,
      due_date TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES gtd_projects(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gtd_tasks_project ON gtd_tasks(project_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_gtd_tasks_scheduled ON gtd_tasks(scheduled_date) WHERE scheduled_date IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_gtd_tasks_due ON gtd_tasks(due_date) WHERE due_date IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_gtd_tasks_completed ON gtd_tasks(completed_at) WHERE completed_at IS NOT NULL;

    CREATE TABLE IF NOT EXISTS gtd_project_folders (
      project_id INTEGER PRIMARY KEY,
      vault_path TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES gtd_projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS gtd_project_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('note','canvas')),
      vault_path TEXT NOT NULL,
      file_path TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE (project_id, file_path),
      FOREIGN KEY (project_id) REFERENCES gtd_projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_gtd_project_links_project ON gtd_project_links(project_id, sort_order);

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
    CREATE INDEX IF NOT EXISTS idx_pdf_documents_repo_rel ON pdf_documents(repo_path, rel_path COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_pdf_documents_repo_title ON pdf_documents(repo_path, title COLLATE NOCASE);
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

  // Migration: the Home module is gone, so its app-managed metadata tables are
  // no longer read or written. Note files are untouched.
  db.exec("DROP TABLE IF EXISTS favorite_notes");
  db.exec("DROP TABLE IF EXISTS recent_notes");

  // ---- GTD v2: tasks + projects -------------------------------------------
  // Legacy installs still carry gtd_items/gtd_actions. Normalize their last
  // legacy columns, copy everything into the new tables once, then drop the
  // old tables. New installs skip all of this.
  const gtdItemCols = db.prepare("PRAGMA table_info(gtd_items)").all() as { name: string }[];
  const gtdActionCols = db.prepare("PRAGMA table_info(gtd_actions)").all() as { name: string }[];
  if (gtdItemCols.length > 0) {
    if (!gtdItemCols.some((c) => c.name === "description")) {
      db.exec("ALTER TABLE gtd_items ADD COLUMN description TEXT NOT NULL DEFAULT ''");
    }
    if (!gtdItemCols.some((c) => c.name === "color")) {
      db.exec("ALTER TABLE gtd_items ADD COLUMN color TEXT NOT NULL DEFAULT ''");
    }
    if (!gtdItemCols.some((c) => c.name === "due_date")) {
      db.exec("ALTER TABLE gtd_items ADD COLUMN due_date TEXT");
    }
    // Projects now end up archived instead of done, so reuse the timestamp as
    // the archive time and re-label existing completed rows.
    if (gtdItemCols.some((c) => c.name === "done_at") && !gtdItemCols.some((c) => c.name === "archived_at")) {
      db.exec("ALTER TABLE gtd_items RENAME COLUMN done_at TO archived_at");
    }
    db.exec("UPDATE gtd_items SET status = 'archived' WHERE status = 'done'");
  }
  if (gtdActionCols.length > 0 && !gtdActionCols.some((c) => c.name === "due_date")) {
    db.exec("ALTER TABLE gtd_actions ADD COLUMN due_date TEXT");
  }
  migrateGtdV2(dbPath, gtdItemCols.length > 0, gtdActionCols.length > 0);

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

/**
 * One-time GTD v2 migration: copy the legacy items/actions into the new
 * task/project tables, then drop the old tables. A marker in `settings` makes
 * repeat launches no-ops; a pre-migration backup is kept next to the DB.
 */
function migrateGtdV2(dbPath: string, hasItems: boolean, hasActions: boolean): void {
  if (getSetting("gtd_v2_migrated") === "1") return;
  if (!hasItems && !hasActions) {
    setSetting("gtd_v2_migrated", "1");
    return;
  }

  const backupPath = `${dbPath}.pre-gtd-v2.bak`;
  try {
    if (!fs.existsSync(backupPath)) {
      db.pragma("wal_checkpoint(TRUNCATE)");
      fs.copyFileSync(dbPath, backupPath);
    }
  } catch (error) {
    console.error("GTD v2: failed to back up the database before migrating", error);
  }

  db.transaction(() => {
    if (hasItems) {
      db.exec(`
        INSERT INTO gtd_projects (id, title, description, color, created_at, archived_at)
        SELECT id, title, description, color, created_at,
          CASE WHEN status = 'archived' THEN COALESCE(archived_at, datetime('now')) ELSE NULL END
        FROM gtd_items
        WHERE status IN ('project', 'archived');

        INSERT INTO gtd_tasks (title, notes, project_id, scheduled_date, due_date, completed_at, created_at, sort_order)
        SELECT title, description, NULL, NULL, due_date, NULL, created_at, 0
        FROM gtd_items
        WHERE COALESCE(status, 'inbox') NOT IN ('project', 'archived');
      `);
    }
    if (hasActions) {
      db.exec(`
        INSERT INTO gtd_tasks (title, notes, project_id, scheduled_date, due_date, completed_at, created_at, sort_order)
        SELECT a.title, '',
          CASE WHEN p.id IS NULL THEN NULL ELSE a.project_id END,
          NULL, a.due_date,
          CASE WHEN a.is_done = 1 THEN COALESCE(a.done_at, a.created_at) ELSE NULL END,
          a.created_at, a.sort_order
        FROM gtd_actions a
        LEFT JOIN gtd_projects p ON p.id = a.project_id;
      `);
    }
    setSetting("gtd_v2_migrated", "1");
    db.exec(`
      DROP TABLE IF EXISTS gtd_actions;
      DROP TABLE IF EXISTS gtd_items;
      DROP TABLE IF EXISTS gtd_items_fts;
      DROP TRIGGER IF EXISTS gtd_items_ai;
      DROP TRIGGER IF EXISTS gtd_items_ad;
      DROP TRIGGER IF EXISTS gtd_items_au;
      DROP INDEX IF EXISTS idx_gtd_items_status;
      DROP INDEX IF EXISTS idx_gtd_actions_project;
      DROP INDEX IF EXISTS idx_gtd_items_due;
      DROP INDEX IF EXISTS idx_gtd_actions_due;
    `);
  })();
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

// Fresh rows for the files a watcher scan just touched, so the renderer can
// patch its list instead of reloading the whole vault.
export function getNoteBriefsByPaths(vaultPath: string, paths: string[]): NoteBrief[] {
  if (paths.length === 0) return [];
  const out: NoteBrief[] = [];
  for (let i = 0; i < paths.length; i += SYNC_CHUNK) {
    const chunk = paths.slice(i, i + SYNC_CHUNK);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = db.prepare(
      `SELECT id, path, title, tags, modified_at FROM notes WHERE vault_path = ? AND path IN (${placeholders})`,
    ).all(vaultPath, ...chunk) as NoteBriefRow[];
    out.push(...rows.map(toNoteBrief));
  }
  return out;
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
    }
  })();
}

// Forget everything indexed for a vault that just became private: note rows.
export function purgeVaultNotes(vaultPath: string): void {
  db.transaction(() => {
    db.prepare("DELETE FROM notes WHERE vault_path = ?").run(vaultPath);
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

export function getPdfDocumentsByPaths(repoPath: string, paths: string[]): PdfDocument[] {
  if (paths.length === 0) return [];
  const out: PdfDocument[] = [];
  for (let i = 0; i < paths.length; i += SYNC_CHUNK) {
    const chunk = paths.slice(i, i + SYNC_CHUNK);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = db.prepare(
      `SELECT * FROM pdf_documents WHERE repo_path = ? AND path IN (${placeholders})`,
    ).all(repoPath, ...chunk) as PdfDocumentRow[];
    out.push(...rows.map(toPdfDocument));
  }
  return out;
}

export function getPdfDocument(id: number): PdfDocument | null {
  const row = db.prepare("SELECT * FROM pdf_documents WHERE id = ?").get(id) as PdfDocumentRow | undefined;
  return row ? toPdfDocument(row) : null;
}

// Single-row lookups for note embeds: a card needs one document, not the
// whole library.
export function findPdfDocumentByRelPath(repoPath: string, relPath: string): PdfDocument | null {
  const row = db
    .prepare("SELECT * FROM pdf_documents WHERE repo_path = ? AND rel_path = ? COLLATE NOCASE LIMIT 1")
    .get(repoPath, relPath) as PdfDocumentRow | undefined;
  return row ? toPdfDocument(row) : null;
}

export function findPdfDocumentByTitle(repoPath: string, title: string): PdfDocument | null {
  const row = db
    .prepare("SELECT * FROM pdf_documents WHERE repo_path = ? AND title = ? COLLATE NOCASE LIMIT 1")
    .get(repoPath, title) as PdfDocumentRow | undefined;
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

// ---- GTD (tasks + projects) ----

interface GtdTaskRow {
  id: number;
  title: string;
  notes: string;
  project_id: number | null;
  scheduled_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  sort_order: number;
  project_title: string | null;
  project_color: string | null;
  project_archived_at: string | null;
}

interface GtdProjectRow {
  id: number;
  title: string;
  description: string;
  color: string;
  created_at: string;
  archived_at: string | null;
  task_count: number;
  done_task_count: number;
}

export interface GtdProjectFolderRow {
  project_id: number;
  vault_path: string;
  folder_path: string;
}

export interface GtdProjectLinkRow {
  id: number;
  project_id: number;
  kind: GtdProjectLinkKind;
  vault_path: string;
  file_path: string;
  title: string;
  sort_order: number;
}

function toGtdTask(row: GtdTaskRow): GtdTask {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    project: row.project_id === null
      ? null
      : {
          id: row.project_id,
          title: row.project_title ?? "",
          color: row.project_color ?? "",
          archived: row.project_archived_at !== null,
        },
    scheduledDate: row.scheduled_date,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    sortOrder: row.sort_order,
  };
}

function toGtdProject(row: GtdProjectRow): GtdProject {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    color: row.color,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    taskCount: row.task_count,
    doneTaskCount: row.done_task_count,
  };
}

const GTD_TASK_SELECT = `
  SELECT t.*,
    p.title AS project_title,
    p.color AS project_color,
    p.archived_at AS project_archived_at
  FROM gtd_tasks t
  LEFT JOIN gtd_projects p ON p.id = t.project_id
`;

const GTD_PROJECT_SELECT = `
  SELECT p.*,
    COUNT(t.id) AS task_count,
    COALESCE(SUM(CASE WHEN t.completed_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS done_task_count
  FROM gtd_projects p
  LEFT JOIN gtd_tasks t ON t.project_id = p.id
`;

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function assertDateKey(value: string | null): void {
  if (value === null) return;
  const match = DATE_KEY_RE.exec(value);
  if (!match) throw new Error(`Invalid date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    throw new Error(`Invalid date: ${value}`);
  }
}

function normalizeGtdTitle(value: string): string {
  const title = value.trim();
  if (!title) throw new Error("GTD title cannot be empty");
  return title;
}

function getGtdTaskRow(id: number): GtdTaskRow | undefined {
  return db.prepare(`${GTD_TASK_SELECT} WHERE t.id = ?`).get(id) as GtdTaskRow | undefined;
}

function getGtdTaskOrThrow(id: number): GtdTask {
  const row = getGtdTaskRow(id);
  if (!row) throw new Error(`GTD task not found: ${id}`);
  return toGtdTask(row);
}

function getWritableGtdTaskRow(id: number): GtdTaskRow {
  const row = getGtdTaskRow(id);
  if (!row) throw new Error(`GTD task not found: ${id}`);
  if (row.project_archived_at !== null) throw new Error("GTD project is archived");
  return row;
}

function assertGtdProjectWritable(projectId: number): void {
  const row = db.prepare("SELECT archived_at FROM gtd_projects WHERE id = ?").get(projectId) as
    { archived_at: string | null } | undefined;
  if (!row) throw new Error(`GTD project not found: ${projectId}`);
  if (row.archived_at !== null) throw new Error("GTD project is archived");
}

function getGtdProjectOrThrow(id: number): GtdProject {
  const row = db.prepare(`${GTD_PROJECT_SELECT} WHERE p.id = ? GROUP BY p.id`).get(id) as
    GtdProjectRow | undefined;
  if (!row) throw new Error(`GTD project not found: ${id}`);
  return toGtdProject(row);
}

export function getGtdProject(id: number): GtdProject {
  return getGtdProjectOrThrow(id);
}

function nextGtdTaskSortOrder(projectId: number): number {
  const row = db.prepare(
    "SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM gtd_tasks WHERE project_id = ?",
  ).get(projectId) as { next: number };
  return row.next;
}

export function getGtdOpenTasks(): GtdTask[] {
  const rows = db.prepare(`
    ${GTD_TASK_SELECT}
    WHERE t.completed_at IS NULL
      AND (t.project_id IS NULL OR p.archived_at IS NULL)
    ORDER BY t.created_at DESC, t.id DESC
  `).all() as GtdTaskRow[];
  return rows.map(toGtdTask);
}

export function getGtdCompletedTasks(limit = 200): GtdTask[] {
  const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
  const rows = db.prepare(`
    ${GTD_TASK_SELECT}
    WHERE t.completed_at IS NOT NULL
    ORDER BY t.completed_at DESC, t.id DESC
    LIMIT ?
  `).all(safeLimit) as GtdTaskRow[];
  return rows.map(toGtdTask);
}

export function getGtdProjectTasks(projectId: number): GtdTask[] {
  const rows = db.prepare(`
    ${GTD_TASK_SELECT}
    WHERE t.project_id = ?
    ORDER BY (t.completed_at IS NOT NULL), t.sort_order ASC, t.id ASC
  `).all(projectId) as GtdTaskRow[];
  return rows.map(toGtdTask);
}

export function getGtdProjects(archived: boolean): GtdProject[] {
  const where = archived ? "p.archived_at IS NOT NULL" : "p.archived_at IS NULL";
  const order = archived ? "p.archived_at DESC, p.id DESC" : "p.created_at DESC, p.id DESC";
  const rows = db.prepare(`
    ${GTD_PROJECT_SELECT}
    WHERE ${where}
    GROUP BY p.id
    ORDER BY ${order}
  `).all() as GtdProjectRow[];
  return rows.map(toGtdProject);
}

export function addGtdTask(
  title: string,
  projectId: number | null = null,
  scheduledDate: string | null = null,
): GtdTask {
  const clean = normalizeGtdTitle(title);
  assertDateKey(scheduledDate);
  let sortOrder = 0;
  if (projectId !== null) {
    assertGtdProjectWritable(projectId);
    sortOrder = nextGtdTaskSortOrder(projectId);
  }
  const id = db.prepare(
    "INSERT INTO gtd_tasks (title, project_id, scheduled_date, sort_order) VALUES (?, ?, ?, ?)",
  ).run(clean, projectId, scheduledDate, sortOrder).lastInsertRowid as number;
  return getGtdTaskOrThrow(id);
}

export function updateGtdTask(id: number, patch: GtdTaskPatch): GtdTask {
  const row = getWritableGtdTaskRow(id);
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (patch.title !== undefined) {
    sets.push("title = ?");
    values.push(normalizeGtdTitle(patch.title));
  }
  if (patch.notes !== undefined) {
    sets.push("notes = ?");
    values.push(patch.notes);
  }
  if (patch.scheduledDate !== undefined) {
    assertDateKey(patch.scheduledDate);
    sets.push("scheduled_date = ?");
    values.push(patch.scheduledDate);
  }
  if (patch.dueDate !== undefined) {
    assertDateKey(patch.dueDate);
    sets.push("due_date = ?");
    values.push(patch.dueDate);
  }
  if (patch.projectId !== undefined) {
    if (patch.projectId === null) {
      sets.push("project_id = ?");
      values.push(null);
    } else {
      assertGtdProjectWritable(patch.projectId);
      sets.push("project_id = ?");
      values.push(patch.projectId);
      // Moving into another project joins the end of that project's list.
      if (patch.projectId !== row.project_id) {
        sets.push("sort_order = ?");
        values.push(nextGtdTaskSortOrder(patch.projectId));
      }
    }
  }

  if (sets.length > 0) {
    values.push(id);
    db.prepare(`UPDATE gtd_tasks SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  }
  return getGtdTaskOrThrow(id);
}

export function completeGtdTask(id: number): void {
  const row = getWritableGtdTaskRow(id);
  if (row.completed_at !== null) return;
  db.prepare("UPDATE gtd_tasks SET completed_at = datetime('now') WHERE id = ?").run(id);
}

export function reopenGtdTask(id: number): void {
  const row = getWritableGtdTaskRow(id);
  if (row.completed_at === null) return;
  db.prepare("UPDATE gtd_tasks SET completed_at = NULL WHERE id = ?").run(id);
}

export function deleteGtdTask(id: number): void {
  getWritableGtdTaskRow(id);
  db.prepare("DELETE FROM gtd_tasks WHERE id = ?").run(id);
}

export function clearCompletedGtdTasks(): void {
  db.prepare(`
    DELETE FROM gtd_tasks
    WHERE completed_at IS NOT NULL
      AND (project_id IS NULL OR project_id IN (SELECT id FROM gtd_projects WHERE archived_at IS NULL))
  `).run();
}

export function reorderGtdProjectTasks(projectId: number, orderedIds: number[]): void {
  assertGtdProjectWritable(projectId);
  db.transaction(() => {
    const update = db.prepare("UPDATE gtd_tasks SET sort_order = ? WHERE id = ? AND project_id = ?");
    orderedIds.forEach((taskId, index) => update.run(index, taskId, projectId));
  })();
}

export function addGtdProject(title: string): GtdProject {
  const clean = normalizeGtdTitle(title);
  const id = db.prepare("INSERT INTO gtd_projects (title) VALUES (?)").run(clean).lastInsertRowid as number;
  return getGtdProjectOrThrow(id);
}

export function updateGtdProject(
  id: number,
  patch: { title?: string; description?: string; color?: string },
): GtdProject {
  assertGtdProjectWritable(id);
  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (patch.title !== undefined) {
    sets.push("title = ?");
    values.push(normalizeGtdTitle(patch.title));
  }
  if (patch.description !== undefined) {
    sets.push("description = ?");
    values.push(patch.description);
  }
  if (patch.color !== undefined) {
    sets.push("color = ?");
    values.push(patch.color);
  }
  if (sets.length > 0) {
    values.push(id);
    db.prepare(`UPDATE gtd_projects SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  }
  return getGtdProjectOrThrow(id);
}

export function setGtdProjectArchived(id: number, archived: boolean): void {
  if (archived) {
    db.prepare("UPDATE gtd_projects SET archived_at = datetime('now') WHERE id = ? AND archived_at IS NULL").run(id);
  } else {
    db.prepare("UPDATE gtd_projects SET archived_at = NULL WHERE id = ? AND archived_at IS NOT NULL").run(id);
  }
}

export function deleteGtdProject(id: number): void {
  db.transaction(() => {
    db.prepare("UPDATE gtd_tasks SET project_id = NULL WHERE project_id = ?").run(id);
    db.prepare("DELETE FROM gtd_projects WHERE id = ?").run(id);
  })();
}

// ---- Project docs (a per-project folder + linked notes/canvases) ----

export function getGtdProjectFolder(projectId: number): GtdProjectFolderRow | null {
  const row = db.prepare(
    "SELECT project_id, vault_path, folder_path FROM gtd_project_folders WHERE project_id = ?",
  ).get(projectId) as GtdProjectFolderRow | undefined;
  return row ?? null;
}

export function getGtdProjectFolders(): GtdProjectFolderRow[] {
  return db.prepare(
    "SELECT project_id, vault_path, folder_path FROM gtd_project_folders ORDER BY project_id",
  ).all() as GtdProjectFolderRow[];
}

export function setGtdProjectFolder(
  projectId: number,
  vaultPath: string,
  folderPath: string,
): GtdProjectFolderRow {
  db.prepare(`
    INSERT INTO gtd_project_folders (project_id, vault_path, folder_path)
    VALUES (?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      vault_path = excluded.vault_path,
      folder_path = excluded.folder_path
  `).run(projectId, vaultPath, folderPath);
  const row = getGtdProjectFolder(projectId);
  if (!row) throw new Error(`GTD project folder not found: ${projectId}`);
  return row;
}

export function getGtdProjectsForFilePath(filePath: string): GtdProject[] {
  const rows = db.prepare(
    "SELECT DISTINCT project_id FROM gtd_project_links WHERE file_path = ? ORDER BY project_id",
  ).all(filePath) as { project_id: number }[];
  return rows.map((row) => getGtdProjectOrThrow(row.project_id));
}

export function getGtdProjectLinks(projectId: number): GtdProjectLinkRow[] {
  return db.prepare(
    "SELECT id, project_id, kind, vault_path, file_path, title, sort_order FROM gtd_project_links WHERE project_id = ? ORDER BY sort_order, id",
  ).all(projectId) as GtdProjectLinkRow[];
}

export function setGtdProjectLink(
  projectId: number,
  kind: GtdProjectLinkKind,
  vaultPath: string,
  filePath: string,
  title: string,
): GtdProjectLinkRow {
  assertGtdProjectWritable(projectId);
  const cleanTitle = normalizeGtdTitle(title);
  const next = db.prepare(
    "SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM gtd_project_links WHERE project_id = ?",
  ).get(projectId) as { next: number };
  db.prepare(`
    INSERT INTO gtd_project_links (project_id, kind, vault_path, file_path, title, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, file_path) DO UPDATE SET
      kind = excluded.kind,
      vault_path = excluded.vault_path,
      title = excluded.title
  `).run(projectId, kind, vaultPath, filePath, cleanTitle, next.next);
  const row = db.prepare(
    "SELECT id, project_id, kind, vault_path, file_path, title, sort_order FROM gtd_project_links WHERE project_id = ? AND file_path = ?",
  ).get(projectId, filePath) as GtdProjectLinkRow | undefined;
  if (!row) throw new Error("GTD project link not found after write");
  return row;
}

export function removeGtdProjectLink(linkId: number): void {
  const row = db.prepare("SELECT project_id FROM gtd_project_links WHERE id = ?").get(linkId) as
    { project_id: number } | undefined;
  if (!row) return;
  assertGtdProjectWritable(row.project_id);
  db.prepare("DELETE FROM gtd_project_links WHERE id = ?").run(linkId);
}

export function renameGtdProjectLinkPath(oldPath: string, newPath: string, title: string): void {
  db.prepare(
    "UPDATE gtd_project_links SET file_path = ?, title = ? WHERE file_path = ?",
  ).run(newPath, title, oldPath);
}

// Keep project links pointing at the right file after a rename, even when the
// note wasn't indexed (renameNoteInDb returns null for those).
export function renameNoteEntry(oldPath: string, newPath: string, newTitle: string): void {
  db.transaction(() => {
    db.prepare("UPDATE gtd_project_links SET file_path = ?, title = ? WHERE file_path = ?").run(newPath, newTitle, oldPath);
  })();
}
