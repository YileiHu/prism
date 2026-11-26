import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../i18n";
import { useElementSize } from "../useElementSize";
import { useAnimatedValues } from "../../lib/useAnimatedValues";
import { tagColor } from "../../lib/colors";
import { predictionDelta, predictionError, settledPredictions } from "../../lib/growth";
import type { GrowthPrediction, GrowthPredictionKind } from "../../shared/models";
import { PREDICTION_KIND_COLORS, PREDICTION_KIND_KEYS } from "./labels";

interface Props {
  predictions: GrowthPrediction[];
}

const PAD = { left: 38, right: 14, top: 18, bottom: 26 };
const KINDS: GrowthPredictionKind[] = ["time", "difficulty", "mood"];

/**
 * Every settled prediction as one bar: x is the date, height is the normalised
 * error, colour is the kind, and the dashed line is the 90-day mean. One chart
 * for "when was I off, at what, and is it getting better".
 */
export default function GrowthErrorChart({ predictions }: Props) {
  const { t } = useT();
  const [ref, box] = useElementSize<HTMLDivElement>();
  const [hovered, setHovered] = useState<number | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [tipSize, setTipSize] = useState({ width: 0, height: 0 });

  const rows = useMemo(
    () =>
      settledPredictions(predictions)
        .slice()
        .sort((a, b) =>
          a.predictedOn === b.predictedOn
            ? a.id - b.id
            : a.predictedOn < b.predictedOn
              ? -1
              : 1,
        ),
    [predictions],
  );
  const errors = useMemo(
    () => rows.map((row) => predictionError(row.kind, row.predicted, row.actual)),
    [rows],
  );
  const mean = useMemo(
    () => (errors.length === 0 ? 0 : errors.reduce((total, error) => total + error, 0) / errors.length),
    [errors],
  );
  // Hooks stay above the early return: bars grow from zero and keep animating
  // when a settled prediction is added or corrected.
  const animated = useAnimatedValues(errors);
  const [animatedMean] = useAnimatedValues([mean]);
  // Measure the tooltip so it can be clamped inside the chart instead of
  // spilling past the right edge (which also caused a horizontal scrollbar).
  useLayoutEffect(() => {
    const element = tipRef.current;
    if (!element) return;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    setTipSize((previous) =>
      previous.width === width && previous.height === height ? previous : { width, height },
    );
  }, [hovered, rows.length]);

  if (rows.length < 3) {
    return <p className="mt-3 text-caption text-faint">{t["growth.errorChart.empty"]}</p>;
  }

  const chartWidth = Math.max(240, box.width || 560);
  const chartHeight = Math.max(200, box.height);
  const plotWidth = chartWidth - PAD.left - PAD.right;
  const plotHeight = chartHeight - PAD.top - PAD.bottom;
  const slot = plotWidth / rows.length;
  const barWidth = Math.max(3, Math.min(26, slot * 0.62));
  const x = (index: number) => PAD.left + (index + 0.5) * slot;
  const y = (error: number) => PAD.top + (1 - error) * plotHeight;
  const tickEvery = Math.max(1, Math.ceil(rows.length / 7));

  // Keep the tooltip fully inside the measured box: centre it over the bar,
  // then clamp both axes so it never spills out (no clipped text, no scrollbar).
  const tipLeft =
    hovered === null
      ? 0
      : Math.min(
          Math.max(6, x(hovered) - tipSize.width / 2),
          Math.max(6, chartWidth - tipSize.width - 6),
        );
  const tipTop =
    hovered === null
      ? 0
      : Math.max(
          4,
          Math.min(
            chartHeight - tipSize.height - 4,
            y(animated[hovered] ?? 0) - tipSize.height - 8,
          ),
        );

  return (
    <div className="flex h-full w-full flex-col">
      <div ref={ref} className="relative min-h-0 w-full flex-1">
        <svg
          width={chartWidth}
          height={chartHeight}
          role="img"
          aria-label={t["growth.errorChart.title"]}
          onMouseLeave={() => setHovered(null)}
        >
          {[0, 0.5, 1].map((value) => (
            <g key={value}>
              <line
                x1={PAD.left}
                x2={chartWidth - PAD.right}
                y1={y(value)}
                y2={y(value)}
                stroke="rgb(var(--c-line) / 0.7)"
                strokeWidth={1}
                strokeDasharray={value === 0 ? undefined : "3 3"}
              />
              <text
                x={PAD.left - 6}
                y={y(value) + 3}
                textAnchor="end"
                className="fill-current text-faint"
                style={{ fontSize: 9 }}
              >
                {Math.round(value * 100)}%
              </text>
            </g>
          ))}

          {rows.map((row, index) => {
            const active = hovered === index;
            const top = y(animated[index] ?? 0);
            return (
              <g key={row.id} onMouseEnter={() => setHovered(index)}>
                <rect
                  x={PAD.left + index * slot}
                  y={PAD.top}
                  width={slot}
                  height={plotHeight}
                  fill="transparent"
                />
                <rect
                  x={x(index) - barWidth / 2}
                  y={top}
                  width={barWidth}
                  height={Math.max(2, PAD.top + plotHeight - top)}
                  rx={2}
                  fill={tagColor(PREDICTION_KIND_COLORS[row.kind]).bar}
                  className="transition-opacity duration-150 motion-reduce:transition-none"
                  style={{ opacity: hovered === null || active ? 0.95 : 0.35 }}
                />
              </g>
            );
          })}

          <line
            x1={PAD.left}
            x2={chartWidth - PAD.right}
            y1={y(animatedMean)}
            y2={y(animatedMean)}
            stroke="var(--accent)"
            strokeWidth={1.2}
            strokeDasharray="5 3"
            opacity={0.9}
          />
          <text
            x={chartWidth - PAD.right}
            y={y(animatedMean) - 5}
            textAnchor="end"
            style={{ fontSize: 9, fill: "var(--accent-text)" }}
          >
            {t["growth.errorChart.mean"].replace("{value}", String(Math.round(mean * 100)))}
          </text>

          {rows.map((row, index) =>
            index % tickEvery === 0 || index === rows.length - 1 ? (
              <text
                key={`label-${row.id}`}
                x={x(index)}
                y={chartHeight - 8}
                textAnchor="middle"
                className="fill-current text-faint"
                style={{ fontSize: 9 }}
              >
                {row.predictedOn.slice(5)}
              </text>
            ) : null,
          )}
        </svg>

        {hovered !== null && rows[hovered] && (
          <div
            ref={tipRef}
            className="pointer-events-none absolute z-10 rounded-control border border-strong/60 bg-surface px-2 py-1 text-caption shadow-popover"
            style={{
              left: tipLeft,
              top: tipTop,
              maxWidth: Math.max(160, chartWidth - 12),
            }}
          >
            <span className="text-faint">{t[PREDICTION_KIND_KEYS[rows[hovered].kind]]}</span>
            <span className="ml-1.5 max-w-[160px] truncate text-primary">
              {rows[hovered].subject}
            </span>
            <span className="ml-1.5 tabular-nums text-secondary">
              {rows[hovered].predicted} → {rows[hovered].actual}
            </span>
            <span className="ml-1.5 tabular-nums text-faint">
              {predictionDelta(rows[hovered].kind, rows[hovered].predicted, rows[hovered].actual).text}
            </span>
            <span className="ml-1.5 text-faint">{rows[hovered].predictedOn}</span>
          </div>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-3 text-caption text-faint">
        {KINDS.map((kind) => (
          <span key={kind} className="flex items-center gap-1">
            <span
              className="h-2 w-2 rounded-chip"
              style={{ backgroundColor: tagColor(PREDICTION_KIND_COLORS[kind]).bar }}
            />
            {t[PREDICTION_KIND_KEYS[kind]]}
          </span>
        ))}
      </div>
      <p className="mt-0.5 text-caption text-faint">{t["growth.errorChart.hint"]}</p>
    </div>
  );
}
