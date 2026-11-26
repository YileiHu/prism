import type {
  GrowthArtifact,
  GrowthCapability,
  GrowthChallenge,
  GrowthDomain,
  GrowthPrediction,
  GrowthPredictionKind,
  GrowthSeason,
  GrowthSnapshot,
} from "../shared/models";
import { dateKey, parseDateKey, parseSqliteTime } from "./dates";

// Derived values for the 养成 module. Everything here is a pure function of
// stored rows plus "now": confidence decay is computed on read, never written
// back, so snapshots keep the judgement that was actually made at the time.

/** Level centres on a 0–100 scale so domains can be aggregated into one chart. */
export const LEVEL_BASE = [10, 26, 42, 58, 74, 90] as const;

/**
 * Game-style display grades for the six behaviour-anchored levels. Storage
 * stays 1..6; only the label changed, so every gate keeps working unchanged.
 */
export const LEVEL_GRADES = ["C", "B", "A", "S", "SS", "SSS"] as const;

/** 0-based clamp used by grade, score and the level bar. */
export function levelIndex(level: number): number {
  return Math.min(LEVEL_GRADES.length, Math.max(1, Math.round(level))) - 1;
}

export function levelGrade(level: number): string {
  return LEVEL_GRADES[levelIndex(level)];
}

/** Half-width of the confidence band for C0..C5 (null = no claim at all). */
export const CONFIDENCE_BAND = [null, 15, 10, 5, 3, 2] as const;

const DAY_MS = 86_400_000;

export function levelScore(level: number): number {
  return LEVEL_BASE[levelIndex(level)];
}

/** Inverse of `levelScore`: the level whose centre is nearest to an aggregate score. */
export function scoreLevel(score: number | null): number | null {
  if (score === null || !Number.isFinite(score)) return null;
  let best = 1;
  let bestDistance = Infinity;
  LEVEL_BASE.forEach((base, index) => {
    const distance = Math.abs(base - score);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index + 1;
    }
  });
  return best;
}

export function confidenceBand(confidence: number | null): number | null {
  if (confidence === null) return null;
  const index = Math.min(CONFIDENCE_BAND.length - 1, Math.max(0, Math.round(confidence)));
  return CONFIDENCE_BAND[index];
}

export function daysSince(value: string | null, now: number): number | null {
  const ms = parseSqliteTime(value);
  if (ms === null) return null;
  return Math.max(0, (now - ms) / DAY_MS);
}

export interface GrowthDisplay {
  /** Level centre, 0–100. */
  score: number;
  /** Half-width of the displayed band; null when there is no evidence yet. */
  band: number | null;
  /** Confidence after time decay (C0..C5). */
  effectiveConfidence: number;
  /** More than 90 days without evidence (or never). */
  stale: boolean;
  /** No evidence has ever been recorded — not the same as decayed. */
  neverEvidenced: boolean;
  /** The confidence was lowered by decay, not rated that way. */
  decayed: boolean;
}

export function capabilityDisplay(cap: GrowthCapability, now = Date.now()): GrowthDisplay {
  const days = daysSince(cap.lastEvidenceAt, now);
  let downgrade = 0;
  if (days === null) downgrade = cap.confidence; // no evidence: nothing backs the claim
  else if (days > 180) downgrade = Math.min(2, cap.confidence);
  else if (days > 90) downgrade = Math.min(1, cap.confidence);
  const effectiveConfidence = Math.max(0, cap.confidence - downgrade);
  return {
    score: levelScore(cap.level),
    band: confidenceBand(effectiveConfidence),
    effectiveConfidence,
    stale: days === null || days > 90,
    neverEvidenced: days === null,
    decayed: days !== null && downgrade > 0,
  };
}

export function capabilityGap(cap: GrowthCapability): number | null {
  return cap.targetLevel === null ? null : cap.targetLevel - cap.level;
}

export function isActive(cap: GrowthCapability): boolean {
  return cap.status === "active";
}

export interface DomainAggregate {
  domainId: number;
  /** Mean level centre of the rated members; null when none has evidence. */
  score: number | null;
  /** Widest band among rated members, so the aggregate never looks more certain than its parts. */
  band: number | null;
  /** Active capabilities in the domain, rated or not. */
  count: number;
}

export function domainAggregates(
  domains: GrowthDomain[],
  capabilities: GrowthCapability[],
  now = Date.now(),
): DomainAggregate[] {
  const active = capabilities.filter(isActive);
  return domains.map((domain) => {
    const members = active.filter((cap) => cap.domainId === domain.id);
    let sum = 0;
    let rated = 0;
    let widest: number | null = null;
    for (const cap of members) {
      const display = capabilityDisplay(cap, now);
      // C0 members have no band: counting their level centre as data would
      // make an unrated capability drag the domain down.
      if (display.band === null) continue;
      sum += display.score;
      rated += 1;
      if (widest === null || display.band > widest) widest = display.band;
    }
    return {
      domainId: domain.id,
      score: rated === 0 ? null : sum / rated,
      band: rated === 0 ? null : widest,
      count: members.length,
    };
  });
}

/** Share of capability points sitting in "carry it with you" quadrants (P4 清档视图). */
export function portableShare(capabilities: GrowthCapability[]): number | null {
  const active = capabilities.filter(isActive);
  if (active.length === 0) return null;
  let total = 0;
  let portable = 0;
  for (const cap of active) {
    const score = levelScore(cap.level);
    total += score;
    if (cap.portability === "high" && cap.halfLife === "long") portable += score;
  }
  return total === 0 ? null : portable / total;
}

/** L3 needs one passed challenge, L4 two, L5 three. */
export function requiredChallengeCount(level: number): number {
  return level >= 3 ? level - 2 : 0;
}

export function passedChallengeCount(
  challenges: GrowthChallenge[],
  capabilityId: number,
): number {
  return challenges.filter(
    (challenge) => challenge.capabilityId === capabilityId && challenge.status === "passed",
  ).length;
}

export interface SeasonProgress {
  total: number;
  passed: number;
  open: number;
}

/**
 * Seasons oldest first. This is the order the poster ordinal counts along, so
 * every view that shows `S{n}` must go through here: the stored list arrives
 * running-season-first / newest-first, which would number the running one 1.
 */
export function seasonTimeline(seasons: GrowthSeason[]): GrowthSeason[] {
  return [...seasons].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id,
  );
}

/** 1-based poster ordinal of a season among all seasons ever opened. */
export function seasonOrdinalOf(
  seasons: GrowthSeason[],
  seasonId: number | null,
): number {
  if (seasonId === null) return 0;
  const index = seasonTimeline(seasons).findIndex((season) => season.id === seasonId);
  return index < 0 ? 1 : index + 1;
}

export function seasonProgress(
  challenges: GrowthChallenge[],
  seasonId: number,
): SeasonProgress {
  const mine = challenges.filter((challenge) => challenge.seasonId === seasonId);
  return {
    total: mine.length,
    passed: mine.filter((challenge) => challenge.status === "passed").length,
    open: mine.filter((challenge) => challenge.status === "open").length,
  };
}

/** Artifacts that belong to a season: shipped for its challenges or inside its dates. */
export function seasonArtifacts(
  artifacts: GrowthArtifact[],
  challenges: GrowthChallenge[],
  season: GrowthSeason,
): GrowthArtifact[] {
  const challengeIds = new Set(
    challenges.filter((challenge) => challenge.seasonId === season.id).map((c) => c.id),
  );
  return artifacts.filter(
    (artifact) =>
      (artifact.challengeId !== null && challengeIds.has(artifact.challengeId)) ||
      (artifact.createdOn !== null &&
        artifact.createdOn >= season.startDate &&
        artifact.createdOn <= season.endDate),
  );
}

/** URL for an app-managed growth image (season cover or work cover). */
export function growthCoverUrl(name: string): string {
  return `prism-growth-cover://${encodeURIComponent(name)}`;
}

/**
 * New-work date default: keep the work inside the season currently on screen.
 * Without this, adding a work while reviewing a past season would give it
 * today's date and it would vanish from that season's wall.
 */
export function artifactDateForSeason(season: GrowthSeason | null): string {
  const today = dateKey(new Date());
  if (!season) return today;
  if (today < season.startDate) return season.startDate;
  if (today > season.endDate) return season.endDate;
  return today;
}

/**
 * Plain-text blurb for cards and list rows: strips the Markdown syntax readers
 * don't need in a two-line excerpt. Deliberately approximate — the detail view
 * always shows the real rendered body.
 */
export function plainTextExcerpt(source: string, max = 120): string {
  const text = source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

/** A challenge is "待补充" until at least one narrative field is written. */
export function challengeHasContent(challenge: GrowthChallenge): boolean {
  return [
    challenge.description,
    challenge.goal,
    challenge.criteria,
    challenge.reflection,
    challenge.body,
    challenge.resultNote,
  ].some((value) => value.trim() !== "");
}

// ---- Metacognition (P3) ----

/** Monday of the week containing `now`, as a local YYYY-MM-DD key. */
export function weekStartKey(now = Date.now()): string {
  const date = new Date(now);
  const offset = (date.getDay() + 6) % 7;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
  return dateKey(monday);
}

/**
 * Normalised error 0..1. Time uses the log2 ratio (scale free and symmetric:
 * 2× over and 2× under cost the same, 4× costs everything), difficulty and
 * mood use their 4-point span. Every kind weighs the same: a guess is a guess.
 */
export function predictionError(
  kind: GrowthPredictionKind,
  predicted: number,
  actual: number,
): number {
  if (kind === "time") {
    if (predicted <= 0 || actual <= 0) return 1;
    return Math.min(1, Math.abs(Math.log2(actual / predicted)) / 2);
  }
  return Math.min(1, Math.abs(actual - predicted) / 4);
}

/**
 * Mirrors `isGrowthPredictionValue` in `electron/database.ts`: the field flags
 * a value the store would reject instead of letting the save round-trip fail.
 * Time must be positive (zero allowed once settling), difficulty is 1–5, mood
 * is -2–2.
 */
export function isPredictionValue(
  kind: GrowthPredictionKind,
  value: number,
  allowZero = false,
): boolean {
  if (kind === "time") return allowZero ? value >= 0 : value > 0;
  if (kind === "difficulty") return value >= 1 && value <= 5;
  return value >= -2 && value <= 2;
}

/**
 * Input bounds for a kind's value field. Bounded scales clamp on blur; time is
 * open ended and only needs the non-negative floor.
 */
export function predictionBounds(kind: GrowthPredictionKind): { min: number; max?: number } {
  if (kind === "difficulty") return { min: 1, max: 5 };
  if (kind === "mood") return { min: -2, max: 2 };
  return { min: 0 };
}

/** Time is the only kind entered with decimals (minutes). */
export function predictionStep(kind: GrowthPredictionKind): number {
  return kind === "time" ? 0.5 : 1;
}

export interface PredictionDelta {
  /** Kind-appropriate text: a ratio for time, a point gap otherwise. */
  text: string;
  /** Same normalised error the accuracy score averages. */
  error: number;
}

/** One prediction's deviation, written the way its kind reads best. */
export function predictionDelta(
  kind: GrowthPredictionKind,
  predicted: number,
  actual: number,
): PredictionDelta {
  const error = predictionError(kind, predicted, actual);
  if (kind !== "time") {
    const diff = actual - predicted;
    return { text: diff === 0 ? "±0" : `${diff > 0 ? "+" : ""}${diff}`, error };
  }
  if (predicted <= 0 || actual <= 0) return { text: "—", error };
  return { text: `×${(actual / predicted).toFixed(1)}`, error };
}

export interface PredictionBias {
  direction: "under" | "over" | "none";
  count: number;
}

/** A settled row: the forecast has an outcome, so it can score. */
export type SettledPrediction = GrowthPrediction & { actual: number };

/** Pending forecasts (actual === null) never enter accuracy, bias or the trend. */
export function settledPredictions(predictions: GrowthPrediction[]): SettledPrediction[] {
  return predictions.filter((row): row is SettledPrediction => row.actual !== null);
}

/** Last few time predictions: are you consistently slow or consistently early? */
export function predictionBias(predictions: GrowthPrediction[]): PredictionBias {
  const recent = settledPredictions(predictions)
    .filter((row) => row.kind === "time")
    .slice(0, 5);
  let under = 0;
  let over = 0;
  for (const row of recent) {
    if (row.actual > row.predicted * 1.2) under += 1;
    else if (row.actual < row.predicted * 0.8) over += 1;
  }
  if (under >= 3) return { direction: "under", count: under };
  if (over >= 3) return { direction: "over", count: over };
  return { direction: "none", count: Math.max(under, over) };
}

export interface SelfAccuracy {
  /** 0..100; null when there is nothing to measure. */
  score: number | null;
  count: number;
}

const PREDICTION_WINDOW_DAYS = 90;

export function selfAccuracy(predictions: GrowthPrediction[], now = Date.now()): SelfAccuracy {
  const since = now - PREDICTION_WINDOW_DAYS * DAY_MS;
  const mine = settledPredictions(predictions).filter((row) => {
    const at = Date.parse(`${row.predictedOn}T00:00:00`);
    return Number.isFinite(at) && at >= since;
  });
  if (mine.length === 0) return { score: null, count: 0 };
  const mean =
    mine.reduce((total, row) => total + predictionError(row.kind, row.predicted, row.actual), 0) /
    mine.length;
  return { score: Math.round((1 - mean) * 100), count: mine.length };
}

export interface AccuracyPoint {
  /** Week start, local YYYY-MM-DD. */
  date: string;
  score: number | null;
  count: number;
}

/** Weekly accuracy for the last `weeks` weeks, oldest first. */
export function weeklyAccuracy(
  predictions: GrowthPrediction[],
  weeks = 8,
  now = Date.now(),
): AccuracyPoint[] {
  const points: AccuracyPoint[] = [];
  const scored = settledPredictions(predictions);
  for (let offset = weeks - 1; offset >= 0; offset -= 1) {
    const start = weekStartKey(now - offset * 7 * DAY_MS);
    // Use the next Monday as the upper bound instead of +7 days: a DST week is
    // 167 or 169 hours long, and the millisecond bound would drop an hour.
    const next = weekStartKey(now - (offset - 1) * 7 * DAY_MS);
    const startMs = parseDateKey(start)?.getTime();
    const endMs = parseDateKey(next)?.getTime();
    const mine =
      startMs === undefined || endMs === undefined
        ? []
        : scored.filter((row) => {
            const at = Date.parse(`${row.predictedOn}T00:00:00`);
            return Number.isFinite(at) && at >= startMs && at < endMs;
          });
    const score = mine.length === 0
      ? null
      : Math.round(
          (1 -
            mine.reduce((total, row) => total + predictionError(row.kind, row.predicted, row.actual), 0) /
              mine.length) *
            100,
        );
    points.push({ date: start, score, count: mine.length });
  }
  return points;
}

// ---- Chronicle (P4) ----

export interface CurvePoint {
  /** Local YYYY-MM. */
  month: string;
  /** Mean level score of every capability with a snapshot by that month end. */
  score: number | null;
  count: number;
}

/**
 * Month-end "where was I" curve: for each month, take the latest snapshot per
 * capability that existed by then and average the level centres. A capability
 * only joins the average after its first snapshot, so a new one never drags
 * earlier months down.
 */
function monthEndPoints(
  snapshots: GrowthSnapshot[],
  months: Array<{ year: number; month: number }>,
): CurvePoint[] {
  return months.map(({ year, month }) => {
    const monthEndMs = new Date(year, month + 1, 1).getTime();
    const latest = new Map<number, { ms: number; level: number }>();
    for (const snapshot of snapshots) {
      const at = parseSqliteTime(snapshot.takenAt);
      if (at === null || at >= monthEndMs) continue;
      const previous = latest.get(snapshot.capabilityId);
      // The caller's order is not part of the contract: keep the newest row.
      if (!previous || at >= previous.ms) {
        latest.set(snapshot.capabilityId, { ms: at, level: snapshot.level });
      }
    }
    let total = 0;
    for (const entry of latest.values()) total += levelScore(entry.level);
    return {
      month: `${year}-${String(month + 1).padStart(2, "0")}`,
      score: latest.size === 0 ? null : total / latest.size,
      count: latest.size,
    };
  });
}

/** Trailing `months` months ending with the current one. */
export function globalCurve(
  snapshots: GrowthSnapshot[],
  months = 12,
  now = Date.now(),
): CurvePoint[] {
  const today = new Date(now);
  const starts: Array<{ year: number; month: number }> = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const start = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    starts.push({ year: start.getFullYear(), month: start.getMonth() });
  }
  return monthEndPoints(snapshots, starts);
}

/**
 * Calendar year curve, January to December. The current year stops at the
 * current month so future months are not back-filled with today's score.
 */
export function yearCurve(
  snapshots: GrowthSnapshot[],
  year: number,
  now = Date.now(),
): CurvePoint[] {
  const current = new Date(now);
  if (year > current.getFullYear()) return [];
  const lastMonth = current.getFullYear() === year ? current.getMonth() : 11;
  const months: Array<{ year: number; month: number }> = [];
  for (let month = 0; month <= lastMonth; month += 1) months.push({ year, month });
  return monthEndPoints(snapshots, months);
}
