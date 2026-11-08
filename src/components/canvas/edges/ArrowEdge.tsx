import { memo, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { DEFAULT_EDGE_WIDTH, type CanvasLineStyle } from "../../../lib/canvas/model";

export interface ArrowEdgeData extends Record<string, unknown> {
  color?: string;
  label: string;
  labelPosition: number;
  strokeWidth: number;
  lineStyle: CanvasLineStyle;
  onMove: (position: number) => void;
  onSelect: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

export type ArrowFlowEdge = Edge<ArrowEdgeData, "arrow">;

const CURVATURE = 0.3;
const SAMPLES = 64;
const DRAG_THRESHOLD = 3;

interface Point {
  x: number;
  y: number;
}

function controlOffset(distance: number): number {
  return distance >= 0 ? 0.5 * distance : CURVATURE * 25 * Math.sqrt(-distance);
}

// Mirrors the control-point math getBezierPath uses so the label lands on the
// same curve it draws.
function controlPoint(pos: Position, x1: number, y1: number, x2: number, y2: number): Point {
  switch (pos) {
    case Position.Left:
      return { x: x1 - controlOffset(x1 - x2), y: y1 };
    case Position.Right:
      return { x: x1 + controlOffset(x2 - x1), y: y1 };
    case Position.Top:
      return { x: x1, y: y1 - controlOffset(y1 - y2) };
    default:
      return { x: x1, y: y1 + controlOffset(y2 - y1) };
  }
}

function bezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function nearestT(p0: Point, p1: Point, p2: Point, p3: Point, pointer: Point): number {
  let best = 0.5;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = i / SAMPLES;
    const point = bezierPoint(p0, p1, p2, p3, t);
    const distance = (point.x - pointer.x) ** 2 + (point.y - pointer.y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = t;
    }
  }
  return best;
}

function ArrowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
  selected,
}: EdgeProps<ArrowFlowEdge>) {
  const { screenToFlowPosition } = useReactFlow();
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: CURVATURE,
  });

  const label = data?.label ?? "";
  const [dragT, setDragT] = useState<number | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const dragTRef = useRef(0.5);

  const start = { x: sourceX, y: sourceY };
  const end = { x: targetX, y: targetY };
  const sourceControl = controlPoint(sourcePosition, sourceX, sourceY, targetX, targetY);
  const targetControl = controlPoint(targetPosition, targetX, targetY, sourceX, sourceY);
  const t = dragT ?? data?.labelPosition ?? 0.5;
  const labelPoint = bezierPoint(start, sourceControl, targetControl, end, t);
  const hasLabel = label.trim() !== "";

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, moved: false };
  };

  const width = data?.strokeWidth ?? DEFAULT_EDGE_WIDTH;
  const dashed = data?.lineStyle === "dashed";
  const chipBackground = data?.color
    ? `color-mix(in srgb, ${data.color} 14%, rgb(var(--c-surface)))`
    : undefined;

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return;
      drag.moved = true;
    }
    const pointer = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const next = nearestT(start, sourceControl, targetControl, end, pointer);
    dragTRef.current = next;
    setDragT(next);
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.moved) {
      data?.onMove(dragTRef.current);
      setDragT(null);
    } else {
      data?.onSelect();
    }
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={16}
        style={{
          stroke: selected ? "var(--accent)" : data?.color || "rgb(var(--c-strong))",
          strokeWidth: selected ? Math.max(width, 2.5) : width,
          strokeDasharray: dashed ? "6 4" : undefined,
        }}
      />
      <EdgeLabelRenderer>
        {hasLabel && (
          <div
            className={`nodrag nopan absolute select-none touch-none rounded-chip border bg-surface px-1.5 py-0.5 text-caption shadow-popover cursor-grab active:cursor-grabbing ${selected ? "border-[var(--accent)] text-primary" : "border-line/60 text-secondary"}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelPoint.x}px, ${labelPoint.y}px)`,
              pointerEvents: "all",
              backgroundColor: chipBackground,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              dragRef.current = null;
              setDragT(null);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              data?.onContextMenu(event);
            }}
            onDragStart={(event) => event.preventDefault()}
          >
            <span className="block max-w-40 truncate">{label}</span>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(ArrowEdge);
