import type { Translation } from "../../i18n/zh";
import { LEVEL_GRADES } from "../../lib/growth";
import type { TagColorKey } from "../../lib/colors";
import type {
  GrowthArtifactKind,
  GrowthAttribution,
  GrowthChallengeStatus,
  GrowthEvidenceKind,
  GrowthPredictionKind,
  GrowthSelfSection,
} from "../../shared/models";

// Key tables keep the level/confidence copy addressable without string
// concatenation, so a missing translation is a type error.
export const LEVEL_NAME_KEYS = [
  "growth.levelName.1",
  "growth.levelName.2",
  "growth.levelName.3",
  "growth.levelName.4",
  "growth.levelName.5",
  "growth.levelName.6",
] as const satisfies readonly (keyof Translation)[];

export const LEVEL_HINT_KEYS = [
  "growth.levelHint.1",
  "growth.levelHint.2",
  "growth.levelHint.3",
  "growth.levelHint.4",
  "growth.levelHint.5",
  "growth.levelHint.6",
] as const satisfies readonly (keyof Translation)[];

export const CONFIDENCE_NAME_KEYS = [
  "growth.confidenceName.0",
  "growth.confidenceName.1",
  "growth.confidenceName.2",
  "growth.confidenceName.3",
  "growth.confidenceName.4",
  "growth.confidenceName.5",
] as const satisfies readonly (keyof Translation)[];

export const CONFIDENCE_HINT_KEYS = [
  "growth.confidenceHint.0",
  "growth.confidenceHint.1",
  "growth.confidenceHint.2",
  "growth.confidenceHint.3",
  "growth.confidenceHint.4",
  "growth.confidenceHint.5",
] as const satisfies readonly (keyof Translation)[];

/** Star labels for the confidence pickers: ☆ / ★ / ★★ … ★★★★★. */
export const CONFIDENCE_OPTIONS = [
  { value: "0", label: "☆" },
  { value: "1", label: "★" },
  { value: "2", label: "★★" },
  { value: "3", label: "★★★" },
  { value: "4", label: "★★★★" },
  { value: "5", label: "★★★★★" },
] as const;

export const EVIDENCE_KIND_KEYS: Record<GrowthEvidenceKind, keyof Translation> = {
  artifact: "growth.evidenceKind.artifact",
  feedback: "growth.evidenceKind.feedback",
  metric: "growth.evidenceKind.metric",
  usage: "growth.evidenceKind.usage",
};

export const EVIDENCE_KINDS: GrowthEvidenceKind[] = ["artifact", "feedback", "metric", "usage"];

/** Level picker options (1..6, labelled C/B/A/S/SS/SSS). */
export const LEVEL_VALUE_OPTIONS = LEVEL_GRADES.map((grade, index) => ({
  value: String(index + 1),
  label: grade,
}));

export const ARTIFACT_KIND_KEYS: Record<GrowthArtifactKind, keyof Translation> = {
  demo: "growth.artifactKind.demo",
  article: "growth.artifactKind.article",
  repo: "growth.artifactKind.repo",
  doc: "growth.artifactKind.doc",
  other: "growth.artifactKind.other",
};

export const CHALLENGE_STATUS_KEYS: Record<GrowthChallengeStatus, keyof Translation> = {
  open: "growth.challengeStatus.open",
  passed: "growth.challengeStatus.passed",
  failed: "growth.challengeStatus.failed",
  abandoned: "growth.challengeStatus.abandoned",
};

export const ATTRIBUTION_KEYS: Record<GrowthAttribution, keyof Translation> = {
  stats: "growth.attribution.stats",
  buff: "growth.attribution.buff",
};

export const PREDICTION_KIND_KEYS: Record<GrowthPredictionKind, keyof Translation> = {
  time: "growth.predictionKind.time",
  difficulty: "growth.predictionKind.difficulty",
  mood: "growth.predictionKind.mood",
};

/** Kind chips keep one colour per kind, away from the amber warning tone. */
export const PREDICTION_KIND_COLORS: Record<GrowthPredictionKind, TagColorKey> = {
  time: "blue",
  difficulty: "violet",
  mood: "teal",
};

/** Unit copy shown under the value inputs, one per kind. */
export const PREDICTION_UNIT_KEYS: Record<GrowthPredictionKind, keyof Translation> = {
  time: "growth.predictionUnitTime",
  difficulty: "growth.predictionUnitDifficulty",
  mood: "growth.predictionUnitMood",
};

export const SELF_SECTION_KEYS: Record<GrowthSelfSection, keyof Translation> = {
  energy: "growth.self.section.energy",
  motivation: "growth.self.section.motivation",
  procrastination: "growth.self.section.procrastination",
  bias: "growth.self.section.bias",
  learning: "growth.self.section.learning",
  social: "growth.self.section.social",
  values: "growth.self.section.values",
  blindspots: "growth.self.section.blindspots",
};

/** Canonical order of the eight manual sections (matches the stored enum). */
export const SELF_SECTIONS: GrowthSelfSection[] = [
  "energy",
  "motivation",
  "procrastination",
  "bias",
  "learning",
  "social",
  "values",
  "blindspots",
];

/** One palette colour per manual section — the same language as capability domains. */
export const SELF_SECTION_COLORS: Record<GrowthSelfSection, TagColorKey> = {
  energy: "gold",
  motivation: "brick",
  procrastination: "slate",
  bias: "violet",
  learning: "blue",
  social: "pink",
  values: "green",
  blindspots: "teal",
};

export const SELF_SECTION_HINT_KEYS: Record<GrowthSelfSection, keyof Translation> = {
  energy: "growth.self.hint.energy",
  motivation: "growth.self.hint.motivation",
  procrastination: "growth.self.hint.procrastination",
  bias: "growth.self.hint.bias",
  learning: "growth.self.hint.learning",
  social: "growth.self.hint.social",
  values: "growth.self.hint.values",
  blindspots: "growth.self.hint.blindspots",
};
