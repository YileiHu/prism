import { useId, useMemo, useState } from "react";
import type { CurvePoint } from "../../lib/growth";
import { useT } from "../../i18n";
import { tagColor, type TagColorKey } from "../../lib/colors";
import { useElementWidth } from "../useElementWidth";
import type { GrowthSeason } from "../../shared/models";

export 
interface Props {
  points: CurvePoint[];
  seasons: GrowthSeason[];
}

const HEIGHT = 196;
// Bottom room is reserved in bands: plot → axis → season band → month labels.
const PAD = { left: 34, right: 10, top: 14, bottom: 58 };
const AXIS_Y = HEIGHT - PAD.bottom + 2;
const BAND_Y = HEIGHT - PAD.bottom + 10;
const LABEL_Y = HEIGHT - 8;

function smoothPath(points: Array<[number, number]>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

/**
 * Twelve-month growth curve: smooth line + soft area, a season colour band under
 * the plot and a dashed reference line. NaN months break the line instead of
 * being drawn as zero.
 */
export default function GrowthCurveChart({ points, seasons }: Props) {
  const TARGET = 60;
  const { t } = useT();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hovered, setHovered] = useState<number | null>(null);
  const gradientId = `curve-fill-${useId().replace(/:/g, "")}`;

  const values = points.map((point) => point.score).filter((value): value is number => value !== null);
  const lo = values.length ? Math.max(0, Math.floor(Math.min(...values) - 6)) : 0;
  const hi = values.length ? Math.min(100, Math.ceil(Math.max(...values) + 6)) : 100;
  const span = Math.max(10, hi - lo);

  const chartWidth = Math.max(240, width || 640);
  const plotWidth = chartWidth - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const step = plotWidth / Math.max(1, points.length);

  const x = (index: number) => PAD.left + (index + 0.5) * step;
  const y = (value: number) => PAD.top + (1 - (value - lo) / span) * plotHeight;
  // Remount the paths when the displayed range changes (e.g. switching years),
  // so the draw animation replays; a same-range data refresh does not.
  const revealKey = `${points[0]?.month ?? "none"}-${points[points.length - 1]?.month ?? "none"}`;

  // Consecutive months with data form one line; gaps are left open.
  const runs = useMemo(() => {
    const result: Array<Array<[number, number]>> = [];
    let current: Array<[number, number]> = [];
    points.forEach((point, index) => {
      if (point.score === null) {
        if (current.length) result.push(current);
        current = [];
        return;
      }
      current.push([x(index), y(point.score)]);
    });
    if (current.length) result.push(current);
    return result;
  }, [points, step, span, lo, hi]);

  const seasonForMonth = (month: string): GrowthSeason | null => {
    const first = `${month}-01`;
    return (
      seasons.find((season) => season.startDate <= first && season.endDate >= first) ?? null
    );
  };

  return (
    <div ref={ref} className="relative w-full select-none">
      <svg
        width={chartWidth}
        height={HEIGHT}
        role="img"
        aria-label={t["growth.chronicle.curve"]}
        onMouseLeave={() => setHovered(null)}
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const dx = event.clientX - box.left - PAD.left;
          const index = Math.min(points.length - 1, Math.max(0, Math.floor(dx / step)));
          setHovered(Number.isFinite(index) ? index : null);
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* season band */}
        {points.map((point, index) => {
          const season = seasonForMonth(point.month);
          if (!season) return null;
          const palette = tagColor(season.theme as TagColorKey);
          const active = hovered === index;
          return (
            <rect
              key={`band-${point.month}`}
              x={x(index) - step / 2 + 1}
              y={BAND_Y}
              width={Math.max(2, step - 2)}
              height={5}
              rx={2.5}
              fill={palette.bar}
              opacity={active ? 0.95 : 0.55}
            />
          );
        })}

        {/* reference line */}
        {TARGET >= lo && TARGET <= hi && (
          <>
            <line
              x1={PAD.left}
              x2={chartWidth - PAD.right}
              y1={y(TARGET)}
              y2={y(TARGET)}
              stroke="rgb(var(--c-line) / 0.9)"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <text x={PAD.left - 6} y={y(TARGET) + 3} textAnchor="end" className="fill-current text-faint" style={{ fontSize: 9 }}>
              {TARGET}
            </text>
          </>
        )}

        {/* area + line per run */}
        {runs.map((run, index) => {
          const line = smoothPath(run);
          const first = run[0];
          const last = run[run.length - 1];
          const area = `${line} L ${last[0].toFixed(2)} ${PAD.top + plotHeight} L ${first[0].toFixed(2)} ${PAD.top + plotHeight} Z`;
          return (
            <g key={`run-${revealKey}-${index}`}>
              <path d={area} fill={`url(#${gradientId})`} className="curve-area" />
              <path
                d={line}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                className="curve-draw"
              />
            </g>
          );
        })}

        {/* dots */}
        {points.map((point, index) =>
          point.score === null ? null : (
            <circle
              key={`dot-${revealKey}-${point.month}`}
              cx={x(index)}
              cy={y(point.score)}
              r={hovered === index ? 3.6 : 2.4}
              fill="var(--accent)"
              stroke="rgb(var(--c-surface))"
              strokeWidth={1.2}
              className="curve-dot"
              style={{ animationDelay: `${520 + index * 30}ms` }}
            />
          ),
        )}

        {/* baseline + month labels */}
        <line
          x1={PAD.left}
          x2={chartWidth - PAD.right}
          y1={AXIS_Y}
          y2={AXIS_Y}
          stroke="rgb(var(--c-line) / 0.7)"
          strokeWidth={1}
        />
        {points.map((point, index) => (
          <text
            key={`label-${point.month}`}
            x={x(index)}
            y={LABEL_Y}
            textAnchor="middle"
            className={`fill-current ${hovered === index ? "text-secondary" : "text-faint"}`}
            style={{ fontSize: 9.5 }}
          >
            {point.month.slice(5)}
          </text>
        ))}

        {/* range labels */}
        <text x={PAD.left - 6} y={y(hi) + 3} textAnchor="end" className="fill-current text-faint" style={{ fontSize: 9 }}>
          {Math.round(hi)}
        </text>
        <text x={PAD.left - 6} y={y(lo) + 3} textAnchor="end" className="fill-current text-faint" style={{ fontSize: 9 }}>
          {Math.round(lo)}
        </text>
      </svg>

      {hovered !== null && points[hovered] && (
        <div
          className="pointer-events-none absolute z-10 max-w-[190px] whitespace-nowrap rounded-control border border-strong/60 bg-surface px-2 py-1 text-caption shadow-popover"
          style={{
            // Keep the tooltip inside the plot: clamp its centre by half of
            // the max width so the first/last month does not overflow.
            left: Math.min(Math.max(x(hovered), 95), Math.max(95, chartWidth - 95)) / chartWidth * 100 + "%",
            top: `${(y(points[hovered].score ?? lo) / HEIGHT) * 100}%`,
            transform: "translate(-50%, -130%)",
          }}
        >
          <span className="text-primary">{points[hovered].month}</span>
          <span className="ml-1.5 tabular-nums text-secondary">
            {points[hovered].score === null
              ? t["growth.radar.noData"]
              : Math.round(points[hovered].score as number)}
          </span>
          {seasonForMonth(points[hovered].month) && (
            <span className="ml-1.5 max-w-[140px] truncate text-faint">
              {seasonForMonth(points[hovered].month)!.title}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
