import { leafName } from "./targets";

export const CANVAS_VERSION = 2;

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 88;
export const MIN_NODE_WIDTH = 120;
export const MIN_NODE_HEIGHT = 44;
export const MAX_NODE_WIDTH = 1200;
export const MAX_NODE_HEIGHT = 1200;

export const TEXT_ALIGNS = ["left", "center", "right"] as const;
export type CanvasTextAlign = (typeof TEXT_ALIGNS)[number];

export const TEXT_VALIGNS = ["top", "middle", "bottom"] as const;
export type CanvasVerticalAlign = (typeof TEXT_VALIGNS)[number];

export const DEFAULT_FONT_SIZE = 14;
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 48;

export const DEFAULT_GROUP_WIDTH = 420;
export const DEFAULT_GROUP_HEIGHT = 280;
export const MIN_GROUP_WIDTH = 160;
export const MIN_GROUP_HEIGHT = 100;
export const MAX_GROUP_WIDTH = 6000;
export const MAX_GROUP_HEIGHT = 6000;

export const DEFAULT_EDGE_LABEL_POSITION = 0.5;
export const MIN_EDGE_LABEL_POSITION = 0.05;
export const MAX_EDGE_LABEL_POSITION = 0.95;

export const EDGE_WIDTHS = [1.5, 2.5, 4] as const;
export type CanvasEdgeWidth = (typeof EDGE_WIDTHS)[number];
export const DEFAULT_EDGE_WIDTH: CanvasEdgeWidth = 1.5;
export const MIN_EDGE_WIDTH = 1;
export const MAX_EDGE_WIDTH = 8;

export const LINE_STYLES = ["solid", "dashed"] as const;
export type CanvasLineStyle = (typeof LINE_STYLES)[number];
export const DEFAULT_LINE_STYLE: CanvasLineStyle = "solid";

export type CanvasTarget =
  | { kind: "note"; path: string; title: string }
  | { kind: "pdf"; repoPath: string; relPath: string; title: string }
  | { kind: "canvas"; path: string; title: string }
  | { kind: "url"; url: string };

export interface CanvasNode {
  id: string;
  text: string;
  notes: string;
  color: string;
  align: CanvasTextAlign;
  valign: CanvasVerticalAlign;
  fontSize: number;
  bold: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  target: CanvasTarget | null;
}

export interface CanvasGroup {
  id: string;
  name: string;
  color: string;
  moveContents: boolean;
  locked: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  color?: string;
  label: string;
  labelPosition: number;
  strokeWidth: number;
  lineStyle: CanvasLineStyle;
}

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasDoc {
  version: 2;
  kind: "canvas";
  viewport: CanvasViewport;
  nodes: CanvasNode[];
  groups: CanvasGroup[];
  edges: CanvasEdge[];
  ink: unknown[];
}

export interface ParseResult {
  doc: CanvasDoc;
  migrated: boolean;
  corrupt: boolean;
}

export function newCanvasId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `n_${cryptoApi.randomUUID().slice(0, 8)}`;
  }
  return `n_${Math.random().toString(36).slice(2, 10)}`;
}

export function newEdgeId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `e_${cryptoApi.randomUUID().slice(0, 8)}`;
  }
  return `e_${Math.random().toString(36).slice(2, 10)}`;
}

export function newGroupId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `g_${cryptoApi.randomUUID().slice(0, 8)}`;
  }
  return `g_${Math.random().toString(36).slice(2, 10)}`;
}

export function createGroup(patch: Partial<CanvasGroup> = {}): CanvasGroup {
  return {
    id: newGroupId(),
    name: "",
    color: "",
    moveContents: true,
    locked: false,
    x: 0,
    y: 0,
    width: DEFAULT_GROUP_WIDTH,
    height: DEFAULT_GROUP_HEIGHT,
    ...patch,
  };
}

export function createNode(patch: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: newCanvasId(),
    text: "",
    notes: "",
    color: "",
    align: "left",
    valign: "top",
    fontSize: DEFAULT_FONT_SIZE,
    bold: false,
    x: 0,
    y: 0,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    target: null,
    ...patch,
  };
}

export function createCanvasDoc(): CanvasDoc {
  return {
    version: CANVAS_VERSION,
    kind: "canvas",
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    groups: [],
    edges: [],
    ink: [],
  };
}

export function cloneCanvas(doc: CanvasDoc): CanvasDoc {
  return {
    ...doc,
    viewport: { ...doc.viewport },
    nodes: doc.nodes.map((node) => ({
      ...node,
      target: node.target ? { ...node.target } : null,
    })),
    groups: doc.groups.map((group) => ({ ...group })),
    edges: doc.edges.map((edge) => ({ ...edge })),
    ink: doc.ink.map((item) => (item && typeof item === "object" ? { ...(item as object) } : item)),
  };
}

export function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function stringOr(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampWidth(value: unknown, fallback = NODE_WIDTH): number {
  return clamp(numberOr(value, fallback), MIN_NODE_WIDTH, MAX_NODE_WIDTH);
}

export function clampHeight(value: unknown, fallback = NODE_HEIGHT): number {
  return clamp(numberOr(value, fallback), MIN_NODE_HEIGHT, MAX_NODE_HEIGHT);
}

export function sanitizeAlign(value: unknown): CanvasTextAlign {
  return (TEXT_ALIGNS as readonly unknown[]).includes(value) ? value as CanvasTextAlign : "left";
}

export function sanitizeVAlign(value: unknown): CanvasVerticalAlign {
  return (TEXT_VALIGNS as readonly unknown[]).includes(value) ? value as CanvasVerticalAlign : "top";
}

export function clampFontSize(value: unknown, fallback = DEFAULT_FONT_SIZE): number {
  return clamp(numberOr(value, fallback), MIN_FONT_SIZE, MAX_FONT_SIZE);
}

export function clampGroupWidth(value: unknown, fallback = DEFAULT_GROUP_WIDTH): number {
  return clamp(numberOr(value, fallback), MIN_GROUP_WIDTH, MAX_GROUP_WIDTH);
}

export function clampGroupHeight(value: unknown, fallback = DEFAULT_GROUP_HEIGHT): number {
  return clamp(numberOr(value, fallback), MIN_GROUP_HEIGHT, MAX_GROUP_HEIGHT);
}

export function sanitizeLabelPosition(value: unknown): number {
  return clamp(
    numberOr(value, DEFAULT_EDGE_LABEL_POSITION),
    MIN_EDGE_LABEL_POSITION,
    MAX_EDGE_LABEL_POSITION,
  );
}

export function sanitizeEdgeWidth(value: unknown): number {
  return clamp(numberOr(value, DEFAULT_EDGE_WIDTH), MIN_EDGE_WIDTH, MAX_EDGE_WIDTH);
}

export function sanitizeLineStyle(value: unknown): CanvasLineStyle {
  return (LINE_STYLES as readonly unknown[]).includes(value) ? value as CanvasLineStyle : DEFAULT_LINE_STYLE;
}

export function sanitizeViewport(value: unknown): CanvasViewport {
  const viewport = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    x: numberOr(viewport.x, 0),
    y: numberOr(viewport.y, 0),
    zoom: clamp(numberOr(viewport.zoom, 1), 0.2, 2.5),
  };
}

export function sanitizeTarget(value: unknown): CanvasTarget | null {
  if (!value || typeof value !== "object") return null;
  const target = value as Record<string, unknown>;
  const title = stringOr(target.title);
  if (target.kind === "note") {
    const path = stringOr(target.path);
    return path ? { kind: "note", path, title } : null;
  }
  if (target.kind === "canvas") {
    const path = stringOr(target.path);
    return path ? { kind: "canvas", path, title } : null;
  }
  if (target.kind === "pdf") {
    const repoPath = stringOr(target.repoPath);
    const relPath = stringOr(target.relPath);
    return repoPath && relPath ? { kind: "pdf", repoPath, relPath, title } : null;
  }
  if (target.kind === "url") {
    const url = stringOr(target.url);
    return url ? { kind: "url", url } : null;
  }
  return null;
}

function sanitizeNode(value: unknown, seen: Set<string>): CanvasNode | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  let id = stringOr(node.id);
  if (!id || seen.has(id)) id = newCanvasId();
  seen.add(id);
  return {
    id,
    text: stringOr(node.text),
    notes: stringOr(node.notes),
    color: stringOr(node.color),
    align: sanitizeAlign(node.align),
    valign: sanitizeVAlign(node.valign),
    fontSize: clampFontSize(node.fontSize),
    bold: node.bold === true,
    x: numberOr(node.x, 0),
    y: numberOr(node.y, 0),
    width: clampWidth(node.width),
    height: clampHeight(node.height),
    target: sanitizeTarget(node.target),
  };
}

function sanitizeGroup(value: unknown, seenIds: Set<string>): CanvasGroup | null {
  if (!value || typeof value !== "object") return null;
  const group = value as Record<string, unknown>;
  let id = stringOr(group.id);
  if (!id || seenIds.has(id)) id = newGroupId();
  seenIds.add(id);
  return {
    id,
    name: stringOr(group.name).slice(0, 80),
    color: stringOr(group.color),
    moveContents: group.moveContents !== false,
    locked: group.locked === true,
    x: numberOr(group.x, 0),
    y: numberOr(group.y, 0),
    width: clampGroupWidth(group.width),
    height: clampGroupHeight(group.height),
  };
}

export function normalizeHandle(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function sanitizeEdge(
  value: unknown,
  nodeIds: Set<string>,
  seenIds: Set<string>,
  seenKeys: Set<string>,
): CanvasEdge | null {
  if (!value || typeof value !== "object") return null;
  const edge = value as Record<string, unknown>;
  const source = stringOr(edge.source);
  const target = stringOr(edge.target);
  if (!source || !target || source === target) return null;
  if (!nodeIds.has(source) || !nodeIds.has(target)) return null;
  // Older migrations stored null handles; pin them to the right/left points so
  // React Flow can always resolve both ends.
  const sourceHandle = normalizeHandle(edge.sourceHandle) ?? "right";
  const targetHandle = normalizeHandle(edge.targetHandle) ?? "left";
  const key = `${source}|${target}|${sourceHandle ?? ""}|${targetHandle ?? ""}`;
  if (seenKeys.has(key)) return null;
  seenKeys.add(key);
  let id = stringOr(edge.id);
  if (!id || seenIds.has(id)) id = newEdgeId();
  seenIds.add(id);
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    color: stringOr(edge.color),
    label: stringOr(edge.label),
    labelPosition: sanitizeLabelPosition(edge.labelPosition),
    strokeWidth: sanitizeEdgeWidth(edge.strokeWidth),
    lineStyle: sanitizeLineStyle(edge.lineStyle),
  };
}

function parseV2(obj: Record<string, unknown>): CanvasDoc {
  const seenIds = new Set<string>();
  const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : [];
  const nodes = rawNodes
    .map((item) => sanitizeNode(item, seenIds))
    .filter((node): node is CanvasNode => node !== null);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const groupSeen = new Set(nodeIds);
  const rawGroups = Array.isArray(obj.groups) ? obj.groups : [];
  const groups = rawGroups
    .map((item) => sanitizeGroup(item, groupSeen))
    .filter((group): group is CanvasGroup => group !== null);
  const edgeIds = new Set<string>();
  const edgeKeys = new Set<string>();
  const rawEdges = Array.isArray(obj.edges) ? obj.edges : [];
  const edges = rawEdges
    .map((item) => sanitizeEdge(item, nodeIds, edgeIds, edgeKeys))
    .filter((edge): edge is CanvasEdge => edge !== null);
  return {
    version: CANVAS_VERSION,
    kind: "canvas",
    viewport: sanitizeViewport(obj.viewport),
    nodes,
    groups,
    edges,
    ink: Array.isArray(obj.ink) ? obj.ink : [],
  };
}

function legacyTarget(type: unknown, notePath: unknown, url: unknown): CanvasTarget | null {
  if (type === "note") {
    const path = stringOr(notePath);
    return path ? { kind: "note", path, title: leafName(path) } : null;
  }
  if (type === "link") {
    const value = stringOr(url);
    return value ? { kind: "url", url: value } : null;
  }
  return null;
}

function migrateV1(obj: Record<string, unknown>): CanvasDoc {
  const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : [];
  const seen = new Set<string>();
  const nodes: CanvasNode[] = [];
  const parentById = new Map<string, string>();

  for (const item of rawNodes) {
    if (!item || typeof item !== "object") continue;
    const value = item as Record<string, unknown>;
    let id = stringOr(value.id);
    if (!id || seen.has(id)) id = newCanvasId();
    seen.add(id);
    nodes.push({
      id,
      text: stringOr(value.text),
      notes: stringOr(value.notes),
      color: stringOr(value.color),
      align: sanitizeAlign(value.align),
      valign: sanitizeVAlign(value.valign),
      fontSize: clampFontSize(value.fontSize),
      bold: value.bold === true,
      x: numberOr(value.x, 0),
      y: numberOr(value.y, 0),
      width: clampWidth(value.width),
      height: clampHeight(value.height),
      target: legacyTarget(value.type, value.notePath, value.url),
    });
    const parentId = stringOr(value.parentId);
    if (parentId) parentById.set(id, parentId);
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edgeIds = new Set<string>();
  const edgeKeys = new Set<string>();
  const edges: CanvasEdge[] = [];
  for (const [id, parentId] of parentById) {
    if (parentId === id || !nodeIds.has(parentId)) continue;
    const key = `${parentId}|${id}|right|left`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    let edgeId = `e_${id}`;
    if (edgeIds.has(edgeId)) edgeId = newEdgeId();
    edgeIds.add(edgeId);
    edges.push({
      id: edgeId,
      source: parentId,
      target: id,
      sourceHandle: "right",
      targetHandle: "left",
      color: "",
      label: "",
      labelPosition: DEFAULT_EDGE_LABEL_POSITION,
      strokeWidth: DEFAULT_EDGE_WIDTH,
      lineStyle: DEFAULT_LINE_STYLE,
    });
  }

  return {
    version: CANVAS_VERSION,
    kind: "canvas",
    viewport: sanitizeViewport(obj.viewport),
    nodes,
    groups: [],
    edges,
    ink: Array.isArray(obj.ink) ? obj.ink : [],
  };
}

function looksLikeV1(obj: Record<string, unknown>, rawNodes: unknown[]): boolean {
  if (obj.version === 1) return true;
  if ("rootId" in obj || "layout" in obj) return true;
  return rawNodes.some((item) =>
    item !== null
    && typeof item === "object"
    && ("parentId" in (item as object) || "order" in (item as object) || "collapsed" in (item as object)));
}

export function parseCanvas(json: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { doc: createCanvasDoc(), migrated: false, corrupt: true };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { doc: createCanvasDoc(), migrated: false, corrupt: true };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.nodes !== undefined && !Array.isArray(obj.nodes)) {
    return { doc: createCanvasDoc(), migrated: false, corrupt: true };
  }
  const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : [];
  if (looksLikeV1(obj, rawNodes)) {
    return { doc: migrateV1(obj), migrated: true, corrupt: false };
  }
  return { doc: parseV2(obj), migrated: false, corrupt: false };
}

function serializeTarget(target: CanvasTarget): Record<string, string> {
  if (target.kind === "url") return { kind: target.kind, url: target.url };
  if (target.kind === "pdf") {
    return { kind: target.kind, repoPath: target.repoPath, relPath: target.relPath, title: target.title };
  }
  return { kind: target.kind, path: target.path, title: target.title };
}

// Stable serialization: fixed key order, two spaces. Keeps diffs small when the
// same board is saved repeatedly.
export function serializeCanvas(doc: CanvasDoc): string {
  return JSON.stringify(
    {
      version: CANVAS_VERSION,
      kind: "canvas",
      viewport: {
        x: doc.viewport.x,
        y: doc.viewport.y,
        zoom: doc.viewport.zoom,
      },
      nodes: doc.nodes.map((node) => ({
        id: node.id,
        text: node.text,
        notes: node.notes,
        color: node.color,
        align: node.align,
        valign: node.valign,
        fontSize: node.fontSize,
        bold: node.bold,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        target: node.target ? serializeTarget(node.target) : null,
      })),
      groups: doc.groups.map((group) => ({
        id: group.id,
        name: group.name,
        color: group.color,
        moveContents: group.moveContents,
        locked: group.locked,
        x: group.x,
        y: group.y,
        width: group.width,
        height: group.height,
      })),
      edges: doc.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? null,
        targetHandle: edge.targetHandle ?? null,
        color: edge.color ?? "",
        label: edge.label,
        labelPosition: edge.labelPosition,
        strokeWidth: edge.strokeWidth,
        lineStyle: edge.lineStyle,
      })),
      ink: doc.ink,
    },
    null,
    2,
  );
}
