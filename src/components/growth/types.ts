export type GrowthViewKey = "capabilities" | "challenges" | "self" | "chronicle";

/** Sub-sections of 元认知, switched from the sidebar instead of the toolbar. */
export type GrowthSelfViewKey = "accuracy" | "manual" | "feedback";

/** Prefill for a new work, e.g. opened from a challenge or a capability. */
export interface GrowthArtifactDefaults {
  capabilityId?: number | null;
  challengeId?: number | null;
  /** Local calendar date (YYYY-MM-DD); clamped to the season on the board. */
  createdOn?: string;
}

/** Prefill for a new task, e.g. opened from a challenge or a capability. */
export interface GrowthTaskDefaults {
  capabilityId?: number | null;
  challengeId?: number | null;
}

/**
 * Context a forecast is created from: the capability it measures, and at most
 * one parent object (challenge or task) that supplies the subject line.
 */
export interface GrowthPredictionLink {
  capabilityId: number | null;
  challenge?: { id: number; title: string } | null;
  task?: { id: number; title: string } | null;
  /** Prefills the subject when the forecast is opened from an object. */
  subject?: string;
}
