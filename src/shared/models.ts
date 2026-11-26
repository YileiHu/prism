// IPC-facing domain models shared by the Electron main process and the
// renderer. Keep this file type-only: database rows are mapped to these
// shapes at the IPC boundary so the renderer never sees snake_case columns
// or 0/1 flags.

import type { GlobalShortcutAction } from "./shortcuts";

export interface NoteRef {
  path: string;
  title: string;
}

export interface NoteBrief extends NoteRef {
  id: number;
  tags: string;
  modifiedAt: string;
}

export interface NoteContentHit extends NoteRef {
  snippet: string;
}

export interface Resource {
  id: number;
  url: string;
  title: string;
  notes: string;
  createdAt: string;
  /** Owning collection; null means uncategorized (resources are single-assignment). */
  collectionId: number | null;
}

/** Flat collection for the path-less web-resources library (SQLite-backed). */
export interface ResourceCollection {
  id: number;
  name: string;
  color: string;
  sortOrder: number;
  /** Total members, independent of the current search query. */
  count: number;
}

export interface PdfDocument {
  id: number;
  repoPath: string;
  path: string;
  relPath: string;
  title: string;
  pageCount: number | null;
  fileSize: number;
  modifiedAt: string;
  coverPath: string;
  coverVersion: number;
  coverCustom: boolean;
  coverDirty: boolean;
  addedAt: string;
}

/** One PDF collection in the repo's `.prism/pdf-collections.json` sidecar. */
export interface PdfCollectionData {
  id: string;
  name: string;
  color?: string;
  pdfPaths: string[];
}

export interface PdfCollectionsFile {
  version?: number;
  collections: PdfCollectionData[];
}

export interface GlobalShortcutState {
  shortcut: string;
  registered: boolean;
}

// OS-level registration result keyed by the global shortcut actions.
export type GlobalShortcutStatus = Record<GlobalShortcutAction, GlobalShortcutState>;

// Capabilities behind the "close behavior / launch at login" settings. The
// renderer uses it to disable unsupported rows and to explain that login items
// are only written by packaged builds.
export interface AppLaunchState {
  packaged: boolean;
  loginItemSupported: boolean;
  hiddenStartSupported: boolean;
}

export interface CanvasFile {
  path: string;
  title: string;
  modifiedAt: number;
}

export interface CanvasContent extends CanvasFile {
  json: string;
}

export type CanvasSaveResult =
  | { modifiedAt: number }
  | { conflict: true; modifiedAt: number };

export interface NoteGroupData {
  id: string;
  name: string;
  notePaths: string[];
  color?: string;
}

export interface NoteCollectionData {
  id: string;
  name: string;
  notePaths: string[];
  groups?: NoteGroupData[];
  color?: string;
}

export interface NoteCollectionsFile {
  version?: number;
  collections: NoteCollectionData[];
}

/** One IPC round-trip for the startup path: notes, collections, canvases. */
export interface VaultLibrarySummary {
  notes: NoteBrief[];
  collections: NoteCollectionsFile | null;
  canvases: CanvasFile[];
}

/** Incremental note-list patch pushed by the vault watcher scan. */
export interface NoteListChanges {
  upserted: NoteBrief[];
  deleted: string[];
}

/** Incremental PDF-list patch pushed by the repo watcher scan. */
export interface PdfListChanges {
  upserted: PdfDocument[];
  deleted: string[];
}

export interface CanvasGroup {
  id: string;
  name: string;
  color?: string;
  paths: string[];
}

export interface CanvasGroupsFile {
  version: number;
  groups: CanvasGroup[];
  paths: string[];
}

export interface VaultPrivacyStatus {
  path: string;
  private: boolean;
  locked: boolean;
}

export interface VaultMigrationProgress {
  vaultPath: string;
  done: number;
  total: number;
}

export interface VaultMigrationResult {
  vaultPath: string;
  files: number;
}

// ---- Growth (养成): the capability scale ----
// Levels are behavioural anchors (1..6), not free numbers; confidence says how
// much evidence backs the level. Both are rated in the review flow only.
export type GrowthHalfLife = "long" | "mid" | "short";
export type GrowthPortability = "high" | "low";
export type GrowthStatus = "active" | "observe" | "archived";
export type GrowthEvidenceKind = "artifact" | "feedback" | "metric" | "usage";

export interface GrowthDomain {
  id: number;
  name: string;
  weight: number;
  /** Tag-palette key giving the domain its own colour. */
  theme: string;
  sortOrder: number;
  /** Active capabilities in this domain; archived ones are not counted. */
  capabilityCount: number;
}

export interface GrowthCapability {
  id: number;
  domainId: number;
  /** Optional prerequisite inside the same domain; only roots may be parents. */
  parentId: number | null;
  name: string;
  level: number;
  confidence: number;
  halfLife: GrowthHalfLife;
  portability: GrowthPortability;
  status: GrowthStatus;
  targetLevel: number | null;
  /** Local calendar date (YYYY-MM-DD). */
  targetDate: string | null;
  evidenceDefinition: string;
  notes: string;
  /** UTC timestamp of the newest evidence record; null when there is none. */
  lastEvidenceAt: string | null;
  /** UTC timestamp of the last review (the only path that changes the level). */
  lastReviewedAt: string | null;
  evidenceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GrowthEvidence {
  id: number;
  capabilityId: number;
  kind: GrowthEvidenceKind;
  title: string;
  detail: string;
  url: string;
  /** Local calendar date (YYYY-MM-DD). */
  happenedOn: string | null;
  createdAt: string;
}

export interface GrowthSnapshot {
  id: number;
  capabilityId: number;
  level: number;
  confidence: number;
  note: string;
  takenAt: string;
}

export interface GrowthState {
  domains: GrowthDomain[];
  capabilities: GrowthCapability[];
  seasons: GrowthSeason[];
  challenges: GrowthChallenge[];
  artifacts: GrowthArtifact[];
  /**
   * Every unsettled forecast plus the settled ones from the last 90 days,
   * newest first. Pending rows never fall out of the list with age.
   */
  predictions: GrowthPrediction[];
  selfModel: GrowthSelfModelEntry[];
  feedback: GrowthFeedback[];
  /** One page per year; newest first. */
  annualNotes: GrowthAnnualNote[];
}

// ---- Growth: portable backup (export / import) ----
export interface GrowthBackupCounts {
  domains: number;
  capabilities: number;
  evidence: number;
  snapshots: number;
  seasons: number;
  challenges: number;
  artifacts: number;
  tasks: number;
  predictions: number;
  selfModel: number;
  feedback: number;
  annualNotes: number;
  covers: number;
}

/**
 * Single-file growth backup. Covers are data URLs keyed by their original
 * generated file name; every other id keeps its local meaning until import,
 * which remaps ids to the destination database.
 */
export interface GrowthBackup {
  format: "prism-growth";
  version: 3;
  exportedAt: string;
  appVersion: string;
  domains: GrowthDomain[];
  capabilities: GrowthCapability[];
  evidence: GrowthEvidence[];
  snapshots: GrowthSnapshot[];
  seasons: GrowthSeason[];
  challenges: GrowthChallenge[];
  artifacts: GrowthArtifact[];
  tasks: GrowthTask[];
  predictions: GrowthPrediction[];
  selfModel: GrowthSelfModelEntry[];
  feedback: GrowthFeedback[];
  annualNotes: GrowthAnnualNote[];
  covers: Record<string, string>;
}

export interface GrowthBackupExportResult {
  canceled: boolean;
  fileName?: string;
  counts?: GrowthBackupCounts;
}

export interface GrowthBackupPreview {
  token: string;
  fileName: string;
  exportedAt: string;
  appVersion: string;
  counts: GrowthBackupCounts;
  hasExistingData: boolean;
}

export interface GrowthBackupImportResult {
  counts: GrowthBackupCounts;
  backupFileName: string;
}

// ---- Growth: chronicle (P4) ----
export interface GrowthAnnualNote {
  id: number;
  year: number;
  /** "This year I became…" — one short paragraph. */
  summary: string;
  /** The one thing about yourself worth remembering this year. */
  kept: string;
  /** The one fixation worth dropping. */
  dropped: string;
  /** Up to three moments worth naming for the year. */
  milestones: string[];
  /** The single thing to do next year. */
  nextFocus: string;
  updatedAt: string;
}

export interface GrowthAnnualNoteInput {
  year: number;
  summary: string;
  kept: string;
  dropped: string;
  milestones: string[];
  nextFocus: string;
}

// ---- Growth: effort removed in D-049 ----

// ---- Growth: tasks (P2) ----
/**
 * A dated commitment inside the growth module. Tasks are the only place that
 * schedules future work; challenges remain proof tests without dates.
 */
export interface GrowthTask {
  id: number;
  title: string;
  notes: string;
  /** The capability this task practises, joined for display. */
  capability: { id: number; name: string } | null;
  /** The challenge this task is a step of; its season is implied. */
  challenge: { id: number; title: string } | null;
  /** Local calendar date (YYYY-MM-DD): the first day the task is planned. */
  scheduledDate: string | null;
  /** Local calendar date (YYYY-MM-DD): the deadline. */
  dueDate: string | null;
  /** UTC timestamp; null means the task is still open. */
  completedAt: string | null;
  createdAt: string;
}

export interface GrowthTaskInput {
  title: string;
  notes?: string;
  capabilityId?: number | null;
  challengeId?: number | null;
  scheduledDate?: string | null;
  dueDate?: string | null;
}

export interface GrowthTaskPatch {
  title?: string;
  notes?: string;
  capabilityId?: number | null;
  challengeId?: number | null;
  scheduledDate?: string | null;
  dueDate?: string | null;
}

export interface GrowthTasksPayload {
  open: GrowthTask[];
  completed: GrowthTask[];
}


// ---- Growth: metacognition (P3) ----
export type GrowthPredictionKind = "time" | "difficulty" | "mood";

/** One prediction/actual pair. Logged before the work, settled after it. */
export interface GrowthPrediction {
  id: number;
  kind: GrowthPredictionKind;
  /** What was predicted (a task, a meeting, a bug). */
  subject: string;
  /** Unit depends on kind: minutes / 1-5 / -2..2. */
  predicted: number;
  /** Null while the outcome is still pending — pending rows never score. */
  actual: number | null;
  /** Local calendar date (YYYY-MM-DD). */
  predictedOn: string;
  note: string;
  /** The capability this measurement is about; null for an unattached forecast. */
  capability: { id: number; name: string } | null;
  /** The challenge this forecast is about (mutually exclusive with `task`). */
  challenge: { id: number; title: string } | null;
  /** The task this forecast is about (mutually exclusive with `challenge`). */
  task: { id: number; title: string } | null;
  createdAt: string;
}

export interface GrowthPredictionInput {
  kind: GrowthPredictionKind;
  subject: string;
  predicted: number;
  /** Omit (or null) for a forecast that has not been settled yet. */
  actual?: number | null;
  predictedOn: string;
  note: string;
  capabilityId?: number | null;
  challengeId?: number | null;
  taskId?: number | null;
}

/** Fixed sections of the "operating manual of me". */
export type GrowthSelfSection =
  | "energy"
  | "motivation"
  | "procrastination"
  | "bias"
  | "learning"
  | "social"
  | "values"
  | "blindspots";

export interface GrowthSelfModelEntry {
  id: number;
  section: GrowthSelfSection;
  statement: string;
  evidence: string;
  /** 0..5, same scale as capability evidence confidence. */
  confidence: number;
  updatedAt: string;
  createdAt: string;
}

export interface GrowthSelfModelInput {
  section: GrowthSelfSection;
  statement: string;
  evidence: string;
  confidence: number;
}

export interface GrowthSelfModelPatch {
  statement?: string;
  evidence?: string;
  confidence?: number;
  section?: GrowthSelfSection;
}

/** Quarterly external calibration: three questions, no scores. */
export interface GrowthFeedback {
  id: number;
  /** Who said it; free text, may be empty. */
  source: string;
  strengths: string;
  weakness: string;
  friction: string;
  /** The largest self-vs-other deviation noticed from this round. */
  calibration: string;
  /** Local calendar date (YYYY-MM-DD). */
  receivedOn: string;
  createdAt: string;
}

export interface GrowthFeedbackInput {
  source: string;
  strengths: string;
  weakness: string;
  friction: string;
  calibration: string;
  receivedOn: string;
}

// ---- Growth: challenges, seasons, artifacts (P1) ----
export type GrowthChallengeStatus = "open" | "passed" | "failed" | "abandoned";
/** Whether a win came from the person or from the platform. */
export type GrowthAttribution = "stats" | "buff";
export type GrowthArtifactKind = "demo" | "article" | "repo" | "doc" | "other";

export interface GrowthSeason {
  id: number;
  title: string;
  /** 主线：one sentence for the season. */
  focus: string;
  /** Local calendar date (YYYY-MM-DD). */
  startDate: string;
  endDate: string;
  /** Tag-palette key used by the season poster (e.g. "violet"). */
  theme: string;
  /** Optional theme photo file name; empty means the default gradient. */
  cover: string;
  /** Free pan/zoom for the cover: focal point 0..1 plus a 1..3 zoom. */
  coverTransform: GrowthCoverTransform | null;
  /** UTC timestamp when the season was settled; null while running. */
  closedAt: string | null;
  outcome: string;
  createdAt: string;
}

export interface GrowthChallenge {
  id: number;
  capabilityId: number | null;
  capabilityName: string;
  seasonId: number | null;
  seasonTitle: string;
  title: string;
  /** One-line overview shown in the list and at the top of the detail. */
  description: string;
  /** Why this challenge exists. */
  goal: string;
  /** Definition of done, one criterion per line. */
  criteria: string;
  /** Retrospective: what was learned, what to change next time. */
  reflection: string;
  /** Long-form process record, edited from the detail page. */
  body: string;
  /** 1..6 — meant to be "current level + 1". */
  difficultyLevel: number;
  status: GrowthChallengeStatus;
  attribution: GrowthAttribution | null;
  resultNote: string;
  /** Local calendar date (YYYY-MM-DD) when it was resolved. */
  resolvedOn: string | null;
  createdAt: string;
}

export interface GrowthArtifact {
  id: number;
  capabilityId: number | null;
  capabilityName: string;
  /** The challenge that produced it, when it came from one. */
  challengeId: number | null;
  title: string;
  kind: GrowthArtifactKind;
  url: string;
  /** One-line intro shown on the showcase card (legacy column name: note). */
  note: string;
  /** Long-form Markdown work description. */
  body: string;
  /** App-managed cover image file name; empty means a kind placeholder. */
  cover: string;
  /** Ordered gallery shown in the detail viewer (includes the cover). */
  images: string[];
  /** Local calendar date (YYYY-MM-DD). */
  createdOn: string | null;
  createdAt: string;
}

export interface GrowthCoverTransform {
  /** Focal point, 0..1 of the image. */
  x: number;
  y: number;
  /** 1 = no zoom; up to 3. */
  scale: number;
}

export interface GrowthSeasonInput {
  title: string;
  focus: string;
  startDate: string;
  endDate: string;
  theme?: string;
  cover?: string;
  coverTransform?: GrowthCoverTransform | null;
}

export interface GrowthSeasonPatch {
  title?: string;
  focus?: string;
  startDate?: string;
  endDate?: string;
  theme?: string;
  cover?: string;
  coverTransform?: GrowthCoverTransform | null;
}

export interface GrowthChallengeInput {
  capabilityId: number | null;
  seasonId: number | null;
  title: string;
  description: string;
  goal?: string;
  criteria?: string;
  difficultyLevel: number;
}

export interface GrowthChallengePatch {
  capabilityId?: number | null;
  seasonId?: number | null;
  title?: string;
  description?: string;
  goal?: string;
  criteria?: string;
  reflection?: string;
  body?: string;
  resultNote?: string;
  difficultyLevel?: number;
}

export interface GrowthResolveInput {
  status: "passed" | "failed" | "abandoned";
  /** Required when status is "passed". */
  attribution?: GrowthAttribution | null;
  resultNote?: string;
  reflection?: string;
}

export interface GrowthResolveResult {
  challenge: GrowthChallenge;
  /** Present when the pass actually moved the capability. */
  capability: GrowthCapability | null;
  snapshot: GrowthSnapshot | null;
}

export interface GrowthArtifactInput {
  capabilityId: number | null;
  challengeId: number | null;
  title: string;
  kind: GrowthArtifactKind;
  url: string;
  note: string;
  body?: string;
  cover?: string;
  images?: string[];
  createdOn: string | null;
}

export interface GrowthArtifactPatch {
  capabilityId?: number | null;
  challengeId?: number | null;
  title?: string;
  kind?: GrowthArtifactKind;
  url?: string;
  note?: string;
  body?: string;
  cover?: string;
  images?: string[];
  createdOn?: string | null;
}

export interface GrowthCapabilityInput {
  domainId: number;
  parentId: number | null;
  name: string;
  level: number;
  confidence: number;
  halfLife: GrowthHalfLife;
  portability: GrowthPortability;
  targetLevel: number | null;
  targetDate: string | null;
  evidenceDefinition: string;
  notes: string;
}

export interface GrowthCapabilityPatch {
  domainId?: number;
  parentId?: number | null;
  name?: string;
  halfLife?: GrowthHalfLife;
  portability?: GrowthPortability;
  status?: GrowthStatus;
  targetLevel?: number | null;
  targetDate?: string | null;
  evidenceDefinition?: string;
  notes?: string;
}

export interface GrowthEvidenceInput {
  kind: GrowthEvidenceKind;
  title: string;
  detail: string;
  url: string;
  happenedOn: string | null;
}

export interface GrowthReviewInput {
  level: number;
  confidence: number;
  note: string;
}

export interface GrowthReviewResult {
  capability: GrowthCapability;
  snapshot: GrowthSnapshot;
}
