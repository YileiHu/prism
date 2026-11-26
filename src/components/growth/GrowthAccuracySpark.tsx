import { useT } from "../../i18n";
import { useElementWidth } from "../useElementWidth";
import type { AccuracyPoint } from "../../lib/growth";


interface Props {
  points: AccuracyPoint[];
}

const HEIGHT = 72;
const PAD = { left: 4, right: 4, top: 8, bottom: 18 };

/** Eight-week accuracy trend: one soft line, gaps for weeks without data. */
export default function GrowthAccuracySpark({ points }: Props) {
  const { t } = useT();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const chartWidth = Math.max(220, width || 480);
  const plotWidth = chartWidth - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const step = plotWidth / Math.max(1, points.length);
  const x = (index: number) => PAD.left + (index + 0.5) * step;
  const y = (score: number) => PAD.top + (1 - score / 100) * plotHeight;

  const runs: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  points.forEach((point, index) => {
    if (point.score === null) {
      if (current.length) runs.push(current);
      current = [];
      return;
    }
    current.push([x(index), y(point.score)]);
  });
  if (current.length) runs.push(current);

  return (
    <div ref={ref} className="mt-2 w-full select-none">
      <svg
        width={chartWidth}
        height={HEIGHT}
        role="img"
        aria-label={t["growth.accuracyWeeks"]}
      >
        <line
          x1={PAD.left}
          x2={chartWidth - PAD.right}
          y1={y(80)}
          y2={y(80)}
          stroke="rgb(var(--c-line) / 0.9)"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
        {runs.map((run, index) => (
          <polyline
            key={`run-${index}`}
            points={run.map(([px, py]) => `${px},${py}`).join(" ")}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            className="growth-draw"
          />
        ))}
        {points.map((point, index) =>
          point.score === null ? null : (
            <circle
              key={`dot-${point.date}`}
              cx={x(index)}
              cy={y(point.score)}
              r={2.4}
              fill="var(--accent)"
              className="growth-fade"
            />
          ),
        )}
        {points.map((point, index) => (
          <text
            key={`label-${point.date}`}
            x={x(index)}
            y={HEIGHT - 5}
            textAnchor="middle"
            className="fill-current text-faint"
            style={{ fontSize: 9 }}
          >
            {point.date.slice(5)}
          </text>
        ))}
      </svg>
    </div>
  );
}
