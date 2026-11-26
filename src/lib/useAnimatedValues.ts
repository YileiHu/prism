import { useEffect, useRef, useState } from "react";

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * Interpolates a numeric vector towards `target` with requestAnimationFrame and
 * an ease-out curve. Kept dependency-free on purpose: the module only needs a
 * handful of small vector animations (radar shape, bars), and importing the d3
 * packages that happen to be installed would rely on transitive dependencies.
 *
 * The first mount animates from zero, so a chart grows into place. Later target
 * changes continue from the current frame instead of snapping.
 */
export function useAnimatedValues(target: number[], duration = 420): number[] {
  const reduced = prefersReducedMotion();
  const [values, setValues] = useState<number[]>(() =>
    reduced ? [...target] : target.map(() => 0),
  );
  const latestRef = useRef(values);
  latestRef.current = values;
  // Captures the target values so the effect only re-runs on an actual change.
  const key = target.join(",");

  useEffect(() => {
    const effective = prefersReducedMotion() ? 0 : duration;
    const from =
      latestRef.current.length === target.length ? latestRef.current : target.map(() => 0);
    const startedAt = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = effective === 0 ? 1 : Math.min(1, (now - startedAt) / effective);
      const eased = easeOutCubic(progress);
      setValues(
        target.map((value, index) => {
          const start = from[index] ?? value;
          return start + (value - start) * eased;
        }),
      );
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // `key` already encodes the target vector.
  }, [key, duration]);

  return values;
}
