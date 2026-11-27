import { useMemo, useState } from "react";
import { useT } from "../../i18n";
import { useAnimatedValues } from "../../lib/useAnimatedValues";
import { useElementSize } from "../useElementSize";
import { levelGrade, scoreLevel } from "../../lib/growth";
import { gradeColor } from "../../lib/colors";
import type { GrowthStatus } from "../../shared/models";

export interface RadarAxis {
  id: number;
  label: string;
  /** 0-100 centre; null when there is nothing to plot. */
  score: number | null;
  /** Half-width of the confidence band on the same scale. */
  band?: number | null;
  /** Optional extra shown in the tooltip (capability count). */
  count?: number;
  /** Per-axis label colour (domains pass their palette colour). */
  color?: string;
  /** Capability status; omitted for domain axes. */
  status?: GrowthStatus;
}

interface Props {
  axes: RadarAxis[];
  /**
   * Size used for the first paint, before `useElementSize` reports the box.
   * Small cards should pass a smaller value so the initial square does not
   * overflow them (a 320px square inside a ~200px card makes the scroll
   * container flash a scrollbar for one frame).
   */
  fallbackSize?: number;
  /** Stroke colour, defaults to the accent token. */
  color?: string;
  /** Tints the label chips (border + text); neutral when omitted. */
  chipColor?: string;
  onAxisClick?: (id: number) => void;
  ariaLabel?: string;
}

const MAX_BOX = 520;
const CHIP_GAP = 4;
/** Lead line between the ring vertex and the chip. */
const CHIP_LEAD = 14;
/** Keep the chip rectangle this far inside the square, so nothing is clipped. */
const CHIP_EDGE_PAD = 2;
/** Shortening stops here: below two characters a label says nothing. */
const MIN_CHIP_CHARS = 2;

function gradePalette(score: number | null) {
  const level = scoreLevel(score);
  if (level === null) return null;
  const grade = levelGrade(level);
  return { grade, ...gradeColor(grade) };
}

/** Capability axes only: domain axes leave `status` undefined. */
function isInactive(axis: RadarAxis | undefined): boolean {
  return axis?.status === "observe" || axis?.status === "archived";
}

function inactiveOpacity(axis: RadarAxis | undefined): number {
  if (axis?.status === "archived") return 0.55;
  if (axis?.status === "observe") return 0.75;
  return 1;
}

function polar(index: number, count: number, radius: number): [number, number] {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

function fractionOf(value: number | null): number {
  return Math.max(0, Math.min(1.25, (value ?? 0) / 100));
}

interface ChipLayout {
  id: number;
  index: number;
  text: string;
  width: number;
  halfExtent: number;
  x: number;
  y: number;
}

/**
 * Single radar used by the overview (six domains) and the capability cards
 * (a domain's capabilities). Chip labels start as the full name, get shortened
 * one character at a time when two chips would overlap, and the polygon radius
 * is derived from the label band so the chips stay inside the square. Without
 * labels the band is freed up and the polygon grows instead.
 */
export default function GrowthRadar({
  axes,
  fallbackSize = 320,
  color = "var(--accent)",
  chipColor,
  onAxisClick,
  ariaLabel,
}: Props) {
  const { t } = useT();
  const [hovered, setHovered] = useState<number | null>(null);
  const [ref, measured] = useElementSize<HTMLDivElement>();
  // Animate [score, band] per axis so the shape morphs instead of jumping.
  const animated = useAnimatedValues(axes.flatMap((axis) => [axis.score ?? 0, axis.band ?? 0]));

  const box = Math.max(
    150,
    Math.min(MAX_BOX, Math.min(measured.width || fallbackSize, measured.height || fallbackSize)),
  );
  const center = box / 2;
  const ringCount = 6;
  const chipFont = box >= 300 ? 12 : box >= 240 ? 11 : 10;
  const chipHeight = chipFont * 1.5 + 11;
  // A short lead line on tiny cards: every pixel of label band counts there.
  const chipLead = box < 240 ? 8 : CHIP_LEAD;
  const labelSignature = axes.map((axis) => `${axis.id}:${axis.label}`).join("|");

  // Chips first, then the radius they need. The polygon used to be a fixed
  // fraction of the square, which only worked while the card was wider than
  // the square — in a narrow window the labels spilled out of the card.
  const { radius, chips } = useMemo<{ radius: number; chips: ChipLayout[] }>(() => {
    // Without chips the label band is free: keep 20px for the vertex dot's halo
    // and the grade letter above it, hand the rest to the polygon.
    const baseRadius = box * (box < 240 ? 0.32 : 0.38);
    // Floor: below this the rings and the dots collapse into each other.
    const minRadius = Math.max(16, box * 0.12);
    if (axes.length < 3) return { radius: baseRadius, chips: [] };

    const items = axes.map((axis, index) => ({
      id: axis.id,
      index,
      full: [...axis.label],
      chars: [...axis.label],
      angle: -Math.PI / 2 + (index * 2 * Math.PI) / axes.length,
    }));

    const measureWidth = (chars: string[], truncated: boolean) =>
      chars.reduce(
        (sum, char) => sum + ((char.codePointAt(0) ?? 0) >= 0x2e80 ? chipFont : chipFont * 0.56),
        0,
      ) +
      chipFont * 1.5 +
      (truncated ? chipFont : 0);

    const layout = (radiusNow: number): ChipLayout[] =>
      items.map((item) => {
        const truncated = item.chars.length < item.full.length;
        const width = measureWidth(item.chars, truncated);
        const halfExtent =
          (width / 2) * Math.abs(Math.cos(item.angle)) +
          (chipHeight / 2) * Math.abs(Math.sin(item.angle));
        const distance = radiusNow + chipLead + halfExtent;
        return {
          id: item.id,
          index: item.index,
          text: item.chars.join("") + (truncated ? "…" : ""),
          width,
          halfExtent,
          x: center + distance * Math.cos(item.angle),
          y: center + distance * Math.sin(item.angle),
        };
      });

    /** Worst chip↔chip collision whose longer side can still lose a character.
     *  Taking the first collision instead can keep trimming a pair that is
     *  already at the floor while a worse pair stays overlapped. */
    const worstShortenableCollision = (boxes: ChipLayout[]): number | null => {
      let target: number | null = null;
      let worst = 0;
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i];
          const b = boxes[j];
          const overlapX = (a.width + b.width) / 2 + CHIP_GAP - Math.abs(a.x - b.x);
          const overlapY = chipHeight + CHIP_GAP - Math.abs(a.y - b.y);
          if (overlapX <= 0 || overlapY <= 0) continue;
          const longer = items[a.index].chars.length >= items[b.index].chars.length ? a.index : b.index;
          if (items[longer].chars.length <= MIN_CHIP_CHARS) continue;
          const score = Math.min(overlapX, overlapY);
          if (score > worst) {
            worst = score;
            target = longer;
          }
        }
      }
      return target;
    };

    // Sub-pixel slack: the fit solve below stops once it is within half a pixel,
    // so an exact comparison would report a chip 0.2px past the edge as "out".
    const insideBox = (chip: ChipLayout) =>
      Math.abs(chip.x - center) + chip.width / 2 <= center - CHIP_EDGE_PAD + 0.5 &&
      Math.abs(chip.y - center) + chipHeight / 2 <= center - CHIP_EDGE_PAD + 0.5;

    /** Largest radius that keeps every chip rectangle inside the square.
     *  Chip offsets are linear in the radius, so this is an exact solve. */
    const radiusThatFits = (boxes: ChipLayout[]): number => {
      let limit = baseRadius;
      for (const chip of boxes) {
        const { angle } = items[chip.index];
        const cos = Math.abs(Math.cos(angle));
        const sin = Math.abs(Math.sin(angle));
        if (cos > 1e-6) {
          limit = Math.min(
            limit,
            (center - CHIP_EDGE_PAD - chip.width / 2) / cos - chipLead - chip.halfExtent,
          );
        }
        if (sin > 1e-6) {
          limit = Math.min(
            limit,
            (center - CHIP_EDGE_PAD - chipHeight / 2) / sin - chipLead - chip.halfExtent,
          );
        }
      }
      return limit;
    };

    const shorten = (target: number): boolean => {
      if (items[target].chars.length <= MIN_CHIP_CHARS) return false;
      items[target].chars.pop();
      return true;
    };

    let radiusNow = baseRadius;
    let guard = 0;
    while (guard < 96) {
      guard += 1;
      const boxes = layout(radiusNow);
      // Resolve collisions before touching the radius: a collision never gets
      // better by shrinking the chart, only the labels can give way.
      const collision = worstShortenableCollision(boxes);
      if (collision !== null) {
        shorten(collision);
        continue;
      }
      const fittedRaw = radiusThatFits(boxes);
      const fitted = Number.isFinite(fittedRaw)
        ? Math.max(minRadius, Math.min(baseRadius, fittedRaw))
        : baseRadius;
      if (Math.abs(fitted - radiusNow) > 0.5) {
        radiusNow = fitted;
        continue;
      }
      // Settled at the smallest allowed radius and something still hangs out of
      // the square: only cutting the label can help now. Try every offender,
      // not just the first — its neighbour may already be at the floor.
      let trimmed = false;
      for (const chip of boxes) {
        if (insideBox(chip)) continue;
        if (shorten(chip.index)) {
          trimmed = true;
          break;
        }
      }
      if (trimmed) continue;
      break;
    }

    return { radius: radiusNow, chips: layout(radiusNow) };
  }, [axes.length, labelSignature, box, center, chipFont, chipHeight]);

  if (axes.length < 3) return null;

  const animatedAxes = axes.map((axis, index) => ({
    ...axis,
    score: animated[index * 2] ?? 0,
    band: animated[index * 2 + 1] ?? 0,
  }));

  const points = (pick: (axis: RadarAxis) => number): string =>
    animatedAxes
      .map((axis, index) =>
        polar(index, axes.length, radius * fractionOf(pick(axis)))
          .map((n) => (n + center).toFixed(1))
          .join(","),
      )
      .join(" ");

  const hoveredAxis = hovered === null ? null : axes[hovered];
  const hoveredPalette = hoveredAxis ? gradePalette(hoveredAxis.score) : null;
  const hoveredStatusLabel =
    hoveredAxis?.status === "observe"
      ? t["growth.status.observe"]
      : hoveredAxis?.status === "archived"
        ? t["growth.status.archived"]
        : null;
  const hoveredPoint =
    hovered === null
      ? null
      : polar(
          hovered,
          axes.length,
          radius * (axes[hovered].score === null ? 1 : fractionOf(animatedAxes[hovered].score)),
        );

  return (
    <div
      ref={ref}
      className="relative flex h-full w-full items-center justify-center"
    >
      <div className="relative" style={{ width: box, height: box }}>
        <svg
          width={box}
          height={box}
          role="img"
          aria-label={ariaLabel ?? t["growth.domainRadar.title"]}
          style={{ overflow: "visible", maxWidth: "100%", height: "auto" }}
          className="mx-auto block"
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const dx = event.clientX - rect.left - center;
            const dy = event.clientY - rect.top - center;
            const step = (2 * Math.PI) / axes.length;
            const raw = Math.round((Math.atan2(dy, dx) + Math.PI / 2) / step);
            setHovered(((raw % axes.length) + axes.length) % axes.length);
          }}
          onMouseLeave={() => setHovered(null)}
        >
          {Array.from({ length: ringCount }, (_, index) => (index + 1) / ringCount).map((fraction, index) => {
            const outer = index === ringCount - 1;
            return (
              <polygon
                key={`ring-${fraction}`}
                points={axes
                  .map((_, axisIndex) =>
                    polar(axisIndex, axes.length, radius * fraction)
                      .map((n) => (n + center).toFixed(1))
                      .join(","),
                  )
                  .join(" ")}
                fill="none"
                stroke={`rgb(var(--c-line) / ${outer ? 0.6 : 0.4})`}
                strokeWidth={outer ? 1.3 : 0.9}
              />
            );
          })}

          {axes.map((axis, index) => {
            const [x, y] = polar(index, axes.length, radius);
            const palette = gradePalette(axis.score);
            const inactive = isInactive(axis);
            return (
              <line
                key={`axis-${axis.id}`}
                x1={center}
                y1={center}
                x2={center + x}
                y2={center + y}
                stroke={palette?.bar ?? "rgb(var(--c-line) / 0.35)"}
                strokeOpacity={inactive ? 0.22 : palette ? 0.34 : 1}
                strokeWidth={palette ? 1.2 : 1}
                strokeDasharray={inactive ? "3 3" : undefined}
              />
            );
          })}

          {chips.map((chip) => {
            const dirX = Math.cos(-Math.PI / 2 + (chip.index * 2 * Math.PI) / axes.length);
            const dirY = Math.sin(-Math.PI / 2 + (chip.index * 2 * Math.PI) / axes.length);
            const startX = center + radius * dirX;
            const startY = center + radius * dirY;
            const endX = chip.x - (chip.halfExtent + 2) * dirX;
            const endY = chip.y - (chip.halfExtent + 2) * dirY;
            const palette = gradePalette(axes[chip.index]?.score ?? null);
            const inactive = isInactive(axes[chip.index]);
            const leaderColor =
              palette?.bar ?? axes[chip.index]?.color ?? chipColor ?? "var(--accent)";
            return (
              <line
                key={`leader-${chip.id}`}
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke={hovered === chip.index || palette ? leaderColor : "rgb(var(--c-line) / 0.7)"}
                strokeOpacity={
                  hovered === chip.index ? 0.95 : palette ? (inactive ? 0.22 : 0.4) : 1
                }
                strokeWidth={hovered === chip.index ? 1.6 : 1.2}
                strokeDasharray={inactive ? "3 3" : undefined}
              />
            );
          })}
          <polygon
            points={points((axis) => (axis.score ?? 0) + (axis.band ?? 0))}
            fill="var(--emphasis-line)"
            fillOpacity={0.08}
            stroke="var(--emphasis-line)"
            strokeOpacity={0.55}
            strokeWidth={1.4}
            strokeDasharray="3 3"
          />
          <polygon
            points={points((axis) => axis.score ?? 0)}
            fill={color}
            fillOpacity={0.22}
            stroke={color}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />

          {animatedAxes.map((axis, index) => {
            if (!axes[index].score) return null;
            const [x, y] = polar(index, axes.length, radius * fractionOf(axis.score));
            const palette = gradePalette(axes[index].score);
            if (!palette) return null;
            const active = hovered === index;
            const inactive = isInactive(axes[index]);
            const opacity = inactive ? (active ? 0.9 : inactiveOpacity(axes[index])) : 1;
            return (
              <g key={`dot-${axis.id}`} opacity={opacity}>
                <circle cx={center + x} cy={center + y} r={12} fill="transparent" />
                {inactive ? (
                  <circle
                    cx={center + x}
                    cy={center + y}
                    r={active ? 5.6 : 4.6}
                    fill="rgb(var(--c-surface))"
                    stroke={palette.name}
                    strokeWidth={1.4}
                    strokeOpacity={0.8}
                    className={onAxisClick ? "cursor-pointer" : "cursor-default"}
                    onClick={() => onAxisClick?.(axis.id)}
                  />
                ) : (
                  <>
                    <circle
                      cx={center + x}
                      cy={center + y}
                      r={active ? 10 : 8.5}
                      fill={palette.bar}
                      fillOpacity={active ? 0.22 : 0.12}
                    />
                    <circle
                      cx={center + x}
                      cy={center + y}
                      r={active ? 5.2 : 4}
                      fill={palette.bar}
                      stroke={palette.name}
                      strokeWidth={1.2}
                      className={onAxisClick ? "cursor-pointer" : "cursor-default"}
                      onClick={() => onAxisClick?.(axis.id)}
                    />
                    <circle
                      cx={center + x}
                      cy={center + y}
                      r={active ? 7.4 : 6.2}
                      fill="none"
                      stroke={palette.name}
                      strokeOpacity={active ? 0.7 : 0.42}
                      strokeWidth={1}
                    />
                  </>
                )}
                <text
                  x={center + x}
                  y={center + y - 10}
                  textAnchor="middle"
                  fill={palette.name}
                  stroke="rgb(var(--c-surface))"
                  strokeWidth={2.4}
                  paintOrder="stroke"
                  style={{ fontSize: Math.max(9, chipFont - 1), fontWeight: 700 }}
                >
                  {palette.grade}
                </text>
              </g>
            );
          })}
        </svg>

        {chips.map((chip) => {
          const axis = axes[chip.index];
          const axisColor = axis?.color ?? chipColor;
          const inactive = isInactive(axis);
          const baseOpacity = inactiveOpacity(axis);
          const activeTint =
            axis?.status === "active" && axisColor
              ? `color-mix(in srgb, ${axisColor} ${
                  hovered === chip.index ? 20 : 10
                }%, transparent)`
              : undefined;
          const statusLabel =
            axis?.status === "observe"
              ? t["growth.status.observe"]
              : axis?.status === "archived"
                ? t["growth.status.archived"]
                : undefined;
          return (
            <span
              key={`chip-${chip.id}`}
              onMouseEnter={() => setHovered(chip.index)}
              onMouseLeave={() => setHovered(null)}
              title={statusLabel}
              className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-default whitespace-nowrap rounded-chip border px-2 py-1 leading-none transition-colors ${
                hovered === chip.index ? "bg-elevated" : "bg-surface"
              } ${inactive ? "border-dashed" : ""} ${
                axisColor ? "" : "border-strong/40 text-secondary"
              }`}
              style={{
                left: `${(chip.x / box) * 100}%`,
                top: `${(chip.y / box) * 100}%`,
                fontSize: chipFont,
                ...(axisColor ? { borderColor: axisColor, color: axisColor } : {}),
                ...(activeTint ? { backgroundColor: activeTint } : {}),
                opacity:
                  hovered === chip.index
                    ? 1
                    : hovered === null
                      ? baseOpacity
                      : Math.min(baseOpacity, 0.55),
              }}
            >
              {chip.text}
            </span>
          );
        })}

        {hoveredAxis && hoveredPoint && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-control border border-strong/60 bg-surface px-2 py-1 text-caption shadow-popover"
            style={{
              left: `${((center + hoveredPoint[0]) / box) * 100}%`,
              top: `${((center + hoveredPoint[1]) / box) * 100}%`,
              transform: "translate(-50%, -130%)",
            }}
          >
            <span className="max-w-[180px] truncate text-primary">{hoveredAxis.label}</span>
            {hoveredPalette && (
              <span
                className="ml-1.5 font-semibold"
                style={{ color: hoveredPalette.name }}
              >
                {hoveredPalette.grade}
              </span>
            )}
            {hoveredStatusLabel && (
              <span className="ml-1.5 text-faint">{hoveredStatusLabel}</span>
            )}
            <span className="ml-1.5 tabular-nums text-secondary">
              {hoveredAxis.score === null
                ? t["growth.radar.noData"]
                : `${Math.round(hoveredAxis.score)}${
                    hoveredAxis.band === null || hoveredAxis.band === undefined ? "" : ` ±${hoveredAxis.band}`
                  }`}
            </span>
            {hoveredAxis.count !== undefined && (
              <span className="ml-1.5 text-faint">
                {hoveredAxis.count} {t["growth.unit.items"]}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
