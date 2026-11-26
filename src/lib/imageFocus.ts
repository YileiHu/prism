import type { CSSProperties } from "react";
import type { GrowthCoverTransform } from "../shared/models";

const clampUnit = (value: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

/** Normalises a pan/zoom transform into the 0..1 / 1..3 ranges. */
export function normalizeCoverTransform(
  value: GrowthCoverTransform | null | undefined,
): GrowthCoverTransform {
  if (!value) return { x: 0.5, y: 0.5, scale: 1 };
  return {
    x: clampUnit(Number(value.x), 0.5),
    y: clampUnit(Number(value.y), 0.5),
    scale: Number.isFinite(Number(value.scale))
      ? Math.min(3, Math.max(1, Number(value.scale)))
      : 1,
  };
}

/**
 * Style for a cover image. Zoom keeps the focal point anchored so dragging and
 * zooming feel like cropping the same spot; no transform means centred.
 */
export function coverImageStyle(
  transform: GrowthCoverTransform | null | undefined,
): CSSProperties {
  if (!transform) return { objectPosition: "50% 50%" };
  const { x, y, scale } = normalizeCoverTransform(transform);
  const position = `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`;
  return {
    objectPosition: position,
    transform: `scale(${scale})`,
    transformOrigin: position,
  };
}
