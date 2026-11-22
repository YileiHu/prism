"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_LINE_STYLE = exports.LINE_STYLES = exports.MAX_EDGE_WIDTH = exports.MIN_EDGE_WIDTH = exports.DEFAULT_EDGE_WIDTH = exports.EDGE_WIDTHS = exports.MAX_EDGE_LABEL_POSITION = exports.MIN_EDGE_LABEL_POSITION = exports.DEFAULT_EDGE_LABEL_POSITION = exports.MAX_GROUP_HEIGHT = exports.MAX_GROUP_WIDTH = exports.MIN_GROUP_HEIGHT = exports.MIN_GROUP_WIDTH = exports.DEFAULT_GROUP_HEIGHT = exports.DEFAULT_GROUP_WIDTH = exports.MAX_FONT_SIZE = exports.MIN_FONT_SIZE = exports.DEFAULT_FONT_SIZE = exports.TEXT_VALIGNS = exports.TEXT_ALIGNS = exports.MAX_NODE_HEIGHT = exports.MAX_NODE_WIDTH = exports.MIN_NODE_HEIGHT = exports.MIN_NODE_WIDTH = exports.NODE_HEIGHT = exports.NODE_WIDTH = exports.CANVAS_VERSION = void 0;
exports.newCanvasId = newCanvasId;
exports.newEdgeId = newEdgeId;
exports.newGroupId = newGroupId;
exports.createGroup = createGroup;
exports.createNode = createNode;
exports.createCanvasDoc = createCanvasDoc;
exports.cloneCanvas = cloneCanvas;
exports.numberOr = numberOr;
exports.stringOr = stringOr;
exports.clamp = clamp;
exports.clampWidth = clampWidth;
exports.clampHeight = clampHeight;
exports.sanitizeAlign = sanitizeAlign;
exports.sanitizeVAlign = sanitizeVAlign;
exports.clampFontSize = clampFontSize;
exports.clampGroupWidth = clampGroupWidth;
exports.clampGroupHeight = clampGroupHeight;
exports.sanitizeLabelPosition = sanitizeLabelPosition;
exports.sanitizeEdgeWidth = sanitizeEdgeWidth;
exports.sanitizeLineStyle = sanitizeLineStyle;
exports.sanitizeViewport = sanitizeViewport;
exports.sanitizeTarget = sanitizeTarget;
exports.normalizeHandle = normalizeHandle;
exports.parseCanvas = parseCanvas;
exports.serializeCanvas = serializeCanvas;
const targets_1 = require("./targets");
exports.CANVAS_VERSION = 2;
exports.NODE_WIDTH = 220;
exports.NODE_HEIGHT = 88;
exports.MIN_NODE_WIDTH = 120;
exports.MIN_NODE_HEIGHT = 44;
exports.MAX_NODE_WIDTH = 1200;
exports.MAX_NODE_HEIGHT = 1200;
exports.TEXT_ALIGNS = ["left", "center", "right"];
exports.TEXT_VALIGNS = ["top", "middle", "bottom"];
exports.DEFAULT_FONT_SIZE = 14;
exports.MIN_FONT_SIZE = 10;
exports.MAX_FONT_SIZE = 48;
exports.DEFAULT_GROUP_WIDTH = 420;
exports.DEFAULT_GROUP_HEIGHT = 280;
exports.MIN_GROUP_WIDTH = 160;
exports.MIN_GROUP_HEIGHT = 100;
exports.MAX_GROUP_WIDTH = 6000;
exports.MAX_GROUP_HEIGHT = 6000;
exports.DEFAULT_EDGE_LABEL_POSITION = 0.5;
exports.MIN_EDGE_LABEL_POSITION = 0.05;
exports.MAX_EDGE_LABEL_POSITION = 0.95;
exports.EDGE_WIDTHS = [1.5, 2.5, 4];
exports.DEFAULT_EDGE_WIDTH = 1.5;
exports.MIN_EDGE_WIDTH = 1;
exports.MAX_EDGE_WIDTH = 8;
exports.LINE_STYLES = ["solid", "dashed"];
exports.DEFAULT_LINE_STYLE = "solid";
function newCanvasId() {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
        return `n_${cryptoApi.randomUUID().slice(0, 8)}`;
    }
    return `n_${Math.random().toString(36).slice(2, 10)}`;
}
function newEdgeId() {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
        return `e_${cryptoApi.randomUUID().slice(0, 8)}`;
    }
    return `e_${Math.random().toString(36).slice(2, 10)}`;
}
function newGroupId() {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
        return `g_${cryptoApi.randomUUID().slice(0, 8)}`;
    }
    return `g_${Math.random().toString(36).slice(2, 10)}`;
}
function createGroup(patch = {}) {
    return {
        id: newGroupId(),
        name: "",
        color: "",
        moveContents: true,
        locked: false,
        x: 0,
        y: 0,
        width: exports.DEFAULT_GROUP_WIDTH,
        height: exports.DEFAULT_GROUP_HEIGHT,
        ...patch,
    };
}
function createNode(patch = {}) {
    return {
        id: newCanvasId(),
        text: "",
        notes: "",
        color: "",
        align: "left",
        valign: "top",
        fontSize: exports.DEFAULT_FONT_SIZE,
        bold: false,
        x: 0,
        y: 0,
        width: exports.NODE_WIDTH,
        height: exports.NODE_HEIGHT,
        target: null,
        ...patch,
    };
}
function createCanvasDoc() {
    return {
        version: exports.CANVAS_VERSION,
        kind: "canvas",
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [],
        groups: [],
        edges: [],
        ink: [],
    };
}
function cloneCanvas(doc) {
    return {
        ...doc,
        viewport: { ...doc.viewport },
        nodes: doc.nodes.map((node) => ({
            ...node,
            target: node.target ? { ...node.target } : null,
        })),
        groups: doc.groups.map((group) => ({ ...group })),
        edges: doc.edges.map((edge) => ({ ...edge })),
        ink: doc.ink.map((item) => (item && typeof item === "object" ? { ...item } : item)),
    };
}
function numberOr(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function stringOr(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function clampWidth(value, fallback = exports.NODE_WIDTH) {
    return clamp(numberOr(value, fallback), exports.MIN_NODE_WIDTH, exports.MAX_NODE_WIDTH);
}
function clampHeight(value, fallback = exports.NODE_HEIGHT) {
    return clamp(numberOr(value, fallback), exports.MIN_NODE_HEIGHT, exports.MAX_NODE_HEIGHT);
}
function sanitizeAlign(value) {
    return exports.TEXT_ALIGNS.includes(value) ? value : "left";
}
function sanitizeVAlign(value) {
    return exports.TEXT_VALIGNS.includes(value) ? value : "top";
}
function clampFontSize(value, fallback = exports.DEFAULT_FONT_SIZE) {
    return clamp(numberOr(value, fallback), exports.MIN_FONT_SIZE, exports.MAX_FONT_SIZE);
}
function clampGroupWidth(value, fallback = exports.DEFAULT_GROUP_WIDTH) {
    return clamp(numberOr(value, fallback), exports.MIN_GROUP_WIDTH, exports.MAX_GROUP_WIDTH);
}
function clampGroupHeight(value, fallback = exports.DEFAULT_GROUP_HEIGHT) {
    return clamp(numberOr(value, fallback), exports.MIN_GROUP_HEIGHT, exports.MAX_GROUP_HEIGHT);
}
function sanitizeLabelPosition(value) {
    return clamp(numberOr(value, exports.DEFAULT_EDGE_LABEL_POSITION), exports.MIN_EDGE_LABEL_POSITION, exports.MAX_EDGE_LABEL_POSITION);
}
function sanitizeEdgeWidth(value) {
    return clamp(numberOr(value, exports.DEFAULT_EDGE_WIDTH), exports.MIN_EDGE_WIDTH, exports.MAX_EDGE_WIDTH);
}
function sanitizeLineStyle(value) {
    return exports.LINE_STYLES.includes(value) ? value : exports.DEFAULT_LINE_STYLE;
}
function sanitizeViewport(value) {
    const viewport = value && typeof value === "object" ? value : {};
    return {
        x: numberOr(viewport.x, 0),
        y: numberOr(viewport.y, 0),
        zoom: clamp(numberOr(viewport.zoom, 1), 0.2, 2.5),
    };
}
function sanitizeTarget(value) {
    if (!value || typeof value !== "object")
        return null;
    const target = value;
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
function sanitizeNode(value, seen) {
    if (!value || typeof value !== "object")
        return null;
    const node = value;
    let id = stringOr(node.id);
    if (!id || seen.has(id))
        id = newCanvasId();
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
function sanitizeGroup(value, seenIds) {
    if (!value || typeof value !== "object")
        return null;
    const group = value;
    let id = stringOr(group.id);
    if (!id || seenIds.has(id))
        id = newGroupId();
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
function normalizeHandle(value) {
    return typeof value === "string" && value ? value : null;
}
function sanitizeEdge(value, nodeIds, seenIds, seenKeys) {
    if (!value || typeof value !== "object")
        return null;
    const edge = value;
    const source = stringOr(edge.source);
    const target = stringOr(edge.target);
    if (!source || !target || source === target)
        return null;
    if (!nodeIds.has(source) || !nodeIds.has(target))
        return null;
    // Older migrations stored null handles; pin them to the right/left points so
    // React Flow can always resolve both ends.
    const sourceHandle = normalizeHandle(edge.sourceHandle) ?? "right";
    const targetHandle = normalizeHandle(edge.targetHandle) ?? "left";
    const key = `${source}|${target}|${sourceHandle ?? ""}|${targetHandle ?? ""}`;
    if (seenKeys.has(key))
        return null;
    seenKeys.add(key);
    let id = stringOr(edge.id);
    if (!id || seenIds.has(id))
        id = newEdgeId();
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
function parseV2(obj) {
    const seenIds = new Set();
    const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : [];
    const nodes = rawNodes
        .map((item) => sanitizeNode(item, seenIds))
        .filter((node) => node !== null);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const groupSeen = new Set(nodeIds);
    const rawGroups = Array.isArray(obj.groups) ? obj.groups : [];
    const groups = rawGroups
        .map((item) => sanitizeGroup(item, groupSeen))
        .filter((group) => group !== null);
    const edgeIds = new Set();
    const edgeKeys = new Set();
    const rawEdges = Array.isArray(obj.edges) ? obj.edges : [];
    const edges = rawEdges
        .map((item) => sanitizeEdge(item, nodeIds, edgeIds, edgeKeys))
        .filter((edge) => edge !== null);
    return {
        version: exports.CANVAS_VERSION,
        kind: "canvas",
        viewport: sanitizeViewport(obj.viewport),
        nodes,
        groups,
        edges,
        ink: Array.isArray(obj.ink) ? obj.ink : [],
    };
}
function legacyTarget(type, notePath, url) {
    if (type === "note") {
        const path = stringOr(notePath);
        return path ? { kind: "note", path, title: (0, targets_1.leafName)(path) } : null;
    }
    if (type === "link") {
        const value = stringOr(url);
        return value ? { kind: "url", url: value } : null;
    }
    return null;
}
function migrateV1(obj) {
    const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : [];
    const seen = new Set();
    const nodes = [];
    const parentById = new Map();
    for (const item of rawNodes) {
        if (!item || typeof item !== "object")
            continue;
        const value = item;
        let id = stringOr(value.id);
        if (!id || seen.has(id))
            id = newCanvasId();
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
        if (parentId)
            parentById.set(id, parentId);
    }
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edgeIds = new Set();
    const edgeKeys = new Set();
    const edges = [];
    for (const [id, parentId] of parentById) {
        if (parentId === id || !nodeIds.has(parentId))
            continue;
        const key = `${parentId}|${id}|right|left`;
        if (edgeKeys.has(key))
            continue;
        edgeKeys.add(key);
        let edgeId = `e_${id}`;
        if (edgeIds.has(edgeId))
            edgeId = newEdgeId();
        edgeIds.add(edgeId);
        edges.push({
            id: edgeId,
            source: parentId,
            target: id,
            sourceHandle: "right",
            targetHandle: "left",
            color: "",
            label: "",
            labelPosition: exports.DEFAULT_EDGE_LABEL_POSITION,
            strokeWidth: exports.DEFAULT_EDGE_WIDTH,
            lineStyle: exports.DEFAULT_LINE_STYLE,
        });
    }
    return {
        version: exports.CANVAS_VERSION,
        kind: "canvas",
        viewport: sanitizeViewport(obj.viewport),
        nodes,
        groups: [],
        edges,
        ink: Array.isArray(obj.ink) ? obj.ink : [],
    };
}
function looksLikeV1(obj, rawNodes) {
    if (obj.version === 1)
        return true;
    if ("rootId" in obj || "layout" in obj)
        return true;
    return rawNodes.some((item) => item !== null
        && typeof item === "object"
        && ("parentId" in item || "order" in item || "collapsed" in item));
}
function parseCanvas(json) {
    let raw;
    try {
        raw = JSON.parse(json);
    }
    catch {
        return { doc: createCanvasDoc(), migrated: false, corrupt: true };
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { doc: createCanvasDoc(), migrated: false, corrupt: true };
    }
    const obj = raw;
    if (obj.nodes !== undefined && !Array.isArray(obj.nodes)) {
        return { doc: createCanvasDoc(), migrated: false, corrupt: true };
    }
    const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : [];
    if (looksLikeV1(obj, rawNodes)) {
        return { doc: migrateV1(obj), migrated: true, corrupt: false };
    }
    return { doc: parseV2(obj), migrated: false, corrupt: false };
}
function serializeTarget(target) {
    if (target.kind === "url")
        return { kind: target.kind, url: target.url };
    if (target.kind === "pdf") {
        return { kind: target.kind, repoPath: target.repoPath, relPath: target.relPath, title: target.title };
    }
    return { kind: target.kind, path: target.path, title: target.title };
}
// Stable serialization: fixed key order, two spaces. Keeps diffs small when the
// same board is saved repeatedly.
function serializeCanvas(doc) {
    return JSON.stringify({
        version: exports.CANVAS_VERSION,
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
    }, null, 2);
}
