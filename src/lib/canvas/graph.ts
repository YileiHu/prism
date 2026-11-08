import {
  cloneCanvas,
  newCanvasId,
  newEdgeId,
  type CanvasDoc,
  type CanvasEdge,
  type CanvasGroup,
  type CanvasNode,
} from "./model";

export type CanvasNodePatch = Partial<
  Pick<
    CanvasNode,
    "text" | "notes" | "color" | "align" | "valign" | "fontSize" | "bold" | "x" | "y" | "width" | "height" | "target"
  >
>;

export function findNode(doc: CanvasDoc, id: string): CanvasNode | undefined {
  return doc.nodes.find((node) => node.id === id);
}

export function findEdge(doc: CanvasDoc, id: string): CanvasEdge | undefined {
  return doc.edges.find((edge) => edge.id === id);
}

export function findGroup(doc: CanvasDoc, id: string): CanvasGroup | undefined {
  return doc.groups.find((group) => group.id === id);
}

export function addNode(doc: CanvasDoc, node: CanvasNode): CanvasDoc {
  const next = cloneCanvas(doc);
  next.nodes.push(node);
  return next;
}

export function updateNode(doc: CanvasDoc, id: string, patch: CanvasNodePatch): CanvasDoc {
  const next = cloneCanvas(doc);
  const node = findNode(next, id);
  if (!node) return doc;
  Object.assign(node, patch);
  return next;
}

export type NodeMove = { id: string; x: number; y: number };

export function updateNodes(doc: CanvasDoc, patches: NodeMove[]): CanvasDoc {
  if (patches.length === 0) return doc;
  const next = cloneCanvas(doc);
  let changed = false;
  for (const patch of patches) {
    const node = findNode(next, patch.id);
    if (!node) continue;
    if (node.x !== patch.x || node.y !== patch.y) {
      node.x = patch.x;
      node.y = patch.y;
      changed = true;
    }
  }
  return changed ? next : doc;
}

export interface DuplicateNodesResult {
  doc: CanvasDoc;
  ids: string[];
}

// Copies the given nodes to their dropped positions, keeping the originals in
// place. Only edges whose both ends are being copied are duplicated.
export function duplicateNodes(doc: CanvasDoc, moves: NodeMove[]): DuplicateNodesResult | null {
  const positions = new Map(moves.map((move) => [move.id, move]));
  const originals = doc.nodes.filter((node) => positions.has(node.id));
  if (originals.length === 0) return null;
  const next = cloneCanvas(doc);
  const idMap = new Map<string, string>();
  const copies = originals.map((node) => {
    const move = positions.get(node.id)!;
    const copy: CanvasNode = {
      ...node,
      id: newCanvasId(),
      x: move.x,
      y: move.y,
      target: node.target ? { ...node.target } : null,
    };
    idMap.set(node.id, copy.id);
    return copy;
  });
  const copiedEdges = doc.edges
    .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
    .map((edge) => ({
      ...edge,
      id: newEdgeId(),
      source: idMap.get(edge.source)!,
      target: idMap.get(edge.target)!,
    }));
  next.nodes.push(...copies);
  next.edges.push(...copiedEdges);
  return { doc: next, ids: copies.map((copy) => copy.id) };
}

export function removeNodes(doc: CanvasDoc, ids: Set<string>): CanvasDoc {
  if (ids.size === 0) return doc;
  const remaining = doc.nodes.filter((node) => !ids.has(node.id));
  if (remaining.length === doc.nodes.length) return doc;
  const remainingIds = new Set(remaining.map((node) => node.id));
  return {
    ...cloneCanvas(doc),
    nodes: remaining.map((node) => ({
      ...node,
      target: node.target ? { ...node.target } : null,
    })),
    edges: doc.edges
      .filter((edge) => remainingIds.has(edge.source) && remainingIds.has(edge.target))
      .map((edge) => ({ ...edge })),
  };
}

export function addGroup(doc: CanvasDoc, group: CanvasGroup): CanvasDoc {
  const next = cloneCanvas(doc);
  next.groups.push(group);
  return next;
}

export type CanvasGroupPatch = Partial<
  Pick<CanvasGroup, "name" | "color" | "moveContents" | "locked" | "x" | "y" | "width" | "height">
>;

export function updateGroup(doc: CanvasDoc, id: string, patch: CanvasGroupPatch): CanvasDoc {
  const next = cloneCanvas(doc);
  const group = findGroup(next, id);
  if (!group) return doc;
  Object.assign(group, patch);
  return next;
}

export function updateGroups(doc: CanvasDoc, moves: NodeMove[]): CanvasDoc {
  if (moves.length === 0) return doc;
  const next = cloneCanvas(doc);
  let changed = false;
  for (const move of moves) {
    const group = findGroup(next, move.id);
    if (!group) continue;
    if (group.x !== move.x || group.y !== move.y) {
      group.x = move.x;
      group.y = move.y;
      changed = true;
    }
  }
  return changed ? next : doc;
}

export function removeGroups(doc: CanvasDoc, ids: Set<string>): CanvasDoc {
  if (ids.size === 0) return doc;
  const groups = doc.groups.filter((group) => !ids.has(group.id));
  if (groups.length === doc.groups.length) return doc;
  return { ...cloneCanvas(doc), groups };
}

export function addEdge(doc: CanvasDoc, edge: CanvasEdge): CanvasDoc {
  const next = cloneCanvas(doc);
  next.edges.push(edge);
  return next;
}

export type CanvasEdgePatch = Partial<
  Pick<
    CanvasEdge,
    "color" | "sourceHandle" | "targetHandle" | "label" | "labelPosition" | "strokeWidth" | "lineStyle"
  >
>;

export function updateEdge(doc: CanvasDoc, id: string, patch: CanvasEdgePatch): CanvasDoc {
  const next = cloneCanvas(doc);
  const edge = findEdge(next, id);
  if (!edge) return doc;
  Object.assign(edge, patch);
  return next;
}

export function removeEdges(doc: CanvasDoc, ids: Set<string>): CanvasDoc {
  if (ids.size === 0) return doc;
  const edges = doc.edges.filter((edge) => !ids.has(edge.id));
  if (edges.length === doc.edges.length) return doc;
  return { ...cloneCanvas(doc), edges };
}

export function hasConnection(
  doc: CanvasDoc,
  source: string,
  target: string,
  sourceHandle: string | null,
  targetHandle: string | null,
): boolean {
  return doc.edges.some((edge) =>
    edge.source === source
    && edge.target === target
    && (edge.sourceHandle ?? null) === sourceHandle
    && (edge.targetHandle ?? null) === targetHandle);
}
