import { CalendarRange, Check, Plus } from "lucide-react";
import { useT } from "../../i18n";
import { tagColor, type TagColorKey } from "../../lib/colors";
import { parseDateKey } from "../../lib/dates";
import { coverImageStyle } from "../../lib/imageFocus";
import { useHorizontalWheel } from "../../lib/useHorizontalWheel";
import { growthCoverUrl, seasonProgress } from "../../lib/growth";
import { CHALLENGE_STATUS_KEYS } from "./labels";
import type { GrowthChallenge, GrowthSeason } from "../../shared/models";

interface Props {
  season: GrowthSeason;
  /** 1-based ordinal among all seasons, oldest first. */
  ordinal: number;
  challenges: GrowthChallenge[];
  /** Omit both callbacks to render a read-only poster (e.g. on the chronicle). */
  onNewChallenge?: () => void;
  onOpenChallenge?: (challenge: GrowthChallenge) => void;
  /** Collapse the path and outcome until the surrounding `group` is hovered. */
  expandable?: boolean;
}

const DAY = 86_400_000;

function dayMath(season: GrowthSeason) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseDateKey(season.startDate) ?? today;
  const end = parseDateKey(season.endDate) ?? start;
  const total = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY) + 1);
  const rawElapsed = Math.round((today.getTime() - start.getTime()) / DAY) + 1;
  return {
    total,
    elapsed: Math.min(total, Math.max(0, rawElapsed)),
    remaining: Math.max(0, total - rawElapsed),
  };
}

function ProgressRing({
  passed,
  total,
  dark,
  accent,
}: {
  passed: number;
  total: number;
  dark: boolean;
  accent: string;
}) {
  const size = 76;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total === 0 ? 0 : Math.min(1, passed / total);
  return (
    <div className="relative flex h-[76px] w-[76px] flex-shrink-0 items-center justify-center">
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={dark ? "rgb(var(--on-accent) / 0.18)" : "rgb(var(--c-line) / 0.5)"}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * ratio} ${circumference}`}
          style={{ transition: "stroke-dasharray 400ms ease-out" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        <span
          className={`text-body font-semibold tabular-nums ${dark ? "text-[rgb(var(--on-accent))]" : "text-primary"}`}
        >
          {passed}
        </span>
        <span
          className={`text-meta tabular-nums ${dark ? "text-[rgb(var(--on-accent)/0.6)]" : "text-faint"}`}
        >
          / {total}
        </span>
      </div>
    </div>
  );
}

export default function GrowthSeasonPoster({
  season,
  ordinal,
  challenges,
  onNewChallenge,
  onOpenChallenge,
  expandable = false,
}: Props) {
  const { t } = useT();
  const palette = tagColor(season.theme as TagColorKey);
  const progress = seasonProgress(challenges, season.id);
  // The challenge path scrolls sideways with the wheel; the scrollbar stays
  // hidden. The ref is a callback so it survives an empty path turning into a
  // list while the poster stays mounted (switching seasons).
  const pathListRef = useHorizontalWheel<HTMLOListElement>();
  const { total, elapsed, remaining } = dayMath(season);
  const mine = challenges.filter((challenge) => challenge.seasonId === season.id);
  const closed = season.closedAt !== null;
  const coverUrl = season.cover ? growthCoverUrl(season.cover) : null;
  const dark = Boolean(coverUrl);

  // On a photo the poster becomes a dark band built from the theme colour and
  // the app's overlay token, so white text always reads. Without a photo it
  // keeps the light/dark theme gradient. The photo itself is masked so it only
  // appears towards the right, faint at first and clearer at the edge.
  const light = (percent: number) =>
    `color-mix(in srgb, ${palette.bar} ${percent}%, rgb(var(--on-accent)))`;
  const shade = (percent: number) =>
    `color-mix(in srgb, ${palette.bar} ${percent}%, rgb(var(--c-overlay)))`;
  /** Semi-transparent theme fill, so the poster (and photo) shows through a bit. */
  const tint = (percent: number) => `color-mix(in srgb, ${palette.bar} ${percent}%, transparent)`;

  const backgroundStyle = coverUrl
    ? {
        backgroundImage: `linear-gradient(140deg, ${shade(62)} 0%, ${shade(30)} 55%, rgb(var(--c-overlay)) 100%)`,
        backgroundColor: "rgb(var(--c-overlay))",
      }
    : {
        backgroundImage: `linear-gradient(135deg, ${palette.bg} 0%, transparent 62%)`,
        backgroundColor: "rgb(var(--c-surface))",
      };

  return (
    <section
      className={`relative overflow-hidden rounded-card p-5 ${dark ? "" : "ring-1 ring-strong/40"}`}
      style={backgroundStyle}
    >
      {coverUrl && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-px"
          style={{
            WebkitMaskImage: "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.15) 38%, black 100%)",
            maskImage: "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.15) 38%, black 100%)",
          }}
        >
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full select-none object-cover opacity-50"
            style={coverImageStyle(season.coverTransform)}
          />
        </span>
      )}

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className="text-meta font-medium uppercase tracking-[0.18em]"
              style={{ color: dark ? light(72) : palette.name }}
            >
              {t["growth.poster.season"].replace("{n}", String(ordinal))}
              {closed ? ` · ${t["growth.poster.closed"]}` : ""}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-caption tabular-nums ${
                dark ? "text-[rgb(var(--on-accent)/0.62)]" : "text-faint"
              }`}
            >
              <CalendarRange size={12} />
              {season.startDate} → {season.endDate}
            </span>
            <span
              className={`text-caption tabular-nums ${
                dark ? "text-[rgb(var(--on-accent)/0.55)]" : "text-faint"
              }`}
            >
              · {t["growth.poster.dayCounter"]
                .replace("{day}", String(elapsed))
                .replace("{total}", String(total))}
            </span>
            <span
              className={`text-caption tabular-nums ${
                dark ? "text-[rgb(var(--on-accent)/0.55)]" : "text-faint"
              }`}
            >
              ·{" "}
              {remaining > 0
                ? t["growth.poster.remaining"].replace("{days}", String(remaining))
                : t["growth.poster.expired"]}
            </span>
          </div>
          <h2
            className={`mt-1 truncate text-[22px] font-semibold leading-tight ${
              dark ? "text-[rgb(var(--on-accent))]" : "text-primary"
            }`}
          >
            {season.title}
          </h2>
          {season.focus && (
            <p
              className={`mt-1 max-w-[46ch] text-caption leading-relaxed ${
                dark ? "text-[rgb(var(--on-accent)/0.78)]" : "text-secondary"
              }`}
            >
              {season.focus}
            </p>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-2">
          <ProgressRing
            passed={progress.passed}
            total={progress.total}
            dark={dark}
            accent={dark ? light(78) : palette.bar}
          />
        </div>
      </div>

      <div
        className={
          expandable
            ? "grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none group-hover:grid-rows-[1fr] group-focus-visible:grid-rows-[1fr]"
            : undefined
        }
      >
        <div className={expandable ? "overflow-hidden" : undefined}>
          <div className="relative mt-4">
        <div className="mb-1.5 flex items-center gap-2">
          <span className={`text-caption ${dark ? "text-[rgb(var(--on-accent)/0.72)]" : "text-muted"}`}>
            {t["growth.poster.path"]}
          </span>
          <span
            className={`text-caption tabular-nums ${dark ? "text-[rgb(var(--on-accent)/0.55)]" : "text-faint"}`}
          >
            {t["growth.seasonProgress"]
              .replace("{passed}", String(progress.passed))
              .replace("{total}", String(progress.total))}
          </span>
          {progress.open > 0 && (
            <span
              className={`text-caption tabular-nums ${dark ? "text-[rgb(var(--on-accent)/0.55)]" : "text-faint"}`}
            >
              · {t["growth.challengeOpenCount"].replace("{count}", String(progress.open))}
            </span>
          )}
        </div>

        {mine.length === 0 ? (
          <p className={`text-caption ${dark ? "text-[rgb(var(--on-accent)/0.55)]" : "text-faint"}`}>
            {t["growth.poster.pathEmpty"]}
          </p>
        ) : (
          <ol
            ref={pathListRef}
            className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-1"
          >
            {mine.map((challenge, index) => {
              const passed = challenge.status === "passed";
              const open = challenge.status === "open";
              const chipStyle = passed
                ? { backgroundColor: palette.bar, color: "rgb(var(--on-accent))" }
                : dark
                  ? { backgroundColor: open ? tint(46) : tint(24) }
                  : undefined;
              const chipBody = (
                <>
                  {passed ? (
                    <Check size={12} className="flex-shrink-0" />
                  ) : (
                    <span
                      className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                      style={{
                        backgroundColor: open
                          ? dark
                            ? light(80)
                            : palette.bar
                          : "transparent",
                      }}
                    />
                  )}
                  <span className="truncate">{challenge.title}</span>
                </>
              );
              const chipTitle = `${challenge.title} · ${t[CHALLENGE_STATUS_KEYS[challenge.status]]}`;
              return (
                <li key={challenge.id} className="flex flex-shrink-0 items-center gap-1">
                  {index > 0 && (
                    <span
                      aria-hidden
                      className="h-px w-4"
                      style={{
                        backgroundColor: passed
                          ? palette.bar
                          : dark
                            ? "rgb(var(--on-accent) / 0.25)"
                            : "rgb(var(--c-line))",
                      }}
                    />
                  )}
                  {onOpenChallenge ? (
                    <button
                      type="button"
                      onClick={() => onOpenChallenge(challenge)}
                      title={chipTitle}
                      className={`flex h-7 max-w-[190px] items-center gap-1.5 rounded-chip border px-2 text-caption transition-colors ${
                        passed
                          ? "border-transparent"
                          : open
                            ? dark
                              ? "border-[rgb(var(--on-accent)/0.22)] text-[rgb(var(--on-accent)/0.9)] hover:brightness-110"
                              : "border-strong/60 text-secondary hover:bg-hover"
                            : dark
                              ? "border-[rgb(var(--on-accent)/0.14)] text-[rgb(var(--on-accent)/0.55)]"
                              : "border-dashed border-strong/50 text-faint"
                      }`}
                      style={chipStyle}
                    >
                      {chipBody}
                    </button>
                  ) : (
                    <span
                      title={chipTitle}
                      className={`flex h-7 max-w-[190px] items-center gap-1.5 rounded-chip border px-2 text-caption ${
                        passed
                          ? "border-transparent"
                          : open
                            ? dark
                              ? "border-[rgb(var(--on-accent)/0.22)] text-[rgb(var(--on-accent)/0.9)]"
                              : "border-strong/60 text-secondary"
                            : dark
                              ? "border-[rgb(var(--on-accent)/0.14)] text-[rgb(var(--on-accent)/0.55)]"
                              : "border-dashed border-strong/50 text-faint"
                      }`}
                      style={chipStyle}
                    >
                      {chipBody}
                    </span>
                  )}
                </li>
              );
            })}
            {onNewChallenge && (
              <li className="flex flex-shrink-0 items-center gap-1">
                <span
                  aria-hidden
                  className="h-px w-4"
                  style={{
                    backgroundColor: dark
                      ? "rgb(var(--on-accent) / 0.25)"
                      : "rgb(var(--c-line))",
                  }}
                />
                <button
                  type="button"
                  title={t["growth.newChallenge"]}
                  aria-label={t["growth.newChallenge"]}
                  onClick={onNewChallenge}
                  className={`flex h-7 w-7 items-center justify-center rounded-full border border-dashed transition-colors ${
                    dark
                      ? "border-[rgb(var(--on-accent)/0.28)] text-[rgb(var(--on-accent)/0.6)] hover:bg-[rgb(var(--on-accent)/0.12)] hover:text-[rgb(var(--on-accent))]"
                      : "border-strong/50 text-faint hover:border-strong hover:bg-hover hover:text-secondary"
                  }`}
                  style={dark ? { backgroundColor: tint(18) } : undefined}
                >
                  <Plus size={12} />
                </button>
              </li>
            )}
          </ol>
        )}
      </div>

      {closed && season.outcome && (
        <div
          className={`relative mt-3 rounded-control border px-3 py-2 ${
            dark
              ? "border-[rgb(var(--on-accent)/0.18)] bg-[rgb(var(--on-accent)/0.08)]"
              : "border-strong/40 bg-surface/60"
          }`}
        >
          <span className={`block text-caption ${dark ? "text-[rgb(var(--on-accent)/0.62)]" : "text-muted"}`}>
            {t["growth.poster.outcome"]}
          </span>
          <p
            className={`mt-1 whitespace-pre-wrap text-caption leading-relaxed ${
              dark ? "text-[rgb(var(--on-accent)/0.85)]" : "text-secondary"
            }`}
          >
            {season.outcome}
          </p>
        </div>
      )}
        </div>
      </div>
    </section>
  );
}
