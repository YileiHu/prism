import type { CanvasNode } from "./model";
import type { NodeMove } from "./graph";

export type AlignMode = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";
export type DistributeMode = "horizontal" | "vertical";

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function bounds(nodes: CanvasNode[]): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x + node.width);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y + node.height);
  }
  return { minX, maxX, minY, maxY };
}

export function alignNodes(nodes: CanvasNode[], mode: AlignMode): NodeMove[] {
  if (nodes.length < 2) return [];
  const { minX, maxX, minY, maxY } = bounds(nodes);
  const moves: NodeMove[] = [];
  for (const node of nodes) {
    let x = node.x;
    let y = node.y;
    switch (mode) {
      case "left":
        x = minX;
        break;
      case "centerX":
        x = (minX + maxX) / 2 - node.width / 2;
        break;
      case "right":
        x = maxX - node.width;
        break;
      case "top":
        y = minY;
        break;
      case "centerY":
        y = (minY + maxY) / 2 - node.height / 2;
        break;
      case "bottom":
        y = maxY - node.height;
        break;
      default:
        break;
    }
    x = Math.round(x);
    y = Math.round(y);
    if (x !== node.x || y !== node.y) moves.push({ id: node.id, x, y });
  }
  return moves;
}

export function distributeNodes(nodes: CanvasNode[], mode: DistributeMode): NodeMove[] {
  if (nodes.length < 3) return [];
  const horizontal = mode === "horizontal";
  const sorted = [...nodes].sort((a, b) => (horizontal
    ? (a.x + a.width / 2) - (b.x + b.width / 2)
    : (a.y + a.height / 2) - (b.y + b.height / 2)));

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const start = horizontal ? first.x : first.y;
  const end = horizontal ? last.x + last.width : last.y + last.height;
  const total = sorted.reduce((sum, node) => sum + (horizontal ? node.width : node.height), 0);
  const gap = (end - start - total) / (sorted.length - 1);

  const moves: NodeMove[] = [];
  let cursor = start;
  for (const node of sorted) {
    const x = horizontal ? Math.round(cursor) : node.x;
    const y = horizontal ? node.y : Math.round(cursor);
    if (x !== node.x || y !== node.y) moves.push({ id: node.id, x, y });
    cursor += (horizontal ? node.width : node.height) + gap;
  }
  return moves;
}
