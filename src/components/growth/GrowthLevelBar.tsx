import { LEVEL_GRADES, levelGrade, levelIndex } from "../../lib/growth";
import { gradeColor } from "../../lib/colors";

interface Props {
  /** 1..6 */
  level: number;
  /** Half-width of the confidence band; null when unrated. */
  band?: number | null;
  /** Target level; marks its segment with a small diamond. */
  targetLevel?: number | null;
  /** Show the C / SSS endpoints; use in roomy card headers, not list rows. */
  showScale?: boolean;
  /** Row default (112px) or the roomier detail-header ladder (240px). */
  size?: "sm" | "lg";
}

const CHEVRON = "polygon(0 0, 72% 0, 100% 50%, 72% 100%, 0 100%, 28% 50%)";

/**
 * Option C: a six-step rank ladder. Each chevron is one grade, past ranks keep
 * their own colour, the current rank glows with a width driven by confidence,
 * and the target rank carries a small diamond.
 */
export default function GrowthLevelBar({
  level,
  band = null,
  targetLevel = null,
  showScale = false,
  size = "sm",
}: Props) {
  const activeIndex = levelIndex(level);
  const targetIndex = targetLevel === null ? null : levelIndex(targetLevel);
  const grade = levelGrade(level);
  const widthClass = size === "lg" ? "w-60" : "w-28";
  const heightClass = size === "lg" ? "h-4" : "h-3";

  return (
    <span
      className={`flex ${widthClass} max-w-full flex-col gap-0.5`}
      aria-label={`${grade}${band === null ? "" : ` ±${band}`}`}
    >
      <span className={`relative flex ${heightClass} w-full items-center gap-[2px]`}>
        {LEVEL_GRADES.map((segmentGrade, index) => {
          const palette = gradeColor(segmentGrade);
          const passed = index < activeIndex;
          const active = index === activeIndex;
          return (
            <span
              key={segmentGrade}
              className="relative min-w-0 flex-1"
              style={
                active || passed
                  ? {
                      // Follow the chevron's alpha instead of casting a
                      // rectangular box-shadow through its notch.
                      filter: `drop-shadow(0 0 ${active ? 4 : 2}px ${palette.bar}${
                        active ? "88" : "44"
                      })`,
                    }
                  : undefined
              }
            >
              <span
                className={`relative block ${heightClass} w-full`}
                style={{
                  clipPath: CHEVRON,
                  backgroundColor: active || passed ? palette.bar : "rgb(var(--c-elevated))",
                  opacity: active ? 1 : passed ? 0.58 : 0.8,
                  // Lift the current rank above the passed ones without
                  // introducing a second colour into the palette.
                  filter: active ? "brightness(1.22) saturate(1.08)" : undefined,
                }}
              />
              {targetIndex === index && (
                <svg
                  aria-hidden
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className={`pointer-events-none absolute inset-x-0 bottom-0 ${heightClass} w-full overflow-visible`}
                >
                  <path
                    d="M0 0 H72 L100 50 L72 100 H0 L28 50 Z"
                    fill="none"
                    stroke={palette.bar}
                    strokeWidth={1}
                    strokeOpacity={0.55}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
            </span>
          );
        })}
      </span>
      {showScale && (
        <span className="flex justify-between text-meta leading-none text-faint">
          <span>{LEVEL_GRADES[0]}</span>
          <span>{LEVEL_GRADES[LEVEL_GRADES.length - 1]}</span>
        </span>
      )}
    </span>
  );
}
