import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { app } from "electron";
import type {
  GrowthAnnualNote,
  GrowthAnnualNoteInput,
  GrowthArtifact,
  GrowthArtifactInput,
  GrowthArtifactKind,
  GrowthArtifactPatch,
  GrowthAttribution,
  GrowthBackup,
  GrowthBackupCounts,
  GrowthCapability,
  GrowthCapabilityInput,
  GrowthCapabilityPatch,
  GrowthChallenge,
  GrowthChallengeInput,
  GrowthChallengePatch,
  GrowthChallengeStatus,
  GrowthCoverTransform,
  GrowthDomain,
  GrowthEvidence,
  GrowthEvidenceInput,
  GrowthEvidenceKind,
  GrowthFeedback,
  GrowthFeedbackInput,
  GrowthHalfLife,
  GrowthPortability,
  GrowthPrediction,
  GrowthPredictionInput,
  GrowthPredictionKind,
  GrowthResolveInput,
  GrowthResolveResult,
  GrowthReviewInput,
  GrowthReviewResult,
  GrowthSeason,
  GrowthSeasonInput,
  GrowthSeasonPatch,
  GrowthSelfModelEntry,
  GrowthSelfModelInput,
  GrowthSelfModelPatch,
  GrowthSelfSection,
  GrowthSnapshot,
  GrowthState,
  GrowthStatus,
  GrowthTask,
  GrowthTaskInput,
  GrowthTaskPatch,
  GrowthTasksPayload,
  NoteBrief,
  NoteContentHit,
  PdfDocument,
  Resource,
  ResourceCollection,
} from "../src/shared/models";

let db: Database.Database;

export function initDatabase(): void {
  const dbPath = path.join(app.getPath("userData"), "prism.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Legacy prototype DBs may already have a `resource_collections` join table
  // with a different shape (resource_id + collection_id). Reconcile it before the
  // schema below runs; the canonical table must exist and be named
  // `resource_collections` so the `resources.collection_id` FK resolves.
  // Child rows in `resources.collection_id` are still NULL at this point, so
  // dropping the join table cannot trip an FK check.
  const tableExists = (name: string) => (
    (db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) as { count: number }).count > 0
  );

  // A previous failed run may have parked the canonical table while the legacy
  // join table was renamed aside; swap them back so the FK target is correct
  // (SQLite rewrites FK clauses on RENAME, so order matters).
  const resourceFk = (db.prepare("PRAGMA foreign_key_list(resources)").all() as { from: string; table: string }[])
    .find((fk) => fk.from === "collection_id");
  if (resourceFk?.table === "resource_collections_legacy") {
    const parked = "resource_collections__parked";
    db.exec(`DROP TABLE IF EXISTS ${parked}`);
    if (tableExists("resource_collections")) {
      db.exec(`ALTER TABLE resource_collections RENAME TO ${parked}`);
    }
    db.exec("ALTER TABLE resource_collections_legacy RENAME TO resource_collections");
  }

  // Snapshot prototype rows (no constraints) and drop the join table so the new
  // single-assignment table can take its name.
  const legacyCollections = db.prepare("PRAGMA table_info(resource_collections)").all() as { name: string }[];
  if (legacyCollections.length > 0 && !legacyCollections.some((column) => column.name === "name")) {
    const rows = db.prepare("SELECT COUNT(*) AS count FROM resource_collections").get() as { count: number };
    db.exec("DROP TABLE IF EXISTS resource_collections_legacy");
    if (rows.count > 0) {
      // Keep the prototype mapping readable; it has no collection names to port.
      db.exec("CREATE TABLE resource_collections_legacy AS SELECT * FROM resource_collections");
    }
    db.exec("DROP TABLE resource_collections");
  }
  if (tableExists("resource_collections__parked")) {
    db.exec("ALTER TABLE resource_collections__parked RENAME TO resource_collections");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS resource_collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      collection_id INTEGER REFERENCES resource_collections(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

  // Growth (养成): capability scale, evidence and append-only snapshots.
  // Levels are behavioural anchors rated 1..5, confidence 0..5; the review
  // function is the only path that changes either one, and raising a level
  // requires evidence recorded after the previous review.
  db.exec(`
    CREATE TABLE IF NOT EXISTS growth_domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      weight REAL NOT NULL DEFAULT 0.15,
      theme TEXT NOT NULL DEFAULT 'violet',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS growth_capabilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain_id INTEGER NOT NULL,
      parent_id INTEGER,
      name TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 6),
      confidence INTEGER NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 5),
      half_life TEXT NOT NULL DEFAULT 'mid' CHECK (half_life IN ('long','mid','short')),
      portability TEXT NOT NULL DEFAULT 'high' CHECK (portability IN ('high','low')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','observe','archived')),
      target_level INTEGER CHECK (target_level BETWEEN 1 AND 6),
      target_date TEXT,
      evidence_definition TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      last_evidence_at TEXT,
      last_reviewed_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (domain_id) REFERENCES growth_domains(id) ON DELETE RESTRICT,
      FOREIGN KEY (parent_id) REFERENCES growth_capabilities(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_growth_capabilities_domain
      ON growth_capabilities(domain_id, status, sort_order);

    CREATE TABLE IF NOT EXISTS growth_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      capability_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('artifact','feedback','metric','usage')),
      title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      happened_on TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (capability_id) REFERENCES growth_capabilities(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_growth_evidence_cap
      ON growth_evidence(capability_id, happened_on DESC);

    CREATE TABLE IF NOT EXISTS growth_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      capability_id INTEGER NOT NULL,
      level INTEGER NOT NULL,
      confidence INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      taken_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (capability_id) REFERENCES growth_capabilities(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_growth_snapshots_cap
      ON growth_snapshots(capability_id, taken_at DESC);

    CREATE TABLE IF NOT EXISTS growth_seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      focus TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      theme TEXT NOT NULL DEFAULT 'violet',
      closed_at TEXT,
      outcome TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS growth_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      capability_id INTEGER,
      season_id INTEGER,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      goal TEXT NOT NULL DEFAULT '',
      criteria TEXT NOT NULL DEFAULT '',
      reflection TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      difficulty_level INTEGER NOT NULL DEFAULT 3 CHECK (difficulty_level BETWEEN 1 AND 6),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','passed','failed','abandoned')),
      attribution TEXT CHECK (attribution IN ('stats','buff')),
      result_note TEXT NOT NULL DEFAULT '',
      resolved_on TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (capability_id) REFERENCES growth_capabilities(id) ON DELETE CASCADE,
      FOREIGN KEY (season_id) REFERENCES growth_seasons(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_growth_challenges_cap
      ON growth_challenges(capability_id, status);
    CREATE INDEX IF NOT EXISTS idx_growth_challenges_season
      ON growth_challenges(season_id, status);

    CREATE TABLE IF NOT EXISTS growth_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      capability_id INTEGER,
      challenge_id INTEGER,
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('demo','article','repo','doc','other')),
      url TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      created_on TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (capability_id) REFERENCES growth_capabilities(id) ON DELETE CASCADE,
      FOREIGN KEY (challenge_id) REFERENCES growth_challenges(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_growth_artifacts_cap
      ON growth_artifacts(capability_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS growth_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      capability_id INTEGER,
      challenge_id INTEGER,
      scheduled_date TEXT,
      due_date TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (capability_id) REFERENCES growth_capabilities(id) ON DELETE SET NULL,
      FOREIGN KEY (challenge_id) REFERENCES growth_challenges(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_growth_tasks_capability
      ON growth_tasks(capability_id, completed_at);
    CREATE INDEX IF NOT EXISTS idx_growth_tasks_scheduled
      ON growth_tasks(scheduled_date) WHERE scheduled_date IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_growth_tasks_due
      ON growth_tasks(due_date) WHERE due_date IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_growth_tasks_completed
      ON growth_tasks(completed_at) WHERE completed_at IS NOT NULL;

    CREATE TABLE IF NOT EXISTS growth_predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN ('time','difficulty','mood')),
      subject TEXT NOT NULL,
      predicted REAL NOT NULL,
      actual REAL,
      predicted_on TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      capability_id INTEGER,
      challenge_id INTEGER,
      task_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (capability_id) REFERENCES growth_capabilities(id) ON DELETE SET NULL,
      FOREIGN KEY (challenge_id) REFERENCES growth_challenges(id) ON DELETE SET NULL,
      FOREIGN KEY (task_id) REFERENCES growth_tasks(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_growth_predictions_on ON growth_predictions(predicted_on DESC);

    CREATE TABLE IF NOT EXISTS growth_self_model (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section TEXT NOT NULL CHECK (section IN
        ('energy','motivation','procrastination','bias','learning','social','values','blindspots')),
      statement TEXT NOT NULL,
      evidence TEXT NOT NULL DEFAULT '',
      confidence INTEGER NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 5),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS growth_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL DEFAULT '',
      strengths TEXT NOT NULL DEFAULT '',
      weakness TEXT NOT NULL DEFAULT '',
      friction TEXT NOT NULL DEFAULT '',
      calibration TEXT NOT NULL DEFAULT '',
      received_on TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS growth_annual_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL UNIQUE,
      summary TEXT NOT NULL DEFAULT '',
      kept TEXT NOT NULL DEFAULT '',
      dropped TEXT NOT NULL DEFAULT '',
      milestones TEXT NOT NULL DEFAULT '[]',
      next_focus TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS growth_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_type TEXT NOT NULL,
      owner_id INTEGER NOT NULL,
      file TEXT NOT NULL,
      transform TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (owner_type, owner_id, file)
    );
    CREATE INDEX IF NOT EXISTS idx_growth_media_owner
      ON growth_media(owner_type, owner_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_growth_media_file
      ON growth_media(file);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_growth_media_one_cover
      ON growth_media(owner_type, owner_id) WHERE is_cover = 1;
    CREATE TRIGGER IF NOT EXISTS growth_season_media_cleanup
    AFTER DELETE ON growth_seasons
    BEGIN
      DELETE FROM growth_media WHERE owner_type = 'season' AND owner_id = OLD.id;
    END;
    CREATE TRIGGER IF NOT EXISTS growth_artifact_media_cleanup
    AFTER DELETE ON growth_artifacts
    BEGIN
      DELETE FROM growth_media WHERE owner_type = 'artifact' AND owner_id = OLD.id;
    END;
    CREATE INDEX IF NOT EXISTS idx_growth_tasks_challenge
      ON growth_tasks(challenge_id);
    CREATE INDEX IF NOT EXISTS idx_growth_predictions_capability
      ON growth_predictions(capability_id, predicted_on DESC);
    CREATE INDEX IF NOT EXISTS idx_growth_predictions_challenge
      ON growth_predictions(challenge_id);
    CREATE INDEX IF NOT EXISTS idx_growth_predictions_task
      ON growth_predictions(task_id);
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

  // Migration: web resources moved from multi-tag grouping to single-assignment
  // collections. One-time and destructive by design (approved): add the column,
  // turn every old tag into a collection, put each resource into its first tag
  // (tag order), then drop the tag tables. Multi-tag membership is intentionally
  // not preserved — only the first tag per resource survives as its collection.
  // Keyed on the tags table (not the column) so a failed run retries on the next
  // start; both statements are idempotent.
  if (resourceCols.length > 0 && !resourceCols.some((c) => c.name === "collection_id")) {
    db.exec("ALTER TABLE resources ADD COLUMN collection_id INTEGER REFERENCES resource_collections(id) ON DELETE SET NULL");
  }
  const tagTable = db.prepare(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'tags'",
  ).get() as { count: number };
  if (tagTable.count > 0) {
    const tagCols = db.prepare("PRAGMA table_info(tags)").all() as { name: string }[];
    const colorExpr = tagCols.some((c) => c.name === "color") ? "color" : "''";
    const orderExpr = tagCols.some((c) => c.name === "sort_order") ? "sort_order" : "id";
    const orderColumn = orderExpr === "sort_order" ? "t.sort_order" : "t.id";
    db.transaction(() => {
      db.exec(`
        INSERT OR IGNORE INTO resource_collections (name, color, sort_order)
        SELECT name, ${colorExpr}, ${orderExpr} FROM tags
      `);
      db.exec(`
        UPDATE resources SET collection_id = (
          SELECT rc.id
          FROM resource_tags rt
          JOIN tags t ON t.id = rt.tag_id
          JOIN resource_collections rc ON rc.name = t.name
          WHERE rt.resource_id = resources.id
          ORDER BY ${orderColumn} ASC, t.id ASC
          LIMIT 1
        )
      `);
      db.exec("DROP TABLE IF EXISTS resource_tags");
      db.exec("DROP TABLE IF EXISTS tags");
    })();
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_resources_collection ON resources(collection_id)");
}

// ---- Resource operations ----

interface ResourceRow {
  id: number;
  url: string;
  title: string;
  notes: string;
  created_at: string;
  collection_id: number | null;
}

interface ResourceCollectionRow {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  count: number;
}

const RESOURCE_SELECT = "SELECT r.* FROM resources r";

export function addResource(url: string, title: string, notes: string, collectionId: number | null): Resource {
  const insertResource = db.prepare(
    "INSERT INTO resources (url, title, notes, sort_order, collection_id) VALUES (?, ?, ?, ?, ?)",
  );
  const id = db.transaction(() => {
    const { next } = db.prepare("SELECT COALESCE(MIN(sort_order), 0) - 1 AS next FROM resources").get() as { next: number };
    return insertResource.run(url, title, notes, next, collectionId).lastInsertRowid as number;
  })();

  return getResource(id)!;
}

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

export function updateResource(
  id: number,
  url: string,
  title: string,
  notes: string,
  collectionId: number | null,
): Resource | null {
  db.prepare("UPDATE resources SET url = ?, title = ?, notes = ?, collection_id = ? WHERE id = ?")
    .run(url, title, notes, collectionId, id);
  return getResource(id);
}

export function deleteResource(id: number): boolean {
  return db.prepare("DELETE FROM resources WHERE id = ?").run(id).changes > 0;
}

/** Single-assignment move: the collection id (or null = uncategorized). */
export function moveResources(ids: number[], collectionId: number | null): number {
  if (ids.length === 0) return 0;
  return db.transaction(() => {
    const update = db.prepare("UPDATE resources SET collection_id = ? WHERE id = ?");
    let changed = 0;
    for (const id of ids) changed += update.run(collectionId, id).changes;
    return changed;
  })();
}

export function getResourceCollections(): { collections: ResourceCollection[]; ungroupedCount: number } {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.color, c.sort_order, (
      SELECT COUNT(*) FROM resources r WHERE r.collection_id = c.id
    ) AS count
    FROM resource_collections c
    ORDER BY c.sort_order ASC, c.id ASC
  `).all() as ResourceCollectionRow[];
  const ungrouped = db.prepare("SELECT COUNT(*) AS count FROM resources WHERE collection_id IS NULL").get() as { count: number };
  return {
    collections: rows.map(rowToResourceCollection),
    ungroupedCount: ungrouped.count,
  };
}

export function createResourceCollection(name: string, color = ""): ResourceCollection {
  const trimmed = name.trim();
  const { next } = db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM resource_collections").get() as { next: number };
  const id = db.prepare("INSERT INTO resource_collections (name, color, sort_order) VALUES (?, ?, ?)")
    .run(trimmed, color, next).lastInsertRowid as number;
  return { id, name: trimmed, color, sortOrder: next, count: 0 };
}

export function renameResourceCollection(id: number, name: string): void {
  db.prepare("UPDATE resource_collections SET name = ? WHERE id = ?").run(name.trim(), id);
}

export function setResourceCollectionColor(id: number, color: string): void {
  db.prepare("UPDATE resource_collections SET color = ? WHERE id = ?").run(color, id);
}

export function reorderResourceCollections(orderedIds: number[]): void {
  if (orderedIds.length === 0) return;
  db.transaction(() => {
    const all = db.prepare("SELECT id FROM resource_collections ORDER BY sort_order ASC, id ASC").all() as { id: number }[];
    const wanted = new Set(orderedIds);
    const slots: number[] = [];
    all.forEach((row, index) => {
      if (wanted.has(row.id)) slots.push(index);
    });
    if (new Set(orderedIds).size !== orderedIds.length || slots.length !== orderedIds.length) return;
    const next = all.map((row) => row.id);
    slots.forEach((slot, i) => { next[slot] = orderedIds[i]; });
    const update = db.prepare("UPDATE resource_collections SET sort_order = ? WHERE id = ?");
    next.forEach((id, index) => update.run(index, id));
  })();
}

/** Members fall back to uncategorized through the FK's ON DELETE SET NULL. */
export function deleteResourceCollection(id: number): void {
  db.prepare("DELETE FROM resource_collections WHERE id = ?").run(id);
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
    collectionId: row.collection_id,
  };
}

function rowToResourceCollection(row: ResourceCollectionRow): ResourceCollection {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    count: row.count,
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

// ---- Growth (养成) ----

const GROWTH_HALF_LIVES: GrowthHalfLife[] = ["long", "mid", "short"];
const GROWTH_PORTABILITIES: GrowthPortability[] = ["high", "low"];
const GROWTH_STATUSES: GrowthStatus[] = ["active", "observe", "archived"];
const GROWTH_EVIDENCE_KINDS: GrowthEvidenceKind[] = ["artifact", "feedback", "metric", "usage"];

interface GrowthDomainRow {
  id: number;
  name: string;
  weight: number;
  theme: string;
  sort_order: number;
  created_at: string;
  capability_count?: number;
}

interface GrowthCapabilityRow {
  id: number;
  domain_id: number;
  parent_id: number | null;
  name: string;
  level: number;
  confidence: number;
  half_life: GrowthHalfLife;
  portability: GrowthPortability;
  status: GrowthStatus;
  target_level: number | null;
  target_date: string | null;
  evidence_definition: string;
  notes: string;
  last_evidence_at: string | null;
  last_reviewed_at: string | null;
  evidence_count?: number;
  created_at: string;
  updated_at: string;
}

interface GrowthEvidenceRow {
  id: number;
  capability_id: number;
  kind: GrowthEvidenceKind;
  title: string;
  detail: string;
  url: string;
  happened_on: string | null;
  created_at: string;
}

interface GrowthSnapshotRow {
  id: number;
  capability_id: number;
  level: number;
  confidence: number;
  note: string;
  taken_at: string;
}

function toGrowthDomain(row: GrowthDomainRow): GrowthDomain {
  return {
    id: row.id,
    name: row.name,
    weight: row.weight,
    theme: row.theme,
    sortOrder: row.sort_order,
    capabilityCount: row.capability_count ?? 0,
  };
}

function toGrowthCapability(row: GrowthCapabilityRow): GrowthCapability {
  return {
    id: row.id,
    domainId: row.domain_id,
    parentId: row.parent_id,
    name: row.name,
    level: row.level,
    confidence: row.confidence,
    halfLife: row.half_life,
    portability: row.portability,
    status: row.status,
    targetLevel: row.target_level,
    targetDate: row.target_date,
    evidenceDefinition: row.evidence_definition,
    notes: row.notes,
    lastEvidenceAt: row.last_evidence_at,
    lastReviewedAt: row.last_reviewed_at,
    evidenceCount: row.evidence_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toGrowthEvidence(row: GrowthEvidenceRow): GrowthEvidence {
  return {
    id: row.id,
    capabilityId: row.capability_id,
    kind: row.kind,
    title: row.title,
    detail: row.detail,
    url: row.url,
    happenedOn: row.happened_on,
    createdAt: row.created_at,
  };
}

function toGrowthSnapshot(row: GrowthSnapshotRow): GrowthSnapshot {
  return {
    id: row.id,
    capabilityId: row.capability_id,
    level: row.level,
    confidence: row.confidence,
    note: row.note,
    takenAt: row.taken_at,
  };
}

interface GrowthSeasonRow {
  id: number;
  title: string;
  focus: string;
  start_date: string;
  end_date: string;
  theme: string;
  closed_at: string | null;
  outcome: string;
  created_at: string;
}

interface GrowthChallengeRow {
  id: number;
  capability_id: number | null;
  season_id: number | null;
  title: string;
  description: string;
  goal: string;
  criteria: string;
  reflection: string;
  body: string;
  difficulty_level: number;
  status: GrowthChallengeStatus;
  attribution: GrowthAttribution | null;
  result_note: string;
  resolved_on: string | null;
  created_at: string;
  capability_name: string | null;
  season_title: string | null;
}

interface GrowthArtifactRow {
  id: number;
  capability_id: number | null;
  challenge_id: number | null;
  title: string;
  kind: GrowthArtifactKind;
  url: string;
  note: string;
  body: string;
  created_on: string | null;
  created_at: string;
  capability_name: string | null;
}

export type GrowthMediaOwnerType = "season" | "artifact";

interface GrowthMediaRow {
  id: number;
  owner_type: GrowthMediaOwnerType;
  owner_id: number;
  file: string;
  transform: string;
  sort_order: number;
  is_cover: number;
  created_at: string;
}

interface GrowthMediaInput {
  file: string;
  transform?: unknown;
  isCover?: boolean;
}

interface GrowthPredictionRow {
  id: number;
  kind: GrowthPredictionKind;
  subject: string;
  predicted: number;
  actual: number | null;
  predicted_on: string;
  note: string;
  capability_id: number | null;
  challenge_id: number | null;
  task_id: number | null;
  created_at: string;
  capability_name: string | null;
  challenge_title: string | null;
  task_title: string | null;
}

interface GrowthSelfModelRow {
  id: number;
  section: GrowthSelfSection;
  statement: string;
  evidence: string;
  confidence: number;
  updated_at: string;
  created_at: string;
}

interface GrowthFeedbackRow {
  id: number;
  source: string;
  strengths: string;
  weakness: string;
  friction: string;
  calibration: string;
  received_on: string;
  created_at: string;
}

interface GrowthAnnualNoteRow {
  id: number;
  year: number;
  summary: string;
  kept: string;
  dropped: string;
  milestones: string;
  next_focus: string;
  updated_at: string;
}

function toGrowthSeason(row: GrowthSeasonRow, media: GrowthMediaRow[] = []): GrowthSeason {
  const coverRow = media.find((entry) => entry.is_cover === 1) ?? media[0];
  return {
    id: row.id,
    title: row.title,
    focus: row.focus,
    startDate: row.start_date,
    endDate: row.end_date,
    theme: row.theme,
    cover: coverRow?.file ?? "",
    coverTransform: coverRow ? parseGrowthCoverTransform(coverRow.transform) : null,
    closedAt: row.closed_at,
    outcome: row.outcome,
    createdAt: row.created_at,
  };
}

function toGrowthChallenge(row: GrowthChallengeRow): GrowthChallenge {
  return {
    id: row.id,
    capabilityId: row.capability_id,
    capabilityName: row.capability_name ?? "",
    seasonId: row.season_id,
    seasonTitle: row.season_title ?? "",
    title: row.title,
    description: row.description,
    goal: row.goal,
    criteria: row.criteria,
    reflection: row.reflection,
    body: row.body,
    difficultyLevel: row.difficulty_level,
    status: row.status,
    attribution: row.attribution,
    resultNote: row.result_note,
    resolvedOn: row.resolved_on,
    createdAt: row.created_at,
  };
}

function toGrowthArtifact(row: GrowthArtifactRow, media: GrowthMediaRow[] = []): GrowthArtifact {
  const coverRow = media.find((entry) => entry.is_cover === 1) ?? media[0];
  return {
    id: row.id,
    capabilityId: row.capability_id,
    capabilityName: row.capability_name ?? "",
    challengeId: row.challenge_id,
    title: row.title,
    kind: row.kind,
    url: row.url,
    note: row.note,
    body: row.body,
    cover: coverRow?.file ?? "",
    images: media.map((entry) => entry.file),
    createdOn: row.created_on,
    createdAt: row.created_at,
  };
}

const GROWTH_CHALLENGE_SELECT = `
  SELECT c.*,
    cap.name AS capability_name,
    s.title AS season_title
  FROM growth_challenges c
  LEFT JOIN growth_capabilities cap ON cap.id = c.capability_id
  LEFT JOIN growth_seasons s ON s.id = c.season_id
`;

const GROWTH_ARTIFACT_SELECT = `
  SELECT a.*, cap.name AS capability_name
  FROM growth_artifacts a
  LEFT JOIN growth_capabilities cap ON cap.id = a.capability_id
`;

const GROWTH_PREDICTION_SELECT = `
  SELECT p.*,
    c.name AS capability_name,
    ch.title AS challenge_title,
    t.title AS task_title
  FROM growth_predictions p
  LEFT JOIN growth_capabilities c ON c.id = p.capability_id
  LEFT JOIN growth_challenges ch ON ch.id = p.challenge_id
  LEFT JOIN growth_tasks t ON t.id = p.task_id
`;

function toGrowthPrediction(row: GrowthPredictionRow): GrowthPrediction {
  return {
    id: row.id,
    kind: row.kind,
    subject: row.subject,
    predicted: row.predicted,
    actual: row.actual,
    predictedOn: row.predicted_on,
    note: row.note,
    capability:
      row.capability_id === null
        ? null
        : { id: row.capability_id, name: row.capability_name ?? "" },
    challenge:
      row.challenge_id === null
        ? null
        : { id: row.challenge_id, title: row.challenge_title ?? "" },
    task:
      row.task_id === null ? null : { id: row.task_id, title: row.task_title ?? "" },
    createdAt: row.created_at,
  };
}

function toGrowthSelfModelEntry(row: GrowthSelfModelRow): GrowthSelfModelEntry {
  return {
    id: row.id,
    section: row.section,
    statement: row.statement,
    evidence: row.evidence,
    confidence: row.confidence,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function toGrowthFeedback(row: GrowthFeedbackRow): GrowthFeedback {
  return {
    id: row.id,
    source: row.source,
    strengths: row.strengths,
    weakness: row.weakness,
    friction: row.friction,
    calibration: row.calibration,
    receivedOn: row.received_on,
    createdAt: row.created_at,
  };
}

function toGrowthAnnualNote(row: GrowthAnnualNoteRow): GrowthAnnualNote {
  return {
    id: row.id,
    year: row.year,
    summary: row.summary,
    kept: row.kept,
    dropped: row.dropped,
    milestones: parseGrowthMilestones(row.milestones),
    nextFocus: row.next_focus,
    updatedAt: row.updated_at,
  };
}

/** Milestones are stored as a JSON array; anything malformed reads as empty. */
function parseGrowthMilestones(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 3);
  } catch {
    return [];
  }
}

const GROWTH_CAPABILITY_SELECT = `
  SELECT c.*,
    (SELECT COUNT(*) FROM growth_evidence e WHERE e.capability_id = c.id) AS evidence_count
  FROM growth_capabilities c
`;

function assertGrowthInt(value: number, min: number, max: number, field: string): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid growth ${field}: ${String(value)}`);
  }
  return parsed;
}

function assertGrowthId(value: number, field: string): number {
  return assertGrowthInt(value, 1, Number.MAX_SAFE_INTEGER, field);
}

function assertGrowthEnum<T extends string>(value: T, allowed: readonly T[], field: string): T {
  if (!allowed.includes(value)) throw new Error(`Invalid growth ${field}: ${String(value)}`);
  return value;
}

function normalizeGrowthName(value: string): string {
  const name = String(value ?? "").trim();
  if (!name) throw new Error("Growth name cannot be empty");
  return name;
}

/** Local calendar day, matching the renderer's dateKey(). */
function growthDateKey(offsetDays = 0): string {
  const now = new Date(Date.now() - offsetDays * 86_400_000);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function growthTodayKey(): string {
  return growthDateKey(0);
}

function getGrowthDomainOrThrow(id: number): GrowthDomain {
  const row = db.prepare(`
    SELECT d.*,
      (SELECT COUNT(*) FROM growth_capabilities c
        WHERE c.domain_id = d.id AND c.status != 'archived') AS capability_count
    FROM growth_domains d
    WHERE d.id = ?
  `).get(id) as GrowthDomainRow | undefined;
  if (!row) throw new Error(`Growth domain not found: ${id}`);
  return toGrowthDomain(row);
}

function getGrowthCapabilityOrThrow(id: number): GrowthCapability {
  const row = db.prepare(`${GROWTH_CAPABILITY_SELECT} WHERE c.id = ?`).get(id) as
    GrowthCapabilityRow | undefined;
  if (!row) throw new Error(`Growth capability not found: ${id}`);
  return toGrowthCapability(row);
}

function requireGrowthCapabilityRow(id: number): GrowthCapabilityRow {
  const row = db.prepare(`${GROWTH_CAPABILITY_SELECT} WHERE c.id = ?`).get(id) as
    GrowthCapabilityRow | undefined;
  if (!row) throw new Error(`Growth capability not found: ${id}`);
  return row;
}

function getGrowthEvidenceOrThrow(id: number): GrowthEvidence {
  const row = db.prepare("SELECT * FROM growth_evidence WHERE id = ?").get(id) as
    GrowthEvidenceRow | undefined;
  if (!row) throw new Error(`Growth evidence not found: ${id}`);
  return toGrowthEvidence(row);
}

function getGrowthSnapshotOrThrow(id: number): GrowthSnapshot {
  const row = db.prepare("SELECT * FROM growth_snapshots WHERE id = ?").get(id) as
    GrowthSnapshotRow | undefined;
  if (!row) throw new Error(`Growth snapshot not found: ${id}`);
  return toGrowthSnapshot(row);
}

export function getGrowthState(): GrowthState {
  const domainRows = db.prepare(`
    SELECT d.*,
      (SELECT COUNT(*) FROM growth_capabilities c
        WHERE c.domain_id = d.id AND c.status != 'archived') AS capability_count
    FROM growth_domains d
    ORDER BY d.sort_order ASC, d.id ASC
  `).all() as GrowthDomainRow[];
  const capabilityRows = db.prepare(`
    ${GROWTH_CAPABILITY_SELECT}
    ORDER BY c.status ASC, c.sort_order ASC, c.id ASC
  `).all() as GrowthCapabilityRow[];
  const seasonRows = db.prepare(
    "SELECT * FROM growth_seasons ORDER BY closed_at IS NOT NULL, start_date DESC, id DESC",
  ).all() as GrowthSeasonRow[];
  const challengeRows = db.prepare(`
    ${GROWTH_CHALLENGE_SELECT}
    ORDER BY c.status ASC, c.id DESC
  `).all() as GrowthChallengeRow[];
  const artifactRows = db.prepare(`
    ${GROWTH_ARTIFACT_SELECT}
    ORDER BY a.created_at DESC, a.id DESC
  `).all() as GrowthArtifactRow[];
  const predictionRows = db.prepare(`
    ${GROWTH_PREDICTION_SELECT}
    WHERE p.actual IS NULL OR p.predicted_on >= ?
    ORDER BY p.predicted_on DESC, p.id DESC
  `).all(growthDateKey(90)) as GrowthPredictionRow[];
  const selfModelRows = db.prepare(`
    SELECT * FROM growth_self_model
    ORDER BY section ASC, updated_at DESC, id DESC
  `).all() as GrowthSelfModelRow[];
  const feedbackRows = db.prepare(`
    SELECT * FROM growth_feedback
    ORDER BY received_on DESC, id DESC
  `).all() as GrowthFeedbackRow[];
  const annualRows = db.prepare(
    "SELECT * FROM growth_annual_notes ORDER BY year DESC",
  ).all() as GrowthAnnualNoteRow[];
  const seasonMedia = getGrowthMediaRowsByOwner("season");
  const artifactMedia = getGrowthMediaRowsByOwner("artifact");
  return {
    domains: domainRows.map(toGrowthDomain),
    capabilities: capabilityRows.map(toGrowthCapability),
    seasons: seasonRows.map((row) => toGrowthSeason(row, seasonMedia.get(row.id) ?? [])),
    challenges: challengeRows.map(toGrowthChallenge),
    artifacts: artifactRows.map((row) => toGrowthArtifact(row, artifactMedia.get(row.id) ?? [])),
    predictions: predictionRows.map(toGrowthPrediction),
    selfModel: selfModelRows.map(toGrowthSelfModelEntry),
    feedback: feedbackRows.map(toGrowthFeedback),
    annualNotes: annualRows.map(toGrowthAnnualNote),
  };
}

export function createGrowthDomain(name: string, weight: number, theme?: string): GrowthDomain {
  const clean = normalizeGrowthName(name);
  const raw = Number(weight);
  const safeWeight = Number.isFinite(raw) ? Math.min(1, Math.max(0.01, raw)) : 0.15;
  const next = db.prepare(
    "SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM growth_domains",
  ).get() as { next: number };
  const id = db.prepare(
    "INSERT INTO growth_domains (name, weight, theme, sort_order) VALUES (?, ?, ?, ?)",
  ).run(clean, safeWeight, normalizeGrowthTheme(theme), next.next).lastInsertRowid as number;
  return getGrowthDomainOrThrow(id);
}

export function updateGrowthDomain(
  id: number,
  patch: { name?: string; weight?: number; theme?: string },
): GrowthDomain {
  const domainId = assertGrowthId(id, "domain id");
  const current = db.prepare("SELECT * FROM growth_domains WHERE id = ?").get(domainId) as
    GrowthDomainRow | undefined;
  if (!current) throw new Error(`Growth domain not found: ${domainId}`);
  const name = patch.name !== undefined ? normalizeGrowthName(patch.name) : current.name;
  let weight = current.weight;
  if (patch.weight !== undefined) {
    const raw = Number(patch.weight);
    if (!Number.isFinite(raw)) throw new Error(`Invalid growth weight: ${String(patch.weight)}`);
    weight = Math.min(1, Math.max(0.01, raw));
  }
  const theme = patch.theme !== undefined ? normalizeGrowthTheme(patch.theme) : current.theme;
  db.prepare("UPDATE growth_domains SET name = ?, weight = ?, theme = ? WHERE id = ?").run(
    name,
    weight,
    theme,
    domainId,
  );
  return getGrowthDomainOrThrow(domainId);
}

export function createGrowthCapability(input: GrowthCapabilityInput): GrowthCapability {
  const name = normalizeGrowthName(input.name);
  const domainId = assertGrowthId(input.domainId, "domain id");
  const level = assertGrowthInt(input.level, 1, 6, "level");
  const confidence = assertGrowthInt(input.confidence, 0, 5, "confidence");
  const halfLife = assertGrowthEnum(input.halfLife, GROWTH_HALF_LIVES, "half life");
  const portability = assertGrowthEnum(input.portability, GROWTH_PORTABILITIES, "portability");
  const targetLevel = input.targetLevel === null || input.targetLevel === undefined
    ? null
    : assertGrowthInt(input.targetLevel, 1, 6, "target level");
  assertDateKey(input.targetDate ?? null);
  const domain = db.prepare("SELECT id FROM growth_domains WHERE id = ?").get(domainId);
  if (!domain) throw new Error(`Growth domain not found: ${domainId}`);
  const parentId = input.parentId === null || input.parentId === undefined
    ? null
    : assertGrowthId(input.parentId, "parent id");
  assertGrowthParent(parentId, domainId, null);
  const next = db.prepare(
    "SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM growth_capabilities WHERE domain_id = ?",
  ).get(domainId) as { next: number };

  let id = 0;
  db.transaction(() => {
    id = db.prepare(`
      INSERT INTO growth_capabilities
        (domain_id, parent_id, name, level, confidence, half_life, portability,
         target_level, target_date, evidence_definition, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      domainId,
      parentId,
      name,
      level,
      confidence,
      halfLife,
      portability,
      targetLevel,
      input.targetDate ?? null,
      String(input.evidenceDefinition ?? "").trim(),
      String(input.notes ?? "").trim(),
      next.next,
    ).lastInsertRowid as number;
    // Every capability starts with a snapshot so the curve has a first point.
    db.prepare(
      "INSERT INTO growth_snapshots (capability_id, level, confidence, note) VALUES (?, ?, ?, '')",
    ).run(id, level, confidence);
  })();
  return getGrowthCapabilityOrThrow(id);
}

export function updateGrowthCapability(
  id: number,
  patch: GrowthCapabilityPatch,
): GrowthCapability {
  const capabilityId = assertGrowthId(id, "capability id");
  const row = requireGrowthCapabilityRow(capabilityId);
  const domainId = patch.domainId !== undefined
    ? assertGrowthId(patch.domainId, "domain id")
    : row.domain_id;
  if (patch.domainId !== undefined) {
    const domain = db.prepare("SELECT id FROM growth_domains WHERE id = ?").get(domainId);
    if (!domain) throw new Error(`Growth domain not found: ${domainId}`);
  }
  const name = patch.name !== undefined ? normalizeGrowthName(patch.name) : row.name;
  const domainChanged = domainId !== row.domain_id;
  let parentId = patch.parentId !== undefined ? patch.parentId : row.parent_id;
  if (patch.parentId !== undefined && parentId !== null) {
    parentId = assertGrowthId(parentId, "parent id");
  }
  if (patch.parentId === undefined && domainChanged && parentId !== null) {
    // Keep the link only when the current parent already lives in the new domain.
    const parent = db.prepare("SELECT domain_id FROM growth_capabilities WHERE id = ?").get(parentId) as
      | { domain_id: number }
      | undefined;
    if (!parent || parent.domain_id !== domainId) parentId = null;
  }
  assertGrowthParent(parentId, domainId, capabilityId);
  const halfLife = patch.halfLife !== undefined
    ? assertGrowthEnum(patch.halfLife, GROWTH_HALF_LIVES, "half life")
    : row.half_life;
  const portability = patch.portability !== undefined
    ? assertGrowthEnum(patch.portability, GROWTH_PORTABILITIES, "portability")
    : row.portability;
  const status = patch.status !== undefined
    ? assertGrowthEnum(patch.status, GROWTH_STATUSES, "status")
    : row.status;
  const targetLevel = patch.targetLevel !== undefined
    ? patch.targetLevel === null ? null : assertGrowthInt(patch.targetLevel, 1, 6, "target level")
    : row.target_level;
  const targetDate = patch.targetDate !== undefined ? patch.targetDate : row.target_date;
  assertDateKey(targetDate);
  const evidenceDefinition = patch.evidenceDefinition !== undefined
    ? String(patch.evidenceDefinition).trim()
    : row.evidence_definition;
  const notes = patch.notes !== undefined ? String(patch.notes).trim() : row.notes;

  db.transaction(() => {
    // Moving domains breaks the two-level tree rule for the children below this
    // node, so they are unlinked instead of silently crossing domains.
    if (domainChanged) {
      db.prepare("UPDATE growth_capabilities SET parent_id = NULL WHERE parent_id = ?").run(capabilityId);
    }
    db.prepare(`
      UPDATE growth_capabilities SET
        domain_id = ?, parent_id = ?, name = ?, half_life = ?, portability = ?, status = ?,
        target_level = ?, target_date = ?, evidence_definition = ?, notes = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      domainId, parentId, name, halfLife, portability, status, targetLevel, targetDate,
      evidenceDefinition, notes, capabilityId,
    );
  })();
  return getGrowthCapabilityOrThrow(capabilityId);
}

/**
 * The only path that changes level/confidence.
 * Invariants: raising the level needs evidence recorded after the previous
 * review, and a single review can climb at most one level.
 */
export function reviewGrowthCapability(
  id: number,
  input: GrowthReviewInput,
): GrowthReviewResult {
  const capabilityId = assertGrowthId(id, "capability id");
  const row = requireGrowthCapabilityRow(capabilityId);
  const level = assertGrowthInt(input.level, 1, 6, "level");
  const confidence = assertGrowthInt(input.confidence, 0, 5, "confidence");

  if (level > row.level) {
    if (level - row.level > 1) throw new Error("GROWTH_LEVEL_JUMP");
    if (row.last_evidence_at === null) throw new Error("GROWTH_EVIDENCE_REQUIRED");
    if (row.last_reviewed_at !== null && row.last_evidence_at <= row.last_reviewed_at) {
      throw new Error("GROWTH_EVIDENCE_REQUIRED");
    }
    // L3+ is only credible with a real, externally judged challenge behind it:
    // one passed challenge is consumed per level above L2.
    if (level >= 3) {
      const passed = db.prepare(
        "SELECT COUNT(*) AS n FROM growth_challenges WHERE capability_id = ? AND status = 'passed'",
      ).get(capabilityId) as { n: number };
      if (passed.n < level - 2) throw new Error("GROWTH_CHALLENGE_REQUIRED");
    }
  }

  let snapshotId = 0;
  db.transaction(() => {
    db.prepare(`
      UPDATE growth_capabilities
      SET level = ?, confidence = ?,
          last_reviewed_at = strftime('%Y-%m-%d %H:%M:%f', 'now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(level, confidence, capabilityId);
    snapshotId = db.prepare(
      "INSERT INTO growth_snapshots (capability_id, level, confidence, note) VALUES (?, ?, ?, ?)",
    ).run(capabilityId, level, confidence, String(input.note ?? "").trim()).lastInsertRowid as number;
  })();
  return {
    capability: getGrowthCapabilityOrThrow(capabilityId),
    snapshot: getGrowthSnapshotOrThrow(snapshotId),
  };
}

export function deleteGrowthCapability(id: number): string[] {
  const capabilityId = assertGrowthId(id, "capability id");
  const files = (db.prepare(`
    SELECT DISTINCT file FROM growth_media
    WHERE owner_type = 'artifact'
      AND owner_id IN (SELECT id FROM growth_artifacts WHERE capability_id = ?)
  `).all(capabilityId) as { file: string }[]).map((row) => row.file);
  db.transaction(() => {
    // Children must not keep a dangling parent (the migrated column has no FK).
    db.prepare("UPDATE growth_capabilities SET parent_id = NULL WHERE parent_id = ?").run(capabilityId);
    // Remove media rows while the artifact ids still exist; the file unlink is
    // done by the caller after this transaction commits.
    db.prepare(`
      DELETE FROM growth_media
      WHERE owner_type = 'artifact'
        AND owner_id IN (SELECT id FROM growth_artifacts WHERE capability_id = ?)
    `).run(capabilityId);
    // Evidence, challenges, artifacts and snapshots go through ON DELETE CASCADE.
    db.prepare("DELETE FROM growth_capabilities WHERE id = ?").run(capabilityId);
  })();
  return files;
}

export function getGrowthEvidence(capabilityId: number): GrowthEvidence[] {
  const id = assertGrowthId(capabilityId, "capability id");
  const rows = db.prepare(`
    SELECT * FROM growth_evidence
    WHERE capability_id = ?
    ORDER BY COALESCE(happened_on, substr(created_at, 1, 10)) DESC, id DESC
  `).all(id) as GrowthEvidenceRow[];
  return rows.map(toGrowthEvidence);
}

export function addGrowthEvidence(
  capabilityId: number,
  input: GrowthEvidenceInput,
): GrowthEvidence {
  const id = assertGrowthId(capabilityId, "capability id");
  requireGrowthCapabilityRow(id);
  const kind = assertGrowthEnum(input.kind, GROWTH_EVIDENCE_KINDS, "evidence kind");
  const title = normalizeGrowthName(input.title);
  assertDateKey(input.happenedOn ?? null);
  let evidenceId = 0;
  db.transaction(() => {
    evidenceId = db.prepare(`
      INSERT INTO growth_evidence (capability_id, kind, title, detail, url, happened_on)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      kind,
      title,
      String(input.detail ?? "").trim(),
      String(input.url ?? "").trim(),
      input.happenedOn ?? null,
    ).lastInsertRowid as number;
    db.prepare(
      "UPDATE growth_capabilities SET last_evidence_at = strftime('%Y-%m-%d %H:%M:%f', 'now'), updated_at = datetime('now') WHERE id = ?",
    ).run(id);
  })();
  return getGrowthEvidenceOrThrow(evidenceId);
}

export function deleteGrowthEvidence(id: number): void {
  const evidenceId = assertGrowthId(id, "evidence id");
  const row = db.prepare("SELECT capability_id FROM growth_evidence WHERE id = ?").get(evidenceId) as
    { capability_id: number } | undefined;
  if (!row) return;
  db.transaction(() => {
    db.prepare("DELETE FROM growth_evidence WHERE id = ?").run(evidenceId);
    const latest = db.prepare(
      "SELECT MAX(created_at) AS latest FROM growth_evidence WHERE capability_id = ?",
    ).get(row.capability_id) as { latest: string | null };
    db.prepare(
      "UPDATE growth_capabilities SET last_evidence_at = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(latest.latest, row.capability_id);
  })();
}

export function getGrowthSnapshots(capabilityId: number): GrowthSnapshot[] {
  const id = assertGrowthId(capabilityId, "capability id");
  const rows = db.prepare(`
    SELECT * FROM growth_snapshots
    WHERE capability_id = ?
    ORDER BY taken_at DESC, id DESC
  `).all(id) as GrowthSnapshotRow[];
  return rows.map(toGrowthSnapshot);
}

// ---- Growth: seasons / challenges / artifacts (P1) ----

const GROWTH_CHALLENGE_STATUSES: GrowthChallengeStatus[] = ["open", "passed", "failed", "abandoned"];
const GROWTH_ATTRIBUTIONS: GrowthAttribution[] = ["stats", "buff"];
const GROWTH_ARTIFACT_KINDS: GrowthArtifactKind[] = ["demo", "article", "repo", "doc", "other"];

function getGrowthSeasonOrThrow(id: number): GrowthSeason {
  const row = db.prepare("SELECT * FROM growth_seasons WHERE id = ?").get(id) as
    GrowthSeasonRow | undefined;
  if (!row) throw new Error(`Growth season not found: ${id}`);
  return toGrowthSeason(row, getGrowthMediaRows("season", row.id));
}

function getGrowthChallengeOrThrow(id: number): GrowthChallenge {
  const row = db.prepare(`${GROWTH_CHALLENGE_SELECT} WHERE c.id = ?`).get(id) as
    GrowthChallengeRow | undefined;
  if (!row) throw new Error(`Growth challenge not found: ${id}`);
  return toGrowthChallenge(row);
}

function assertGrowthCapabilityExists(id: number): void {
  const row = db.prepare("SELECT id FROM growth_capabilities WHERE id = ?").get(id);
  if (!row) throw new Error(`Growth capability not found: ${id}`);
}

function assertGrowthSeasonExists(id: number): void {
  const row = db.prepare("SELECT id FROM growth_seasons WHERE id = ?").get(id);
  if (!row) throw new Error(`Growth season not found: ${id}`);
}

/**
 * Skill-tree rule: at most two levels, same domain, no self-reference. Only a
 * root (parent_id null) may be a parent, which is what keeps the depth at 2.
 */
function assertGrowthParent(parentId: number | null, domainId: number, selfId: number | null): void {
  if (parentId === null) return;
  if (selfId !== null && parentId === selfId) throw new Error("GROWTH_TREE_SELF");
  const parent = db.prepare("SELECT domain_id, parent_id FROM growth_capabilities WHERE id = ?").get(parentId) as
    | { domain_id: number; parent_id: number | null }
    | undefined;
  if (!parent) throw new Error(`Growth capability not found: ${parentId}`);
  if (parent.parent_id !== null) throw new Error("GROWTH_TREE_DEPTH");
  if (parent.domain_id !== domainId) throw new Error("GROWTH_TREE_DOMAIN");
  if (selfId !== null) {
    // A capability that already has children can never become a child itself,
    // otherwise the tree would grow a third level.
    const child = db
      .prepare("SELECT 1 FROM growth_capabilities WHERE parent_id = ? LIMIT 1")
      .get(selfId);
    if (child) throw new Error("GROWTH_TREE_DEPTH");
  }
}

/** Season poster colour: a tag-palette key, so it needs no new theme tokens. */
const GROWTH_SEASON_THEMES = ["brick", "gold", "blue", "green", "violet", "teal", "pink", "slate"] as const;

function normalizeGrowthTheme(value: unknown): string {
  const key = String(value ?? "").trim();
  return (GROWTH_SEASON_THEMES as readonly string[]).includes(key) ? key : "violet";
}

/** Cover is a generated file name served by the prism-growth-cover scheme. */
function normalizeGrowthCover(value: unknown): string {
  const name = String(value ?? "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && !name.includes("..") ? name : "";
}

const MAX_GROWTH_ARTIFACT_IMAGES = 6;

/** Gallery order is the user's order; dedupe and cap before persisting. */
function normalizeGrowthArtifactImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    const name = normalizeGrowthCover(item);
    if (name && !result.includes(name)) result.push(name);
    if (result.length >= MAX_GROWTH_ARTIFACT_IMAGES) break;
  }
  return result;
}

/** Keep the cover inside the gallery when a backup names both. */
function resolveArtifactGallery(
  coverRaw: unknown,
  imagesRaw: unknown,
): { images: string[]; cover: string } {
  const images = normalizeGrowthArtifactImages(imagesRaw);
  let cover = normalizeGrowthCover(coverRaw);
  if (cover && !images.includes(cover)) images.unshift(cover);
  if (!cover) cover = images[0] ?? "";
  return { images: images.slice(0, MAX_GROWTH_ARTIFACT_IMAGES), cover };
}

function clampUnit(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

/** Free pan/zoom is stored as JSON `{x,y,scale}`; empty means "not set". */
function normalizeGrowthCoverTransform(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const source = value as Record<string, unknown>;
  const x = clampUnit(Number(source.x), 0.5);
  const y = clampUnit(Number(source.y), 0.5);
  const rawScale = Number(source.scale);
  const scale = Number.isFinite(rawScale) ? Math.min(3, Math.max(1, rawScale)) : 1;
  return JSON.stringify({ x, y, scale });
}

function parseGrowthCoverTransform(raw: string | null | undefined): GrowthCoverTransform | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const source = parsed as Record<string, unknown>;
    const x = Number(source.x);
    const y = Number(source.y);
    const scale = Number(source.scale);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(scale)) return null;
    return {
      x: clampUnit(x, 0.5),
      y: clampUnit(y, 0.5),
      scale: Math.min(3, Math.max(1, scale)),
    };
  } catch {
    return null;
  }
}

/** Accepts an object or a JSON string; always returns the canonical JSON form. */
function normalizeGrowthMediaTransform(value: unknown): string {
  if (typeof value === "string") {
    const parsed = parseGrowthCoverTransform(value);
    return parsed ? normalizeGrowthCoverTransform(parsed) : "";
  }
  return normalizeGrowthCoverTransform(value);
}

function getGrowthMediaRows(
  ownerType: GrowthMediaOwnerType,
  ownerId: number,
): GrowthMediaRow[] {
  return db
    .prepare(
      "SELECT * FROM growth_media WHERE owner_type = ? AND owner_id = ? ORDER BY sort_order ASC, id ASC",
    )
    .all(ownerType, ownerId) as GrowthMediaRow[];
}

function getGrowthMediaRowsByOwner(
  ownerType: GrowthMediaOwnerType,
): Map<number, GrowthMediaRow[]> {
  const rows = db
    .prepare(
      "SELECT * FROM growth_media WHERE owner_type = ? ORDER BY owner_id ASC, sort_order ASC, id ASC",
    )
    .all(ownerType) as GrowthMediaRow[];
  const map = new Map<number, GrowthMediaRow[]>();
  for (const row of rows) {
    const list = map.get(row.owner_id);
    if (list) list.push(row);
    else map.set(row.owner_id, [row]);
  }
  return map;
}

/** One owner's media set is replaced atomically; files are not touched here. */
function syncGrowthMedia(
  ownerType: GrowthMediaOwnerType,
  ownerId: number,
  items: GrowthMediaInput[],
): void {
  const seen = new Set<string>();
  const rows: Array<{ file: string; transform: string; isCover: boolean }> = [];
  let coverAssigned = false;
  items.forEach((item) => {
    const file = normalizeGrowthCover(item.file);
    if (!file || seen.has(file)) return;
    seen.add(file);
    const isCover = item.isCover === true && !coverAssigned;
    if (isCover) coverAssigned = true;
    rows.push({
      file,
      transform: normalizeGrowthMediaTransform(item.transform),
      isCover,
    });
  });

  db.prepare("DELETE FROM growth_media WHERE owner_type = ? AND owner_id = ?").run(
    ownerType,
    ownerId,
  );
  const insert = db.prepare(`
    INSERT INTO growth_media
      (owner_type, owner_id, file, transform, sort_order, is_cover)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  rows.forEach((row, index) => {
    insert.run(ownerType, ownerId, row.file, row.transform, index, row.isCover ? 1 : 0);
  });
}

/** Files owned by one record, in display order. Used before deleting the owner. */
export function getGrowthMediaFiles(
  ownerType: GrowthMediaOwnerType,
  ownerId: number,
): string[] {
  return getGrowthMediaRows(ownerType, ownerId).map((row) => row.file);
}

/** Every referenced media file, used by backup attachment and startup GC. */
export function listGrowthMediaFiles(): string[] {
  return (db.prepare("SELECT DISTINCT file FROM growth_media ORDER BY file ASC").all() as {
    file: string;
  }[]).map((row) => row.file);
}

/** A saved image must not be unlinked while any owner still references it. */
export function isGrowthMediaFileReferenced(file: string): boolean {
  const name = normalizeGrowthCover(file);
  if (!name) return false;
  return Boolean(
    db.prepare("SELECT 1 FROM growth_media WHERE file = ? LIMIT 1").get(name),
  );
}

export function createGrowthSeason(input: GrowthSeasonInput): GrowthSeason {
  const title = normalizeGrowthName(input.title);
  assertDateKey(input.startDate);
  assertDateKey(input.endDate);
  if (input.startDate > input.endDate) throw new Error("GROWTH_SEASON_DATE_ORDER");
  const cover = normalizeGrowthCover(input.cover);
  const coverTransform = cover ? normalizeGrowthMediaTransform(input.coverTransform) : "";
  const id = db.transaction(() => {
    const seasonId = db.prepare(`
      INSERT INTO growth_seasons (title, focus, start_date, end_date, theme)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      title,
      String(input.focus ?? "").trim(),
      input.startDate,
      input.endDate,
      normalizeGrowthTheme(input.theme),
    ).lastInsertRowid as number;
    syncGrowthMedia(
      "season",
      seasonId,
      cover ? [{ file: cover, transform: coverTransform, isCover: true }] : [],
    );
    return seasonId;
  })();
  return getGrowthSeasonOrThrow(id);
}

export function updateGrowthSeason(id: number, patch: GrowthSeasonPatch): GrowthSeason {
  const seasonId = assertGrowthId(id, "season id");
  const row = db.prepare("SELECT * FROM growth_seasons WHERE id = ?").get(seasonId) as
    GrowthSeasonRow | undefined;
  if (!row) throw new Error(`Growth season not found: ${seasonId}`);
  const title = patch.title !== undefined ? normalizeGrowthName(patch.title) : row.title;
  const focus = patch.focus !== undefined ? String(patch.focus).trim() : row.focus;
  const startDate = patch.startDate !== undefined ? patch.startDate : row.start_date;
  const endDate = patch.endDate !== undefined ? patch.endDate : row.end_date;
  assertDateKey(startDate);
  assertDateKey(endDate);
  const datesChanged = startDate !== row.start_date || endDate !== row.end_date;
  if (datesChanged && startDate > endDate) throw new Error("GROWTH_SEASON_DATE_ORDER");
  const theme = patch.theme !== undefined ? normalizeGrowthTheme(patch.theme) : row.theme;
  const currentSeasonMedia = getGrowthMediaRows("season", seasonId);
  const currentCoverRow = currentSeasonMedia.find(
    (entry) => entry.is_cover === 1,
  ) ?? currentSeasonMedia[0];
  const cover = patch.cover !== undefined
    ? normalizeGrowthCover(patch.cover)
    : currentCoverRow?.file ?? "";
  const coverTransform = patch.coverTransform !== undefined
    ? normalizeGrowthMediaTransform(patch.coverTransform)
    : cover === ""
      ? ""
      : currentCoverRow
        ? normalizeGrowthMediaTransform(currentCoverRow.transform)
        : "";
  db.transaction(() => {
    db.prepare(`
      UPDATE growth_seasons
      SET title = ?, focus = ?, start_date = ?, end_date = ?, theme = ?
      WHERE id = ?
    `).run(title, focus, startDate, endDate, theme, seasonId);
    syncGrowthMedia(
      "season",
      seasonId,
      cover ? [{ file: cover, transform: coverTransform, isCover: true }] : [],
    );
  })();
  return getGrowthSeasonOrThrow(seasonId);
}

/** Settle the season: stamps closed_at and stores the one-line outcome. */
export function closeGrowthSeason(id: number, outcome: string): GrowthSeason {
  const seasonId = assertGrowthId(id, "season id");
  getGrowthSeasonOrThrow(seasonId);
  db.prepare("UPDATE growth_seasons SET closed_at = datetime('now'), outcome = ? WHERE id = ?")
    .run(String(outcome ?? "").trim(), seasonId);
  return getGrowthSeasonOrThrow(seasonId);
}

/**
 * Delete one season. Its challenges stay but lose the season link (the FK is
 * SET NULL); the media trigger clears the poster row and the files are removed
 * by the main process after the transaction.
 */
export function deleteGrowthSeason(id: number): string[] {
  const seasonId = assertGrowthId(id, "season id");
  getGrowthSeasonOrThrow(seasonId);
  const files = getGrowthMediaFiles("season", seasonId);
  db.prepare("DELETE FROM growth_seasons WHERE id = ?").run(seasonId);
  return files;
}

export function createGrowthChallenge(input: GrowthChallengeInput): GrowthChallenge {
  const title = normalizeGrowthName(input.title);
  const capabilityId = input.capabilityId === null || input.capabilityId === undefined
    ? null
    : assertGrowthId(input.capabilityId, "capability id");
  if (capabilityId !== null) assertGrowthCapabilityExists(capabilityId);
  const seasonId = input.seasonId === null || input.seasonId === undefined
    ? null
    : assertGrowthId(input.seasonId, "season id");
  if (seasonId !== null) assertGrowthSeasonExists(seasonId);
  const difficulty = assertGrowthInt(input.difficultyLevel, 1, 6, "difficulty");
  const id = db.prepare(`
    INSERT INTO growth_challenges
      (capability_id, season_id, title, description, goal, criteria, difficulty_level)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    capabilityId,
    seasonId,
    title,
    String(input.description ?? "").trim(),
    String(input.goal ?? "").trim(),
    String(input.criteria ?? "").trim(),
    difficulty,
  ).lastInsertRowid as number;
  return getGrowthChallengeOrThrow(id);
}

export function updateGrowthChallenge(id: number, patch: GrowthChallengePatch): GrowthChallenge {
  const challengeId = assertGrowthId(id, "challenge id");
  const row = db.prepare("SELECT * FROM growth_challenges WHERE id = ?").get(challengeId) as
    GrowthChallengeRow | undefined;
  if (!row) throw new Error(`Growth challenge not found: ${challengeId}`);
  const title = patch.title !== undefined ? normalizeGrowthName(patch.title) : row.title;
  const description = patch.description !== undefined
    ? String(patch.description).trim()
    : row.description;
  const goal = patch.goal !== undefined ? String(patch.goal).trim() : row.goal;
  const criteria = patch.criteria !== undefined ? String(patch.criteria).trim() : row.criteria;
  const reflection = patch.reflection !== undefined ? String(patch.reflection).trim() : row.reflection;
  const body = patch.body !== undefined ? String(patch.body).trim() : row.body;
  const resultNote = patch.resultNote !== undefined
    ? String(patch.resultNote).trim()
    : row.result_note;
  const difficulty = patch.difficultyLevel !== undefined
    ? assertGrowthInt(patch.difficultyLevel, 1, 6, "difficulty")
    : row.difficulty_level;
  let capabilityId = row.capability_id;
  if (patch.capabilityId !== undefined) {
    capabilityId = patch.capabilityId === null ? null : assertGrowthId(patch.capabilityId, "capability id");
    if (capabilityId !== null) assertGrowthCapabilityExists(capabilityId);
  }
  let seasonId = row.season_id;
  if (patch.seasonId !== undefined) {
    seasonId = patch.seasonId === null ? null : assertGrowthId(patch.seasonId, "season id");
    if (seasonId !== null) assertGrowthSeasonExists(seasonId);
  }
  // A resolved challenge is a record: its structure (capability / season /
  // difficulty) is locked, but the narrative can keep growing afterwards.
  if (
    row.status !== "open" &&
    (capabilityId !== row.capability_id ||
      seasonId !== row.season_id ||
      difficulty !== row.difficulty_level)
  ) {
    throw new Error("GROWTH_CHALLENGE_LOCKED");
  }
  db.prepare(`
    UPDATE growth_challenges
    SET capability_id = ?, season_id = ?, title = ?, description = ?,
        goal = ?, criteria = ?, reflection = ?, body = ?,
        result_note = ?, difficulty_level = ?
    WHERE id = ?
  `).run(
    capabilityId,
    seasonId,
    title,
    description,
    goal,
    criteria,
    reflection,
    body,
    resultNote,
    difficulty,
    challengeId,
  );
  return getGrowthChallengeOrThrow(challengeId);
}

export function deleteGrowthChallenge(id: number): void {
  const challengeId = assertGrowthId(id, "challenge id");
  // Artifacts produced by it stay, they just lose the link (ON DELETE SET NULL).
  db.prepare("DELETE FROM growth_challenges WHERE id = ?").run(challengeId);
}

/**
 * Resolve an open challenge. Passing it is the only automatic level-up path:
 * the level rises at most to the challenge difficulty, confidence gets +1, a
 * snapshot is written and the win is recorded as evidence.
 */
export function resolveGrowthChallenge(
  id: number,
  input: GrowthResolveInput,
): GrowthResolveResult {
  const challengeId = assertGrowthId(id, "challenge id");
  const status = assertGrowthEnum(
    input.status,
    GROWTH_CHALLENGE_STATUSES.filter((value) => value !== "open"),
    "challenge status",
  );
  const row = db.prepare("SELECT * FROM growth_challenges WHERE id = ?").get(challengeId) as
    GrowthChallengeRow | undefined;
  if (!row) throw new Error(`Growth challenge not found: ${challengeId}`);
  if (row.status !== "open") throw new Error("GROWTH_CHALLENGE_RESOLVED");
  let attribution: GrowthAttribution | null = null;
  if (status === "passed") {
    if (!input.attribution) throw new Error("GROWTH_ATTRIBUTION_REQUIRED");
    attribution = assertGrowthEnum(input.attribution, GROWTH_ATTRIBUTIONS, "attribution");
  }
  const note = String(input.resultNote ?? "").trim();
  const reflection = String(input.reflection ?? "").trim();
  const today = growthTodayKey();

  let movedCapabilityId: number | null = null;
  let snapshotId = 0;
  db.transaction(() => {
    db.prepare(`
      UPDATE growth_challenges
      SET status = ?, attribution = ?, result_note = ?, reflection = ?, resolved_on = ?
      WHERE id = ?
    `).run(status, attribution, note, reflection, today, challengeId);

    if (status !== "passed" || row.capability_id === null) return;
    const capRow = db.prepare(`${GROWTH_CAPABILITY_SELECT} WHERE c.id = ?`).get(row.capability_id) as
      GrowthCapabilityRow | undefined;
    if (!capRow) return;
    const nextLevel = Math.min(
      6,
      capRow.level < row.difficulty_level ? capRow.level + 1 : capRow.level,
    );
    const nextConfidence = Math.min(5, capRow.confidence + 1);
    db.prepare(`
      UPDATE growth_capabilities
      SET level = ?, confidence = ?,
          last_reviewed_at = strftime('%Y-%m-%d %H:%M:%f', 'now'),
          last_evidence_at = strftime('%Y-%m-%d %H:%M:%f', 'now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(nextLevel, nextConfidence, row.capability_id);
    snapshotId = db.prepare(`
      INSERT INTO growth_snapshots (capability_id, level, confidence, note)
      VALUES (?, ?, ?, ?)
    `).run(row.capability_id, nextLevel, nextConfidence, `通过：${row.title}`).lastInsertRowid as number;
    db.prepare(`
      INSERT INTO growth_evidence (capability_id, kind, title, detail, url, happened_on)
      VALUES (?, 'usage', ?, ?, '', ?)
    `).run(row.capability_id, `通过：${row.title}`, note, today);
    movedCapabilityId = row.capability_id;
  })();

  return {
    challenge: getGrowthChallengeOrThrow(challengeId),
    capability: movedCapabilityId === null ? null : getGrowthCapabilityOrThrow(movedCapabilityId),
    snapshot: snapshotId === 0 ? null : getGrowthSnapshotOrThrow(snapshotId),
  };
}

export function createGrowthArtifact(input: GrowthArtifactInput): GrowthArtifact {
  const title = normalizeGrowthName(input.title);
  const kind = assertGrowthEnum(input.kind, GROWTH_ARTIFACT_KINDS, "artifact kind");
  const capabilityId = input.capabilityId === null || input.capabilityId === undefined
    ? null
    : assertGrowthId(input.capabilityId, "capability id");
  if (capabilityId !== null) assertGrowthCapabilityExists(capabilityId);
  const challengeId = input.challengeId === null || input.challengeId === undefined
    ? null
    : assertGrowthId(input.challengeId, "challenge id");
  if (challengeId !== null) getGrowthChallengeOrThrow(challengeId);
  assertDateKey(input.createdOn ?? null);
  const gallery = resolveArtifactGallery(input.cover, input.images);
  const id = db.transaction(() => {
    const artifactId = db.prepare(`
      INSERT INTO growth_artifacts
        (capability_id, challenge_id, title, kind, url, note, body, created_on)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      capabilityId,
      challengeId,
      title,
      kind,
      String(input.url ?? "").trim(),
      String(input.note ?? "").trim(),
      String(input.body ?? "").trim(),
      input.createdOn ?? null,
    ).lastInsertRowid as number;
    syncGrowthMedia(
      "artifact",
      artifactId,
      gallery.images.map((file) => ({
        file,
        isCover: file === gallery.cover,
      })),
    );
    return artifactId;
  })();
  return getGrowthArtifactOrThrow(id);
}

export function updateGrowthArtifact(id: number, patch: GrowthArtifactPatch): GrowthArtifact {
  const artifactId = assertGrowthId(id, "artifact id");
  const row = db.prepare("SELECT * FROM growth_artifacts WHERE id = ?").get(artifactId) as
    GrowthArtifactRow | undefined;
  if (!row) throw new Error(`Growth artifact not found: ${artifactId}`);
  const title = patch.title !== undefined ? normalizeGrowthName(patch.title) : row.title;
  const kind = patch.kind !== undefined
    ? assertGrowthEnum(patch.kind, GROWTH_ARTIFACT_KINDS, "artifact kind")
    : row.kind;
  let capabilityId = row.capability_id;
  if (patch.capabilityId !== undefined) {
    capabilityId = patch.capabilityId === null
      ? null
      : assertGrowthId(patch.capabilityId, "capability id");
    if (capabilityId !== null) assertGrowthCapabilityExists(capabilityId);
  }
  let challengeId = row.challenge_id;
  if (patch.challengeId !== undefined) {
    challengeId = patch.challengeId === null
      ? null
      : assertGrowthId(patch.challengeId, "challenge id");
    if (challengeId !== null) getGrowthChallengeOrThrow(challengeId);
  }
  const createdOn = patch.createdOn !== undefined ? patch.createdOn : row.created_on;
  assertDateKey(createdOn ?? null);
  const currentMedia = getGrowthMediaRows("artifact", artifactId);
  const currentCoverRow = currentMedia.find((entry) => entry.is_cover === 1) ?? currentMedia[0];
  const currentGallery = {
    images: currentMedia.map((entry) => entry.file),
    cover: currentCoverRow?.file ?? "",
  };
  const gallery = resolveArtifactGallery(
    patch.cover !== undefined
      ? patch.cover
      : patch.images !== undefined
        ? ""
        : currentGallery.cover,
    patch.images !== undefined ? patch.images : currentGallery.images,
  );
  db.transaction(() => {
    db.prepare(`
      UPDATE growth_artifacts
      SET capability_id = ?, challenge_id = ?, title = ?, kind = ?, url = ?, note = ?,
          body = ?, created_on = ?
      WHERE id = ?
    `).run(
      capabilityId,
      challengeId,
      title,
      kind,
      patch.url !== undefined ? String(patch.url).trim() : row.url,
      patch.note !== undefined ? String(patch.note).trim() : row.note,
      patch.body !== undefined ? String(patch.body).trim() : row.body,
      createdOn ?? null,
      artifactId,
    );
    syncGrowthMedia(
      "artifact",
      artifactId,
      gallery.images.map((file) => ({
        file,
        isCover: file === gallery.cover,
      })),
    );
  })();
  return getGrowthArtifactOrThrow(artifactId);
}

function getGrowthArtifactOrThrow(id: number): GrowthArtifact {
  const row = db.prepare(`${GROWTH_ARTIFACT_SELECT} WHERE a.id = ?`).get(id) as
    GrowthArtifactRow | undefined;
  if (!row) throw new Error(`Growth artifact not found: ${id}`);
  return toGrowthArtifact(row, getGrowthMediaRows("artifact", row.id));
}

export function deleteGrowthArtifact(id: number): string[] {
  const artifactId = assertGrowthId(id, "artifact id");
  const files = getGrowthMediaFiles("artifact", artifactId);
  db.transaction(() => {
    db.prepare("DELETE FROM growth_artifacts WHERE id = ?").run(artifactId);
    db.prepare("DELETE FROM growth_media WHERE owner_type = 'artifact' AND owner_id = ?").run(
      artifactId,
    );
  })();
  return files;
}

// ---- Growth: tasks (P2) ----
interface GrowthTaskRow {
  id: number;
  title: string;
  notes: string;
  capability_id: number | null;
  challenge_id: number | null;
  scheduled_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  capability_name: string | null;
  challenge_title: string | null;
}

const GROWTH_TASK_SELECT = `
  SELECT t.*, c.name AS capability_name, ch.title AS challenge_title
  FROM growth_tasks t
  LEFT JOIN growth_capabilities c ON c.id = t.capability_id
  LEFT JOIN growth_challenges ch ON ch.id = t.challenge_id
`;

function toGrowthTask(row: GrowthTaskRow): GrowthTask {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    capability:
      row.capability_id === null
        ? null
        : { id: row.capability_id, name: row.capability_name ?? "" },
    challenge:
      row.challenge_id === null
        ? null
        : { id: row.challenge_id, title: row.challenge_title ?? "" },
    scheduledDate: row.scheduled_date,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

/**
 * A linked challenge owns the capability: it fills an empty capability and
 * rejects a contradictory one, so a task can never read as "capability A, but a
 * step of challenge B". The client sends both fields together when it changes
 * one of them.
 */
function normalizeGrowthTaskLinks(
  challengeId: number | null,
  capabilityId: number | null,
): { challengeId: number | null; capabilityId: number | null } {
  if (challengeId === null) return { challengeId, capabilityId };
  const challenge = getGrowthChallengeOrThrow(challengeId);
  if (challenge.capabilityId === null) return { challengeId, capabilityId };
  if (capabilityId !== null && capabilityId !== challenge.capabilityId) {
    throw new Error("GROWTH_LINK_CAPABILITY");
  }
  return { challengeId, capabilityId: challenge.capabilityId };
}

function getGrowthTaskOrThrow(id: number): GrowthTask {
  const row = db.prepare(`${GROWTH_TASK_SELECT} WHERE t.id = ?`).get(id) as
    GrowthTaskRow | undefined;
  if (!row) throw new Error(`Growth task not found: ${id}`);
  return toGrowthTask(row);
}

export function getGrowthTasks(): GrowthTasksPayload {
  const open = db.prepare(`
    ${GROWTH_TASK_SELECT}
    WHERE t.completed_at IS NULL
    ORDER BY COALESCE(t.due_date, t.scheduled_date, '9999-12-31') ASC,
      t.created_at DESC, t.id DESC
  `).all() as GrowthTaskRow[];
  const completed = db.prepare(`
    ${GROWTH_TASK_SELECT}
    WHERE t.completed_at IS NOT NULL
    ORDER BY t.completed_at DESC, t.id DESC
  `).all() as GrowthTaskRow[];
  return { open: open.map(toGrowthTask), completed: completed.map(toGrowthTask) };
}

export function addGrowthTask(input: GrowthTaskInput): GrowthTask {
  const title = normalizeGrowthName(input.title);
  const notes = String(input.notes ?? "").trim();
  const scheduledDate = input.scheduledDate ?? null;
  const dueDate = input.dueDate ?? null;
  assertDateKey(scheduledDate);
  assertDateKey(dueDate);
  const challengeId =
    input.challengeId === undefined || input.challengeId === null
      ? null
      : assertGrowthId(input.challengeId, "challenge id");
  let capabilityId: number | null =
    input.capabilityId === undefined || input.capabilityId === null
      ? null
      : assertGrowthId(input.capabilityId, "capability id");
  if (capabilityId !== null) requireGrowthCapabilityRow(capabilityId);
  const links = normalizeGrowthTaskLinks(challengeId, capabilityId);
  capabilityId = links.capabilityId;
  const id = db.prepare(`
    INSERT INTO growth_tasks (title, notes, capability_id, challenge_id, scheduled_date, due_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, notes, capabilityId, links.challengeId, scheduledDate, dueDate)
    .lastInsertRowid as number;
  return getGrowthTaskOrThrow(id);
}

export function updateGrowthTask(id: number, patch: GrowthTaskPatch): GrowthTask {
  const taskId = assertGrowthId(id, "task id");
  const current = getGrowthTaskOrThrow(taskId);
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (patch.title !== undefined) {
    sets.push("title = ?");
    values.push(normalizeGrowthName(patch.title));
  }
  if (patch.notes !== undefined) {
    sets.push("notes = ?");
    values.push(String(patch.notes));
  }
  const linksTouched = patch.capabilityId !== undefined || patch.challengeId !== undefined;
  if (linksTouched) {
    let nextCapabilityId =
      patch.capabilityId === undefined ? (current.capability?.id ?? null) : patch.capabilityId;
    if (nextCapabilityId !== null) {
      const capabilityId = assertGrowthId(nextCapabilityId, "capability id");
      requireGrowthCapabilityRow(capabilityId);
      nextCapabilityId = capabilityId;
    }
    const nextChallengeId =
      patch.challengeId === undefined
        ? (current.challenge?.id ?? null)
        : patch.challengeId === null
          ? null
          : assertGrowthId(patch.challengeId, "challenge id");
    const links = normalizeGrowthTaskLinks(nextChallengeId, nextCapabilityId);
    sets.push("capability_id = ?", "challenge_id = ?");
    values.push(links.capabilityId, links.challengeId);
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
  if (sets.length > 0) {
    db.prepare(`UPDATE growth_tasks SET ${sets.join(", ")} WHERE id = ?`).run(
      ...values,
      taskId,
    );
  }
  return getGrowthTaskOrThrow(taskId);
}

export function completeGrowthTask(id: number): GrowthTask {
  const taskId = assertGrowthId(id, "task id");
  db.prepare(
    "UPDATE growth_tasks SET completed_at = datetime('now') WHERE id = ? AND completed_at IS NULL",
  ).run(taskId);
  return getGrowthTaskOrThrow(taskId);
}

export function reopenGrowthTask(id: number): GrowthTask {
  const taskId = assertGrowthId(id, "task id");
  db.prepare("UPDATE growth_tasks SET completed_at = NULL WHERE id = ?").run(taskId);
  return getGrowthTaskOrThrow(taskId);
}

export function deleteGrowthTask(id: number): void {
  const taskId = assertGrowthId(id, "task id");
  db.prepare("DELETE FROM growth_tasks WHERE id = ?").run(taskId);
}

/** Bulk-clear the completed list; open tasks are untouched. */
export function clearCompletedGrowthTasks(): number {
  const result = db.prepare("DELETE FROM growth_tasks WHERE completed_at IS NOT NULL").run();
  return result.changes;
}


// ---- Growth: metacognition — predictions / self model / feedback (P3) ----

const GROWTH_PREDICTION_KINDS: GrowthPredictionKind[] = ["time", "difficulty", "mood"];
const GROWTH_SELF_SECTIONS: GrowthSelfSection[] = [
  "energy",
  "motivation",
  "procrastination",
  "bias",
  "learning",
  "social",
  "values",
  "blindspots",
];

function getGrowthPredictionOrThrow(id: number): GrowthPrediction {
  const row = db.prepare(`${GROWTH_PREDICTION_SELECT} WHERE p.id = ?`).get(id) as
    GrowthPredictionRow | undefined;
  if (!row) throw new Error(`Growth prediction not found: ${id}`);
  return toGrowthPrediction(row);
}

function getGrowthSelfModelOrThrow(id: number): GrowthSelfModelEntry {
  const row = db.prepare("SELECT * FROM growth_self_model WHERE id = ?").get(id) as
    GrowthSelfModelRow | undefined;
  if (!row) throw new Error(`Growth self-model entry not found: ${id}`);
  return toGrowthSelfModelEntry(row);
}

/** Per-kind sanity for a predicted or actual value: keeps the derived error meaningful. */
function isGrowthPredictionValue(
  kind: GrowthPredictionKind,
  value: number,
  allowZero = false,
): boolean {
  if (kind === "time") return allowZero ? value >= 0 : value > 0;
  if (kind === "difficulty") return value >= 1 && value <= 5;
  return value >= -2 && value <= 2;
}

export function addGrowthPrediction(input: GrowthPredictionInput): GrowthPrediction {
  const kind = assertGrowthEnum(input.kind, GROWTH_PREDICTION_KINDS, "prediction kind");
  const subject = normalizeGrowthName(input.subject);
  assertDateKey(input.predictedOn);
  const predicted = Number(input.predicted);
  const actual = input.actual == null ? null : Number(input.actual);
  if (!Number.isFinite(predicted) || (actual !== null && !Number.isFinite(actual))) {
    throw new Error("GROWTH_PREDICTION_NUMBER");
  }
  if (!isGrowthPredictionValue(kind, predicted)) throw new Error("GROWTH_PREDICTION_RANGE");
  if (actual !== null && !isGrowthPredictionValue(kind, actual, true)) {
    throw new Error("GROWTH_PREDICTION_RANGE");
  }
  const challengeId =
    input.challengeId === undefined || input.challengeId === null
      ? null
      : assertGrowthId(input.challengeId, "challenge id");
  const taskId =
    input.taskId === undefined || input.taskId === null
      ? null
      : assertGrowthId(input.taskId, "task id");
  if (challengeId !== null && taskId !== null) throw new Error("GROWTH_PREDICTION_LINK");
  let capabilityId =
    input.capabilityId === undefined || input.capabilityId === null
      ? null
      : assertGrowthId(input.capabilityId, "capability id");
  if (capabilityId !== null) requireGrowthCapabilityRow(capabilityId);
  // The context object owns the capability: it fills an empty anchor and
  // rejects a contradictory one.
  if (challengeId !== null) {
    const challenge = getGrowthChallengeOrThrow(challengeId);
    if (challenge.capabilityId !== null) {
      if (capabilityId !== null && capabilityId !== challenge.capabilityId) {
        throw new Error("GROWTH_LINK_CAPABILITY");
      }
      capabilityId = challenge.capabilityId;
    }
  }
  if (taskId !== null) {
    const task = getGrowthTaskOrThrow(taskId);
    const taskCapabilityId = task.capability?.id ?? null;
    if (taskCapabilityId !== null) {
      if (capabilityId !== null && capabilityId !== taskCapabilityId) {
        throw new Error("GROWTH_LINK_CAPABILITY");
      }
      capabilityId = taskCapabilityId;
    }
  }
  const id = db.prepare(`
    INSERT INTO growth_predictions
      (kind, subject, predicted, actual, predicted_on, note, capability_id, challenge_id, task_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    kind,
    subject,
    predicted,
    actual,
    input.predictedOn,
    String(input.note ?? "").trim(),
    capabilityId,
    challengeId,
    taskId,
  ).lastInsertRowid as number;
  return getGrowthPredictionOrThrow(id);
}

/** Fill in (or correct) the actual outcome of a forecast. */
export function settleGrowthPrediction(id: number, actual: number): GrowthPrediction {
  const predictionId = assertGrowthId(id, "prediction id");
  const current = getGrowthPredictionOrThrow(predictionId);
  const value = Number(actual);
  if (!Number.isFinite(value)) throw new Error("GROWTH_PREDICTION_NUMBER");
  if (!isGrowthPredictionValue(current.kind, value, true)) {
    throw new Error("GROWTH_PREDICTION_RANGE");
  }
  db.prepare("UPDATE growth_predictions SET actual = ? WHERE id = ?").run(value, predictionId);
  return getGrowthPredictionOrThrow(predictionId);
}

export function deleteGrowthPrediction(id: number): void {
  db.prepare("DELETE FROM growth_predictions WHERE id = ?").run(assertGrowthId(id, "prediction id"));
}

export function addGrowthSelfModel(input: GrowthSelfModelInput): GrowthSelfModelEntry {
  const section = assertGrowthEnum(input.section, GROWTH_SELF_SECTIONS, "self-model section");
  const statement = normalizeGrowthName(input.statement);
  const confidence = assertGrowthInt(input.confidence, 0, 5, "confidence");
  const id = db.prepare(`
    INSERT INTO growth_self_model (section, statement, evidence, confidence)
    VALUES (?, ?, ?, ?)
  `).run(section, statement, String(input.evidence ?? "").trim(), confidence)
    .lastInsertRowid as number;
  return getGrowthSelfModelOrThrow(id);
}

export function updateGrowthSelfModel(
  id: number,
  patch: GrowthSelfModelPatch,
): GrowthSelfModelEntry {
  const entryId = assertGrowthId(id, "self-model id");
  const row = db.prepare("SELECT * FROM growth_self_model WHERE id = ?").get(entryId) as
    GrowthSelfModelRow | undefined;
  if (!row) throw new Error(`Growth self-model entry not found: ${entryId}`);
  const section = patch.section !== undefined
    ? assertGrowthEnum(patch.section, GROWTH_SELF_SECTIONS, "self-model section")
    : row.section;
  const statement = patch.statement !== undefined ? normalizeGrowthName(patch.statement) : row.statement;
  const evidence = patch.evidence !== undefined ? String(patch.evidence).trim() : row.evidence;
  const confidence = patch.confidence !== undefined
    ? assertGrowthInt(patch.confidence, 0, 5, "confidence")
    : row.confidence;
  db.prepare(`
    UPDATE growth_self_model
    SET section = ?, statement = ?, evidence = ?, confidence = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(section, statement, evidence, confidence, entryId);
  return getGrowthSelfModelOrThrow(entryId);
}

export function deleteGrowthSelfModel(id: number): void {
  db.prepare("DELETE FROM growth_self_model WHERE id = ?").run(assertGrowthId(id, "self-model id"));
}

function normalizeGrowthFeedbackInput(input: GrowthFeedbackInput): GrowthFeedbackInput {
  assertDateKey(input.receivedOn);
  const strengths = String(input.strengths ?? "").trim();
  const weakness = String(input.weakness ?? "").trim();
  const friction = String(input.friction ?? "").trim();
  if (!strengths && !weakness && !friction) throw new Error("GROWTH_FEEDBACK_EMPTY");
  return {
    source: String(input.source ?? "").trim(),
    strengths,
    weakness,
    friction,
    calibration: String(input.calibration ?? "").trim(),
    receivedOn: input.receivedOn,
  };
}

export function addGrowthFeedback(input: GrowthFeedbackInput): GrowthFeedback {
  const data = normalizeGrowthFeedbackInput(input);
  const id = db.prepare(`
    INSERT INTO growth_feedback (source, strengths, weakness, friction, calibration, received_on)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    data.source,
    data.strengths,
    data.weakness,
    data.friction,
    data.calibration,
    data.receivedOn,
  ).lastInsertRowid as number;
  const row = db.prepare("SELECT * FROM growth_feedback WHERE id = ?").get(id) as
    GrowthFeedbackRow | undefined;
  if (!row) throw new Error(`Growth feedback not found: ${id}`);
  return toGrowthFeedback(row);
}

export function updateGrowthFeedback(id: number, input: GrowthFeedbackInput): GrowthFeedback {
  const feedbackId = assertGrowthId(id, "feedback id");
  const data = normalizeGrowthFeedbackInput(input);
  db.prepare(`
    UPDATE growth_feedback
    SET source = ?, strengths = ?, weakness = ?, friction = ?, calibration = ?, received_on = ?
    WHERE id = ?
  `).run(
    data.source,
    data.strengths,
    data.weakness,
    data.friction,
    data.calibration,
    data.receivedOn,
    feedbackId,
  );
  const row = db.prepare("SELECT * FROM growth_feedback WHERE id = ?").get(feedbackId) as
    GrowthFeedbackRow | undefined;
  if (!row) throw new Error(`Growth feedback not found: ${feedbackId}`);
  return toGrowthFeedback(row);
}

export function deleteGrowthFeedback(id: number): void {
  db.prepare("DELETE FROM growth_feedback WHERE id = ?").run(assertGrowthId(id, "feedback id"));
}

// ---- Growth: chronicle — annual page + global timeline (P4) ----

export function saveGrowthAnnualNote(input: GrowthAnnualNoteInput): GrowthAnnualNote {
  const year = assertGrowthInt(input.year, 1970, 2200, "year");
  const milestones = (Array.isArray(input.milestones) ? input.milestones : [])
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .slice(0, 3);
  db.prepare(`
    INSERT INTO growth_annual_notes (year, summary, kept, dropped, milestones, next_focus)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(year) DO UPDATE SET
      summary = excluded.summary,
      kept = excluded.kept,
      dropped = excluded.dropped,
      milestones = excluded.milestones,
      next_focus = excluded.next_focus,
      updated_at = datetime('now')
  `).run(
    year,
    String(input.summary ?? "").trim(),
    String(input.kept ?? "").trim(),
    String(input.dropped ?? "").trim(),
    JSON.stringify(milestones),
    String(input.nextFocus ?? "").trim(),
  );
  const row = db.prepare("SELECT * FROM growth_annual_notes WHERE year = ?").get(year) as
    GrowthAnnualNoteRow | undefined;
  if (!row) throw new Error("Growth annual note not found after write");
  return toGrowthAnnualNote(row);
}

export function deleteGrowthAnnualNote(year: number): void {
  const safeYear = assertGrowthInt(year, 1970, 2200, "year");
  db.prepare("DELETE FROM growth_annual_notes WHERE year = ?").run(safeYear);
}

/**
 * Every snapshot, oldest first. The global curve needs the latest snapshot
 * per capability at each month end, so the renderer gets the raw rows and
 * derives it in `src/lib/growth.ts`.
 */
export function getGrowthTimeline(): GrowthSnapshot[] {
  const rows = db.prepare(`
    SELECT * FROM growth_snapshots
    ORDER BY taken_at ASC, id ASC
  `).all() as GrowthSnapshotRow[];
  return rows.map(toGrowthSnapshot);
}

// ---- Growth: portable backup (export / import) ----

function backupText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function backupNullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function backupInt(value: unknown, field: string, min: number, max: number): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`GROWTH_IMPORT_INVALID:${field}`);
  }
  return parsed;
}

function backupNullableInt(value: unknown, field: string, min: number, max: number): number | null {
  return value === null || value === undefined ? null : backupInt(value, field, min, max);
}

function backupEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  const text = String(value);
  if (!allowed.includes(text as T)) throw new Error(`GROWTH_IMPORT_INVALID:${field}`);
  return text as T;
}

function backupRef(
  map: Map<number, number>,
  value: unknown,
  field: string,
): number | null {
  if (value === null || value === undefined) return null;
  const oldId = backupInt(value, field, 1, Number.MAX_SAFE_INTEGER);
  const mapped = map.get(oldId);
  if (mapped === undefined) throw new Error(`GROWTH_IMPORT_INVALID:${field}`);
  return mapped;
}

function backupTransform(value: unknown): string {
  if (value === null || value === undefined) return "";
  const parsed = parseGrowthCoverTransform(JSON.stringify(value));
  return parsed === null ? "" : JSON.stringify(parsed);
}

function backupCounts(bundle: GrowthBackup): GrowthBackupCounts {
  return {
    domains: bundle.domains.length,
    capabilities: bundle.capabilities.length,
    evidence: bundle.evidence.length,
    snapshots: bundle.snapshots.length,
    seasons: bundle.seasons.length,
    challenges: bundle.challenges.length,
    artifacts: bundle.artifacts.length,
    tasks: bundle.tasks.length,
    predictions: bundle.predictions.length,
    selfModel: bundle.selfModel.length,
    feedback: bundle.feedback.length,
    annualNotes: bundle.annualNotes.length,
    covers: Object.keys(bundle.covers ?? {}).length,
  };
}

export function growthBackupCounts(bundle: GrowthBackup): GrowthBackupCounts {
  return backupCounts(bundle);
}

/** Cheap "is there anything to overwrite?" probe for the import preview. */
export function growthHasAnyData(): boolean {
  return Boolean(db.prepare("SELECT 1 FROM growth_domains LIMIT 1").get());
}

/** All growth rows, not the UI's time-windowed `growth:state` slice. */
export function exportGrowthBackup(): GrowthBackup {
  const domainRows = db.prepare(`
    SELECT d.*,
      (SELECT COUNT(*) FROM growth_capabilities c
        WHERE c.domain_id = d.id AND c.status != 'archived') AS capability_count
    FROM growth_domains d
    ORDER BY d.sort_order ASC, d.id ASC
  `).all() as GrowthDomainRow[];
  const capabilityRows = db.prepare(`
    ${GROWTH_CAPABILITY_SELECT}
    ORDER BY c.status ASC, c.sort_order ASC, c.id ASC
  `).all() as GrowthCapabilityRow[];
  const evidenceRows = db.prepare("SELECT * FROM growth_evidence ORDER BY id ASC").all() as
    GrowthEvidenceRow[];
  const snapshotRows = db.prepare("SELECT * FROM growth_snapshots ORDER BY id ASC").all() as
    GrowthSnapshotRow[];
  const seasonRows = db.prepare(
    "SELECT * FROM growth_seasons ORDER BY start_date ASC, id ASC",
  ).all() as GrowthSeasonRow[];
  const challengeRows = db.prepare(`
    ${GROWTH_CHALLENGE_SELECT}
    ORDER BY c.id ASC
  `).all() as GrowthChallengeRow[];
  const artifactRows = db.prepare(`
    ${GROWTH_ARTIFACT_SELECT}
    ORDER BY a.id ASC
  `).all() as GrowthArtifactRow[];
  const taskRows = db.prepare(`
    ${GROWTH_TASK_SELECT}
    ORDER BY t.id ASC
  `).all() as GrowthTaskRow[];
  const predictionRows = db.prepare(`
    ${GROWTH_PREDICTION_SELECT}
    ORDER BY p.id ASC
  `).all() as GrowthPredictionRow[];
  const selfModelRows = db.prepare(
    "SELECT * FROM growth_self_model ORDER BY id ASC",
  ).all() as GrowthSelfModelRow[];
  const feedbackRows = db.prepare(
    "SELECT * FROM growth_feedback ORDER BY id ASC",
  ).all() as GrowthFeedbackRow[];
  const annualRows = db.prepare(
    "SELECT * FROM growth_annual_notes ORDER BY year ASC",
  ).all() as GrowthAnnualNoteRow[];
  const seasonMedia = getGrowthMediaRowsByOwner("season");
  const artifactMedia = getGrowthMediaRowsByOwner("artifact");

  return {
    format: "prism-growth",
    version: 3,
    exportedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    domains: domainRows.map(toGrowthDomain),
    capabilities: capabilityRows.map(toGrowthCapability),
    evidence: evidenceRows.map(toGrowthEvidence),
    snapshots: snapshotRows.map(toGrowthSnapshot),
    seasons: seasonRows.map((row) => toGrowthSeason(row, seasonMedia.get(row.id) ?? [])),
    challenges: challengeRows.map(toGrowthChallenge),
    artifacts: artifactRows.map((row) => toGrowthArtifact(row, artifactMedia.get(row.id) ?? [])),
    tasks: taskRows.map(toGrowthTask),
    predictions: predictionRows.map(toGrowthPrediction),
    selfModel: selfModelRows.map(toGrowthSelfModelEntry),
    feedback: feedbackRows.map(toGrowthFeedback),
    annualNotes: annualRows.map(toGrowthAnnualNote),
    covers: {},
  };
}

/**
 * Replace every growth row with the backup, remapping ids. The caller writes
 * cover files first and passes the old->new name map. Everything runs in one
 * transaction; a bad file leaves the existing data untouched.
 */
export function importGrowthBackup(
  bundle: GrowthBackup,
  coverMap: Record<string, string> = {},
): GrowthBackupCounts {
  const domains = new Map<number, number>();
  const capabilities = new Map<number, number>();
  const seasons = new Map<number, number>();
  const challenges = new Map<number, number>();
  const tasks = new Map<number, number>();

  db.transaction(() => {
    db.exec(`
      DELETE FROM growth_media;
      DELETE FROM growth_snapshots;
      DELETE FROM growth_evidence;
      DELETE FROM growth_artifacts;
      DELETE FROM growth_challenges;
      DELETE FROM growth_tasks;
      DELETE FROM growth_predictions;
      DELETE FROM growth_self_model;
      DELETE FROM growth_feedback;
      DELETE FROM growth_annual_notes;
      UPDATE growth_capabilities SET parent_id = NULL;
      DELETE FROM growth_capabilities;
      DELETE FROM growth_seasons;
      DELETE FROM growth_domains;
    `);

    bundle.domains.forEach((domain, index) => {
      const oldId = backupInt(domain.id, "domain id", 1, Number.MAX_SAFE_INTEGER);
      if (domains.has(oldId)) throw new Error("GROWTH_IMPORT_INVALID:duplicate domain");
      const name = backupText(domain.name).trim();
      if (!name) throw new Error("GROWTH_IMPORT_INVALID:domain name");
      const weight = Math.min(1, Math.max(0.01, Number(domain.weight) || 0.15));
      const id = db.prepare(
        "INSERT INTO growth_domains (name, weight, theme, sort_order) VALUES (?, ?, ?, ?)",
      ).run(name, weight, normalizeGrowthTheme(domain.theme), index).lastInsertRowid as number;
      domains.set(oldId, id);
    });

    const sortByDomain = new Map<number, number>();
    for (const cap of bundle.capabilities) {
      const oldId = backupInt(cap.id, "capability id", 1, Number.MAX_SAFE_INTEGER);
      if (capabilities.has(oldId)) throw new Error("GROWTH_IMPORT_INVALID:duplicate capability");
      const domainId = backupRef(domains, cap.domainId, "capability domain");
      if (domainId === null) throw new Error("GROWTH_IMPORT_INVALID:capability domain");
      const sortOrder = sortByDomain.get(domainId) ?? 0;
      sortByDomain.set(domainId, sortOrder + 1);
      const id = db.prepare(`
        INSERT INTO growth_capabilities
          (domain_id, parent_id, name, level, confidence, half_life, portability, status,
           target_level, target_date, evidence_definition, notes,
           last_evidence_at, last_reviewed_at, sort_order, created_at, updated_at)
        VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        domainId,
        backupText(cap.name).trim() || "未命名能力",
        backupInt(cap.level, "capability level", 1, 6),
        backupInt(cap.confidence, "capability confidence", 0, 5),
        backupEnum(cap.halfLife, GROWTH_HALF_LIVES, "half life"),
        backupEnum(cap.portability, GROWTH_PORTABILITIES, "portability"),
        backupEnum(cap.status, GROWTH_STATUSES, "capability status"),
        backupNullableInt(cap.targetLevel, "target level", 1, 6),
        backupNullableText(cap.targetDate),
        backupText(cap.evidenceDefinition),
        backupText(cap.notes),
        backupNullableText(cap.lastEvidenceAt),
        backupNullableText(cap.lastReviewedAt),
        sortOrder,
        backupText(cap.createdAt) || new Date().toISOString(),
        backupText(cap.updatedAt) || new Date().toISOString(),
      ).lastInsertRowid as number;
      capabilities.set(oldId, id);
    }

    for (const cap of bundle.capabilities) {
      if (cap.parentId === null || cap.parentId === undefined) continue;
      const oldId = backupInt(cap.id, "capability id", 1, Number.MAX_SAFE_INTEGER);
      if (Number(cap.parentId) === oldId) throw new Error("GROWTH_IMPORT_INVALID:capability parent");
      const id = capabilities.get(oldId);
      const parentId = backupRef(capabilities, cap.parentId, "capability parent");
      if (id && parentId) db.prepare("UPDATE growth_capabilities SET parent_id = ? WHERE id = ?").run(parentId, id);
    }

    for (const season of bundle.seasons) {
      const oldId = backupInt(season.id, "season id", 1, Number.MAX_SAFE_INTEGER);
      if (seasons.has(oldId)) throw new Error("GROWTH_IMPORT_INVALID:duplicate season");
      const cover = season.cover ? coverMap[season.cover] ?? "" : "";
      const coverTransform = backupTransform(season.coverTransform);
      const id = db.prepare(`
        INSERT INTO growth_seasons
          (title, focus, start_date, end_date, theme, closed_at, outcome, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        backupText(season.title).trim() || "未命名赛季",
        backupText(season.focus),
        backupText(season.startDate),
        backupText(season.endDate),
        normalizeGrowthTheme(season.theme),
        backupNullableText(season.closedAt),
        backupText(season.outcome),
        backupText(season.createdAt) || new Date().toISOString(),
      ).lastInsertRowid as number;
      syncGrowthMedia(
        "season",
        id,
        cover ? [{ file: cover, transform: coverTransform, isCover: true }] : [],
      );
      seasons.set(oldId, id);
    }

    for (const challenge of bundle.challenges) {
      const oldId = backupInt(challenge.id, "challenge id", 1, Number.MAX_SAFE_INTEGER);
      if (challenges.has(oldId)) throw new Error("GROWTH_IMPORT_INVALID:duplicate challenge");
      const id = db.prepare(`
        INSERT INTO growth_challenges
          (capability_id, season_id, title, description, goal, criteria,
           reflection, body, difficulty_level, status, attribution, result_note,
           resolved_on, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        backupRef(capabilities, challenge.capabilityId, "challenge capability"),
        backupRef(seasons, challenge.seasonId, "challenge season"),
        backupText(challenge.title).trim() || "未命名挑战",
        backupText(challenge.description),
        backupText(challenge.goal),
        backupText(challenge.criteria),
        backupText(challenge.reflection),
        backupText(challenge.body),
        backupInt(challenge.difficultyLevel, "challenge difficulty", 1, 6),
        backupEnum(challenge.status, GROWTH_CHALLENGE_STATUSES, "challenge status"),
        challenge.attribution === null || challenge.attribution === undefined
          ? null
          : backupEnum(challenge.attribution, GROWTH_ATTRIBUTIONS, "attribution"),
        backupText(challenge.resultNote),
        backupNullableText(challenge.resolvedOn),
        backupText(challenge.createdAt) || new Date().toISOString(),
      ).lastInsertRowid as number;
      challenges.set(oldId, id);
    }

    for (const artifact of bundle.artifacts) {
      const mappedCover = artifact.cover ? coverMap[artifact.cover] ?? "" : "";
      const mappedImages = Array.isArray(artifact.images)
        ? artifact.images.map((name) => (name ? coverMap[name] ?? "" : "")).filter(Boolean)
        : [];
      const gallery = resolveArtifactGallery(mappedCover, mappedImages);
      const id = db.prepare(`
        INSERT INTO growth_artifacts
          (capability_id, challenge_id, title, kind, url, note, body, created_on, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        backupRef(capabilities, artifact.capabilityId, "artifact capability"),
        backupRef(challenges, artifact.challengeId, "artifact challenge"),
        backupText(artifact.title).trim() || "未命名作品",
        backupEnum(artifact.kind, GROWTH_ARTIFACT_KINDS, "artifact kind"),
        backupText(artifact.url),
        backupText(artifact.note),
        backupText(artifact.body),
        backupNullableText(artifact.createdOn),
        backupText(artifact.createdAt) || new Date().toISOString(),
      ).lastInsertRowid as number;
      syncGrowthMedia(
        "artifact",
        id,
        gallery.images.map((file) => ({
          file,
          isCover: file === gallery.cover,
        })),
      );
    }

    for (const task of bundle.tasks) {
      const oldId = backupInt(task.id, "task id", 1, Number.MAX_SAFE_INTEGER);
      const id = db.prepare(`
        INSERT INTO growth_tasks
          (title, notes, capability_id, challenge_id, scheduled_date, due_date, completed_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        backupText(task.title).trim() || "未命名任务",
        backupText(task.notes),
        backupRef(capabilities, task.capability?.id, "task capability"),
        backupRef(challenges, task.challenge?.id, "task challenge"),
        backupNullableText(task.scheduledDate),
        backupNullableText(task.dueDate),
        backupNullableText(task.completedAt),
        backupText(task.createdAt) || new Date().toISOString(),
      ).lastInsertRowid as number;
      tasks.set(oldId, id);
    }

    for (const prediction of bundle.predictions) {
      db.prepare(`
        INSERT INTO growth_predictions
          (kind, subject, predicted, actual, predicted_on, note,
           capability_id, challenge_id, task_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        backupEnum(prediction.kind, GROWTH_PREDICTION_KINDS, "prediction kind"),
        backupText(prediction.subject).trim() || "未命名预测",
        Number(prediction.predicted),
        prediction.actual === null || prediction.actual === undefined
          ? null
          : Number(prediction.actual),
        backupText(prediction.predictedOn),
        backupText(prediction.note),
        backupRef(capabilities, prediction.capability?.id, "prediction capability"),
        backupRef(challenges, prediction.challenge?.id, "prediction challenge"),
        backupRef(tasks, prediction.task?.id, "prediction task"),
        backupText(prediction.createdAt) || new Date().toISOString(),
      );
    }

    for (const entry of bundle.selfModel) {
      db.prepare(`
        INSERT INTO growth_self_model
          (section, statement, evidence, confidence, updated_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        backupEnum(entry.section, GROWTH_SELF_SECTIONS, "self-model section"),
        backupText(entry.statement).trim() || "（空）",
        backupText(entry.evidence),
        backupInt(entry.confidence, "self-model confidence", 0, 5),
        backupText(entry.updatedAt) || new Date().toISOString(),
        backupText(entry.createdAt) || new Date().toISOString(),
      );
    }

    for (const row of bundle.feedback) {
      db.prepare(`
        INSERT INTO growth_feedback
          (source, strengths, weakness, friction, calibration, received_on, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        backupText(row.source),
        backupText(row.strengths),
        backupText(row.weakness),
        backupText(row.friction),
        backupText(row.calibration),
        backupText(row.receivedOn),
        backupText(row.createdAt) || new Date().toISOString(),
      );
    }

    for (const note of bundle.annualNotes) {
      const year = backupInt(note.year, "annual year", 1970, 2200);
      const milestones = Array.isArray(note.milestones)
        ? note.milestones.map((item) => backupText(item)).filter(Boolean).slice(0, 3)
        : [];
      db.prepare(`
        INSERT INTO growth_annual_notes
          (year, summary, kept, dropped, milestones, next_focus, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        year,
        backupText(note.summary),
        backupText(note.kept),
        backupText(note.dropped),
        JSON.stringify(milestones),
        backupText(note.nextFocus),
        backupText(note.updatedAt) || new Date().toISOString(),
      );
    }

    for (const row of bundle.evidence) {
      const capabilityId = backupRef(capabilities, row.capabilityId, "evidence capability");
      if (capabilityId === null) throw new Error("GROWTH_IMPORT_INVALID:evidence capability");
      db.prepare(`
        INSERT INTO growth_evidence
          (capability_id, kind, title, detail, url, happened_on, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        capabilityId,
        backupEnum(row.kind, GROWTH_EVIDENCE_KINDS, "evidence kind"),
        backupText(row.title).trim() || "未命名证据",
        backupText(row.detail),
        backupText(row.url),
        backupNullableText(row.happenedOn),
        backupText(row.createdAt) || new Date().toISOString(),
      );
    }

    for (const row of bundle.snapshots) {
      const capabilityId = backupRef(capabilities, row.capabilityId, "snapshot capability");
      if (capabilityId === null) throw new Error("GROWTH_IMPORT_INVALID:snapshot capability");
      db.prepare(`
        INSERT INTO growth_snapshots (capability_id, level, confidence, note, taken_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        capabilityId,
        backupInt(row.level, "snapshot level", 1, 6),
        backupInt(row.confidence, "snapshot confidence", 0, 5),
        backupText(row.note),
        backupText(row.takenAt) || new Date().toISOString(),
      );
    }
  })();

  return backupCounts(bundle);
}
