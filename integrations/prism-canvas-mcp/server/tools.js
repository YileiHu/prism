"use strict";

// Tool catalogue for the Prism canvas MCP server.
//
// Every tool describes the same plain-file contract: Prism stores each
// whiteboard as a CanvasDoc v2 JSON file, so writing the file correctly is the
// whole integration. The schema keeps model-friendly "keys" for nodes inside one
// call, then the server maps them to stable node ids before writing.

const {
  createCanvasDoc,
  createNode,
  createGroup,
  newEdgeId,
} = require("./lib/model.js");
const { normalizeTargetUrl } = require("./lib/targets.js");
const {
  autoNodeHeight,
  applyLayout,
  fitViewport,
} = require("./layout.js");
const {
  toolError,
  loadVaults,
  resolveVault,
  listCanvasFiles,
  resolveCanvasFile,
  readCanvasFile,
  createCanvasFile,
  writeCanvasFile,
  relativeInsideVault,
} = require("./vaults.js");

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const ALIGNS = ["left", "center", "right"];
const VALIGNS = ["top", "middle", "bottom"];
const LINE_STYLES = ["solid", "dashed"];

const targetSchema = {
  type: "object",
  description: "Optional link opened with Alt+click in Prism.",
  properties: {
    kind: { type: "string", enum: ["note", "pdf", "canvas", "url"] },
    path: { type: "string", description: "Absolute path for note/canvas targets." },
    title: { type: "string" },
    repoPath: { type: "string", description: "PDF library root for pdf targets." },
    relPath: { type: "string", description: "Path inside the PDF library root." },
    url: { type: "string", description: "http(s) or mailto URL." },
  },
  required: ["kind"],
  additionalProperties: false,
};

const nodeSchema = {
  type: "object",
  description: "One card. Omit x/y to let the layout place it.",
  properties: {
    key: { type: "string", description: "Short local key used by edges.from/to in the same call; defaults to the node index." },
    text: { type: "string" },
    notes: { type: "string", description: "Longer note shown only in the detail panel." },
    color: { type: "string", description: "Hex color such as #c75b4a; empty means the theme default." },
    align: { type: "string", enum: ALIGNS },
    valign: { type: "string", enum: VALIGNS },
    fontSize: { type: "number", minimum: 10, maximum: 48 },
    bold: { type: "boolean" },
    width: { type: "number" },
    height: { type: "number" },
    x: { type: "number" },
    y: { type: "number" },
    target: targetSchema,
  },
  required: ["text"],
  additionalProperties: false,
};

const edgeSchema = {
  type: "object",
  description: "A directed arrow between two cards.",
  properties: {
    from: { type: "string", description: "Source node key (canvas_create) or node id (canvas_edit)." },
    to: { type: "string", description: "Target node key (canvas_create) or node id (canvas_edit)." },
    label: { type: "string" },
    color: { type: "string" },
    lineStyle: { type: "string", enum: LINE_STYLES },
    strokeWidth: { type: "number", minimum: 1, maximum: 8 },
    labelPosition: { type: "number", minimum: 0.05, maximum: 0.95 },
  },
  required: ["from", "to"],
  additionalProperties: false,
};

const groupSchema = {
  type: "object",
  description: "A titled frame drawn behind cards. Give node keys in `nodes` to frame them automatically, or explicit x/y/width/height.",
  properties: {
    name: { type: "string" },
    color: { type: "string" },
    x: { type: "number" },
    y: { type: "number" },
    width: { type: "number" },
    height: { type: "number" },
    moveContents: { type: "boolean" },
    locked: { type: "boolean" },
    nodes: { type: "array", items: { type: "string" }, description: "Node keys/ids this frame should enclose." },
  },
  additionalProperties: false,
};

const layoutSchema = {
  type: "object",
  properties: {
    mode: { type: "string", enum: ["tree", "mindmap", "grid", "none"], description: "tree is a left-to-right outline, mindmap splits branches around a root." },
    direction: { type: "string", enum: ["LR", "TB"], description: "tree direction; ignore for mindmap/grid." },
    hGap: { type: "number" },
    vGap: { type: "number" },
    columns: { type: "number" },
    root: { type: "string", description: "Root node key/id for mindmap." },
  },
  additionalProperties: false,
};

const nodePatchSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    text: { type: "string" },
    notes: { type: "string" },
    color: { type: "string" },
    align: { type: "string", enum: ALIGNS },
    valign: { type: "string", enum: VALIGNS },
    fontSize: { type: "number", minimum: 10, maximum: 48 },
    bold: { type: "boolean" },
    width: { type: "number" },
    height: { type: "number" },
    x: { type: "number" },
    y: { type: "number" },
    target: targetSchema,
  },
  required: ["id"],
  additionalProperties: false,
};

const edgePatchSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    label: { type: "string" },
    color: { type: "string" },
    lineStyle: { type: "string", enum: LINE_STYLES },
    strokeWidth: { type: "number", minimum: 1, maximum: 8 },
    labelPosition: { type: "number", minimum: 0.05, maximum: 0.95 },
  },
  required: ["id"],
  additionalProperties: false,
};

const groupPatchSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    color: { type: "string" },
    x: { type: "number" },
    y: { type: "number" },
    width: { type: "number" },
    height: { type: "number" },
    moveContents: { type: "boolean" },
    locked: { type: "boolean" },
  },
  required: ["id"],
  additionalProperties: false,
};

const VAULT_PROP = {
  type: "string",
  description: "Vault name or absolute path. Required: this server has no default vault.",
};

function colorValue(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return HEX_COLOR.test(trimmed) ? trimmed : "";
}

function targetValue(value) {
  if (!value || typeof value !== "object") return null;
  const title = typeof value.title === "string" ? value.title : "";
  if (value.kind === "url") {
    const url = normalizeTargetUrl(String(value.url ?? ""));
    return url ? { kind: "url", url } : null;
  }
  if (value.kind === "note" || value.kind === "canvas") {
    const filePath = typeof value.path === "string" ? value.path : "";
    return filePath ? { kind: value.kind, path: filePath, title } : null;
  }
  if (value.kind === "pdf") {
    const repoPath = typeof value.repoPath === "string" ? value.repoPath : "";
    const relPath = typeof value.relPath === "string" ? value.relPath : "";
    return repoPath && relPath ? { kind: "pdf", repoPath, relPath, title } : null;
  }
  return null;
}

function defined(patch, key, value) {
  if (value !== undefined && value !== null) patch[key] = value;
}

function buildNode(spec, fallbackKey) {
  if (!spec || typeof spec !== "object") throw toolError("BAD_NODE", "Each node must be an object with at least `text`.");
  const patch = {};
  defined(patch, "text", typeof spec.text === "string" ? spec.text : "");
  defined(patch, "notes", typeof spec.notes === "string" ? spec.notes : undefined);
  defined(patch, "color", colorValue(spec.color) || undefined);
  defined(patch, "align", ALIGNS.includes(spec.align) ? spec.align : undefined);
  defined(patch, "valign", VALIGNS.includes(spec.valign) ? spec.valign : undefined);
  defined(patch, "fontSize", Number.isFinite(spec.fontSize) ? spec.fontSize : undefined);
  defined(patch, "bold", typeof spec.bold === "boolean" ? spec.bold : undefined);
  defined(patch, "width", Number.isFinite(spec.width) ? spec.width : undefined);
  defined(patch, "height", Number.isFinite(spec.height) ? spec.height : undefined);
  defined(patch, "x", Number.isFinite(spec.x) ? spec.x : undefined);
  defined(patch, "y", Number.isFinite(spec.y) ? spec.y : undefined);
  defined(patch, "target", targetValue(spec.target) ?? undefined);
  const node = createNode(patch);
  if (spec.height === undefined) node.height = autoNodeHeight(node);
  if (!node.text) node.text = fallbackKey ? `Card ${fallbackKey}` : "";
  return node;
}

function buildEdge(spec, resolve) {
  if (!spec || typeof spec !== "object") throw toolError("BAD_EDGE", "Each edge must be an object with `from` and `to`.");
  const source = resolve(spec.from);
  const target = resolve(spec.to);
  if (!source || !target) {
    throw toolError(
      "BAD_EDGE",
      `Edge references an unknown node: from="${spec.from}" to="${spec.to}". In canvas_create use the node keys from this call; in canvas_edit use ids returned by canvas_read.`,
    );
  }
  if (source === target) throw toolError("BAD_EDGE", "Edges cannot connect a node to itself.");
  return {
    id: newEdgeId(),
    source,
    target,
    sourceHandle: null,
    targetHandle: null,
    color: colorValue(spec.color),
    label: typeof spec.label === "string" ? spec.label : "",
    labelPosition: Number.isFinite(spec.labelPosition) ? spec.labelPosition : 0.5,
    strokeWidth: Number.isFinite(spec.strokeWidth) ? spec.strokeWidth : 1.5,
    lineStyle: LINE_STYLES.includes(spec.lineStyle) ? spec.lineStyle : "solid",
  };
}

function frameGroup(spec, resolve, nodes) {
  const patch = {
    name: typeof spec.name === "string" ? spec.name : "",
    color: colorValue(spec.color),
    moveContents: spec.moveContents !== false,
    locked: spec.locked === true,
  };
  const keys = Array.isArray(spec.nodes) ? spec.nodes : [];
  const framed = keys.map((key) => nodes.find((node) => node.id === resolve(key))).filter(Boolean);
  if (framed.length > 0) {
    const minX = Math.min(...framed.map((node) => node.x));
    const minY = Math.min(...framed.map((node) => node.y));
    const maxX = Math.max(...framed.map((node) => node.x + node.width));
    const maxY = Math.max(...framed.map((node) => node.y + node.height));
    patch.x = minX - 40;
    patch.y = minY - 56;
    patch.width = Math.max(160, maxX - minX + 80);
    patch.height = Math.max(100, maxY - minY + 96);
  } else {
    if (Number.isFinite(spec.x)) patch.x = spec.x;
    if (Number.isFinite(spec.y)) patch.y = spec.y;
    if (Number.isFinite(spec.width)) patch.width = spec.width;
    if (Number.isFinite(spec.height)) patch.height = spec.height;
  }
  return createGroup(patch);
}

function summarizeDoc(doc) {
  return {
    counts: { nodes: doc.nodes.length, edges: doc.edges.length, groups: doc.groups.length },
    nodes: doc.nodes.map((node) => ({
      id: node.id,
      text: node.text,
      x: Math.round(node.x),
      y: Math.round(node.y),
      width: Math.round(node.width),
      height: Math.round(node.height),
      color: node.color,
      target: node.target,
    })),
    edges: doc.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
    })),
    groups: doc.groups.map((group) => ({
      id: group.id,
      name: group.name,
      x: Math.round(group.x),
      y: Math.round(group.y),
      width: Math.round(group.width),
      height: Math.round(group.height),
    })),
  };
}

function text(value) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

const tools = [
  {
    name: "canvas_vaults",
    description:
      "List the Prism vaults and the folder where each stores whiteboards. Call this when the user did not name a vault; every other tool requires an explicit vault.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler() {
      const vaults = loadVaults().map((vault) => {
        let canvasCount = null;
        if (vault.exists && !vault.private) {
          try {
            canvasCount = listCanvasFiles(vault).length;
          } catch {
            canvasCount = null;
          }
        }
        return {
          name: vault.name,
          path: vault.path,
          canvasDir: vault.canvasDir,
          private: vault.private,
          exists: vault.exists,
          canvasCount,
        };
      });
      return text({ vaults });
    },
  },
  {
    name: "canvas_list",
    description: "List whiteboards in one Prism vault (newest first). Titles, vault-relative paths and modification times.",
    inputSchema: {
      type: "object",
      properties: { vault: VAULT_PROP },
      required: ["vault"],
      additionalProperties: false,
    },
    handler(args) {
      const vault = resolveVault(args.vault);
      const files = listCanvasFiles(vault).map((file) => ({
        title: file.title,
        relPath: file.relPath,
        modifiedAt: new Date(file.modifiedAt).toISOString(),
      }));
      return text({ vault: vault.name, canvasDir: vault.canvasDir, canvases: files });
    },
  },
  {
    name: "canvas_read",
    description:
      "Read one whiteboard by title or vault-relative path. Returns Prism's CanvasDoc: nodes with ids and text, edges and groups, plus the file's modifiedAt.",
    inputSchema: {
      type: "object",
      properties: {
        vault: VAULT_PROP,
        canvas: { type: "string", description: "Whiteboard title (e.g. 编译器概览) or path such as canvases/foo.json." },
      },
      required: ["vault", "canvas"],
      additionalProperties: false,
    },
    handler(args) {
      const vault = resolveVault(args.vault);
      const file = resolveCanvasFile(vault, args.canvas);
      const { parsed, stat } = readCanvasFile(vault, file.path);
      if (parsed.corrupt) {
        throw toolError("CANVAS_CORRUPT", `Prism cannot parse ${file.path}; open it in Prism and fix the JSON before editing from here.`);
      }
      return text({
        path: file.path,
        relPath: relativeInsideVault(vault, file.path),
        title: file.title,
        modifiedAt: stat.mtimeMs,
        migrated: parsed.migrated,
        doc: parsed.doc,
      });
    },
  },
  {
    name: "canvas_create",
    description:
      "Create a new whiteboard in a Prism vault. Give nodes (cards) and edges (arrows) using local node keys for from/to; the server lays them out and writes the CanvasDoc v2 JSON Prism opens. Use mindmap for a central topic with branches, tree for an outline, grid for a flat set.",
    inputSchema: {
      type: "object",
      properties: {
        vault: VAULT_PROP,
        title: { type: "string", description: "File/title shown in 资料库 → 白板. Filename comes from this." },
        nodes: { type: "array", items: nodeSchema, minItems: 1 },
        edges: { type: "array", items: edgeSchema },
        groups: { type: "array", items: groupSchema },
        layout: layoutSchema,
      },
      required: ["vault", "title", "nodes"],
      additionalProperties: false,
    },
    handler(args) {
      if (!args.title || !String(args.title).trim()) throw toolError("TITLE_REQUIRED", "Give the whiteboard a title.");
      const vault = resolveVault(args.vault);
      const doc = createCanvasDoc();
      const byKey = new Map();
      args.nodes.forEach((spec, index) => {
        const key = typeof spec.key === "string" && spec.key ? spec.key : String(index);
        if (byKey.has(key)) throw toolError("DUPLICATE_NODE_KEY", `Two nodes use the key "${key}"; keys must be unique inside one canvas_create call.`);
        const node = buildNode(spec, key);
        byKey.set(key, node.id);
        byKey.set(node.id, node.id);
        doc.nodes.push(node);
      });
      const resolve = (ref) => (typeof ref === "string" ? byKey.get(ref) : undefined);
      for (const spec of args.edges || []) doc.edges.push(buildEdge(spec, resolve));

      const layout = args.layout || {};
      const mode = layout.mode || (doc.edges.length > 0 ? "tree" : "grid");
      applyLayout(doc.nodes, doc.edges, { ...layout, mode });
      for (const spec of args.groups || []) doc.groups.push(frameGroup(spec, resolve, doc.nodes));
      doc.viewport = fitViewport(doc.nodes, doc.groups);
      const created = createCanvasFile(vault, args.title, doc);
      const saved = readCanvasFile(vault, created.path).parsed.doc;
      return text({
        created: true,
        vault: vault.name,
        title: created.title,
        path: created.path,
        relPath: created.relPath,
        layout: { mode, direction: layout.direction || (mode === "tree" ? "LR" : undefined) },
        nodes: saved.nodes.map((node) => ({ id: node.id, text: node.text })),
        doc: summarizeDoc(saved),
        next:
          "Switch Prism to 资料库 → 白板 (or restart Prism) to see the file; it is a normal whiteboard that can be edited in the app.",
      });
    },
  },
  {
    name: "canvas_edit",
    description:
      "Edit an existing whiteboard: add nodes/edges/groups, update fields by id, or remove ids. Node ids come from canvas_read. Saves atomically and refuses to overwrite a file changed since it was read.",
    inputSchema: {
      type: "object",
      properties: {
        vault: VAULT_PROP,
        canvas: { type: "string", description: "Title or vault-relative path." },
        addNodes: { type: "array", items: nodeSchema },
        addEdges: { type: "array", items: edgeSchema },
        addGroups: { type: "array", items: groupSchema },
        updateNodes: { type: "array", items: nodePatchSchema },
        updateEdges: { type: "array", items: edgePatchSchema },
        updateGroups: { type: "array", items: groupPatchSchema },
        removeNodeIds: { type: "array", items: { type: "string" } },
        removeEdgeIds: { type: "array", items: { type: "string" } },
        removeGroupIds: { type: "array", items: { type: "string" } },
        layout: layoutSchema,
      },
      required: ["vault", "canvas"],
      additionalProperties: false,
    },
    handler(args) {
      const hasEdit =
        (args.addNodes && args.addNodes.length > 0) ||
        (args.addEdges && args.addEdges.length > 0) ||
        (args.addGroups && args.addGroups.length > 0) ||
        (args.updateNodes && args.updateNodes.length > 0) ||
        (args.updateEdges && args.updateEdges.length > 0) ||
        (args.updateGroups && args.updateGroups.length > 0) ||
        (args.removeNodeIds && args.removeNodeIds.length > 0) ||
        (args.removeEdgeIds && args.removeEdgeIds.length > 0) ||
        (args.removeGroupIds && args.removeGroupIds.length > 0) ||
        args.layout;
      if (!hasEdit) {
        throw toolError("NO_CHANGES", "canvas_edit needs at least one add/update/remove list or a layout option.");
      }
      const vault = resolveVault(args.vault);
      const file = resolveCanvasFile(vault, args.canvas);
      const { parsed, stat } = readCanvasFile(vault, file.path);
      if (parsed.corrupt) {
        throw toolError("CANVAS_CORRUPT", `Prism cannot parse ${file.path}; open it in Prism and fix the JSON first.`);
      }
      const doc = parsed.doc;
      const nodeById = new Map(doc.nodes.map((node) => [node.id, node]));
      const keyToId = new Map();
      for (const [id] of nodeById) keyToId.set(id, id);
      let addedNodes = 0;
      for (const spec of args.addNodes || []) {
        if (typeof spec.key === "string" && spec.key && keyToId.has(spec.key)) {
          throw toolError("DUPLICATE_NODE_KEY", `The key "${spec.key}" is already a node id or another added key.`);
        }
        const node = buildNode(spec);
        doc.nodes.push(node);
        nodeById.set(node.id, node);
        if (typeof spec.key === "string" && spec.key) keyToId.set(spec.key, node.id);
        keyToId.set(node.id, node.id);
        addedNodes += 1;
      }
      const resolve = (ref) => (typeof ref === "string" ? keyToId.get(ref) : undefined);
      let addedEdges = 0;
      for (const spec of args.addEdges || []) {
        const edge = buildEdge(spec, resolve);
        const duplicate = doc.edges.some(
          (existing) => existing.source === edge.source && existing.target === edge.target,
        );
        if (duplicate) continue;
        doc.edges.push(edge);
        addedEdges += 1;
      }
      const pendingGroups = args.addGroups || [];
      let updated = 0;
      for (const patch of args.updateNodes || []) {
        const node = nodeById.get(String(patch.id));
        if (!node) throw toolError("CANVAS_NODE_NOT_FOUND", `No node with id "${patch.id}". Re-read the canvas for current ids.`);
        if (typeof patch.text === "string") node.text = patch.text;
        if (typeof patch.notes === "string") node.notes = patch.notes;
        if (patch.color !== undefined) node.color = colorValue(patch.color);
        if (ALIGNS.includes(patch.align)) node.align = patch.align;
        if (VALIGNS.includes(patch.valign)) node.valign = patch.valign;
        if (Number.isFinite(patch.fontSize)) node.fontSize = patch.fontSize;
        if (typeof patch.bold === "boolean") node.bold = patch.bold;
        if (Number.isFinite(patch.width)) node.width = patch.width;
        if (Number.isFinite(patch.height)) node.height = patch.height;
        if (Number.isFinite(patch.x)) node.x = patch.x;
        if (Number.isFinite(patch.y)) node.y = patch.y;
        if (patch.target !== undefined) node.target = targetValue(patch.target);
        updated += 1;
      }
      for (const patch of args.updateEdges || []) {
        const edge = doc.edges.find((item) => item.id === patch.id);
        if (!edge) throw toolError("CANVAS_EDGE_NOT_FOUND", `No edge with id "${patch.id}".`);
        if (typeof patch.label === "string") edge.label = patch.label;
        if (patch.color !== undefined) edge.color = colorValue(patch.color);
        if (LINE_STYLES.includes(patch.lineStyle)) edge.lineStyle = patch.lineStyle;
        if (Number.isFinite(patch.strokeWidth)) edge.strokeWidth = patch.strokeWidth;
        if (Number.isFinite(patch.labelPosition)) edge.labelPosition = patch.labelPosition;
        updated += 1;
      }
      for (const patch of args.updateGroups || []) {
        const group = doc.groups.find((item) => item.id === patch.id);
        if (!group) throw toolError("CANVAS_GROUP_NOT_FOUND", `No group with id "${patch.id}".`);
        if (typeof patch.name === "string") group.name = patch.name;
        if (patch.color !== undefined) group.color = colorValue(patch.color);
        if (Number.isFinite(patch.x)) group.x = patch.x;
        if (Number.isFinite(patch.y)) group.y = patch.y;
        if (Number.isFinite(patch.width)) group.width = patch.width;
        if (Number.isFinite(patch.height)) group.height = patch.height;
        if (typeof patch.moveContents === "boolean") group.moveContents = patch.moveContents;
        if (typeof patch.locked === "boolean") group.locked = patch.locked;
        updated += 1;
      }
      const removedNodeIds = new Set((args.removeNodeIds || []).map(String));
      for (const id of removedNodeIds) {
        if (!nodeById.has(id)) throw toolError("CANVAS_NODE_NOT_FOUND", `No node with id "${id}".`);
      }
      if (removedNodeIds.size > 0) {
        doc.nodes = doc.nodes.filter((node) => !removedNodeIds.has(node.id));
        doc.edges = doc.edges.filter(
          (edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target),
        );
      }
      const removedEdgeIds = new Set((args.removeEdgeIds || []).map(String));
      if (removedEdgeIds.size > 0) {
        doc.edges = doc.edges.filter((edge) => !removedEdgeIds.has(edge.id));
      }
      const removedGroupIds = new Set((args.removeGroupIds || []).map(String));
      if (removedGroupIds.size > 0) {
        doc.groups = doc.groups.filter((group) => !removedGroupIds.has(group.id));
      }

      let layout = null;
      if (args.layout) {
        layout = applyLayout(doc.nodes, doc.edges, args.layout);
      }
      const addedGroups = pendingGroups.length;
      for (const spec of pendingGroups) doc.groups.push(frameGroup(spec, resolve, doc.nodes));
      doc.viewport = fitViewport(doc.nodes, doc.groups);
      const result = writeCanvasFile(vault, file.path, doc, stat.mtimeMs);
      const saved = readCanvasFile(vault, file.path).parsed.doc;
      return text({
        edited: true,
        path: file.path,
        relPath: relativeInsideVault(vault, file.path),
        title: file.title,
        modifiedAt: result.modifiedAt,
        changes: {
          addedNodes,
          addedEdges,
          addedGroups,
          updated,
          removedNodes: removedNodeIds.size,
          removedEdges: removedEdgeIds.size,
          removedGroups: removedGroupIds.size,
          layout,
        },
        doc: summarizeDoc(saved),
      });
    },
  },
  {
    name: "canvas_layout",
    description:
      "Re-layout an existing whiteboard without changing its text: tree (outline), mindmap (root + branches both sides), or grid. Useful after adding nodes with canvas_edit.",
    inputSchema: {
      type: "object",
      properties: {
        vault: VAULT_PROP,
        canvas: { type: "string" },
        mode: { type: "string", enum: ["tree", "mindmap", "grid", "none"] },
        direction: { type: "string", enum: ["LR", "TB"] },
        hGap: { type: "number" },
        vGap: { type: "number" },
        columns: { type: "number" },
        root: { type: "string", description: "Root node id for mindmap." },
      },
      required: ["vault", "canvas", "mode"],
      additionalProperties: false,
    },
    handler(args) {
      const vault = resolveVault(args.vault);
      const file = resolveCanvasFile(vault, args.canvas);
      const { parsed, stat } = readCanvasFile(vault, file.path);
      if (parsed.corrupt) throw toolError("CANVAS_CORRUPT", `Prism cannot parse ${file.path}.`);
      const doc = parsed.doc;
      if (doc.nodes.length === 0) throw toolError("CANVAS_EMPTY", "This whiteboard has no cards to lay out.");
      const layout = applyLayout(doc.nodes, doc.edges, args);
      doc.viewport = fitViewport(doc.nodes, doc.groups);
      writeCanvasFile(vault, file.path, doc, stat.mtimeMs);
      return text({ laidOut: true, title: file.title, path: file.path, layout, doc: summarizeDoc(doc) });
    },
  },
];

module.exports = {
  tools,
  text,
  buildNode,
  buildEdge,
  nodeSchema,
  edgeSchema,
  groupSchema,
};
