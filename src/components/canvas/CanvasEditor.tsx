import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  ArrowLeft,
  BookmarkPlus,
  BoxSelect,
  Columns3,
  Copy,
  ExternalLink,
  Frame,
  Link2,
  Maximize2,
  PanelRight,
  Pencil,
  Plus,
  Spline,
  Trash2,
  TriangleAlert,
  Unlink,
  Weight,
  X,
} from "lucide-react";
import type { Connection } from "@xyflow/react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useSettings } from "../../lib/settings";
import { MAX_CANVAS_PRESETS, type CanvasPreset } from "../../shared/settings";
import { presetFromNode } from "../../lib/canvas/presets";
import { notifyCanvasSaved } from "../../lib/canvas/events";
import PresetBar from "./PresetBar";
import RenameModal from "../RenameModal";
import { useContextMenu } from "../../lib/useContextMenu";
import { useToolbarContribution, type ToolbarContribution } from "../toolbar/ToolbarProvider";
import { AUTO_SWATCH_COLOR, buildColorMenuItem } from "../ColorPicker";
import type { MenuItem } from "../ContextMenu";
import Button from "../Button";
import Modal from "../Modal";
import Spinner from "../Spinner";
import {
  DEFAULT_EDGE_LABEL_POSITION,
  DEFAULT_EDGE_WIDTH,
  DEFAULT_GROUP_HEIGHT,
  DEFAULT_GROUP_WIDTH,
  DEFAULT_LINE_STYLE,
  EDGE_WIDTHS,
  LINE_STYLES,
  NODE_HEIGHT,
  NODE_WIDTH,
  clampGroupHeight,
  clampGroupWidth,
  createGroup,
  createNode,
  newEdgeId,
  parseCanvas,
  sanitizeLabelPosition,
  serializeCanvas,
  type CanvasDoc,
  type CanvasGroup,
  type CanvasNode,
  type CanvasTarget,
  type CanvasViewport,
} from "../../lib/canvas/model";
import {
  addEdge,
  addGroup,
  addNode,
  duplicateNodes,
  findEdge,
  findGroup,
  findNode,
  hasConnection,
  removeEdges,
  removeGroups,
  removeNodes,
  updateEdge,
  updateGroup,
  updateGroups,
  updateNode,
  updateNodes,
  type CanvasEdgePatch,
  type CanvasGroupPatch,
  type CanvasNodePatch,
  type NodeMove,
} from "../../lib/canvas/graph";
import {
  emptyHistory,
  recordHistory,
  redoHistory,
  undoHistory,
  type CanvasHistory,
} from "../../lib/canvas/history";
import { targetTitle } from "../../lib/canvas/targets";
import {
  alignNodes,
  distributeNodes,
  type AlignMode,
  type DistributeMode,
} from "../../lib/canvas/geometry";
import BoardFlow, { type BoardInsertPosition, type FocusRequest } from "./BoardFlow";
import type { NodeBounds } from "./nodes/BoardNode";
import NodeDetailPanel from "./NodeDetailPanel";
import EdgeDetailPanel, { EDGE_WIDTH_LABEL_KEYS } from "./EdgeDetailPanel";
import FrameDetailPanel from "./FrameDetailPanel";
import SelectionToolbar from "./SelectionToolbar";
import TargetPickerModal from "./TargetPickerModal";

type Status = "loading" | "ready" | "missing" | "error";

interface Props {
  vaultPath: string;
  canvasPath: string;
  title: string;
  focused: boolean;
  toolbarScope: string;
  splitOpen: boolean;
  onToggleSplit: () => void;
  onBackToLibrary: () => void;
  onClose: () => void;
  onOpenTarget: (target: CanvasTarget) => void;
}

function sameSet(previous: Set<string>, next: string[]): boolean {
  if (previous.size !== next.length) return false;
  return next.every((id) => previous.has(id));
}

export default function CanvasEditor({
  vaultPath,
  canvasPath,
  title,
  focused,
  toolbarScope,
  splitOpen,
  onToggleSplit,
  onBackToLibrary,
  onClose,
  onOpenTarget,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const { values, set: setSetting } = useSettings();
  const { onContextMenu: openContextMenu } = useContextMenu();

  const [status, setStatus] = useState<Status>("loading");
  const [doc, setDoc] = useState<CanvasDoc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [presetForSave, setPresetForSave] = useState<CanvasNode | null>(null);
  const [presetForRename, setPresetForRename] = useState<CanvasPreset | null>(null);
  const [drawGroupMode, setDrawGroupMode] = useState(false);
  const [groupForRename, setGroupForRename] = useState<CanvasGroup | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [insertSignal, setInsertSignal] = useState(0);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [viewKey, setViewKey] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<CanvasDoc | null>(null);
  const dirtyRef = useRef(false);
  const statusRef = useRef<Status>("loading");
  const historyRef = useRef<CanvasHistory>(emptyHistory());
  const modifiedAtRef = useRef<number | null>(null);
  const revisionRef = useRef(0);
  const savingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const focusNonceRef = useRef(0);
  const insertCountRef = useRef(0);
  const titleRef = useRef(title);
  titleRef.current = title;
  dirtyRef.current = dirty;
  statusRef.current = status;

  const load = useCallback(async () => {
    setStatus("loading");
    setConflict(false);
    try {
      const content = await window.prism.readCanvas(canvasPath);
      const parsed = parseCanvas(content.json);
      modifiedAtRef.current = content.modifiedAt;
      historyRef.current = emptyHistory();
      docRef.current = parsed.doc;
      setDoc(parsed.doc);
      setStatus(parsed.corrupt ? "error" : "ready");
      setDirty(parsed.migrated);
      setSavedAt(null);
      setEditingId(null);
        setSelectedIds(new Set());
      setSelectedEdgeIds(new Set());
      setViewKey((key) => key + 1);
    } catch (error) {
      const message = String(error);
      setStatus(/ENOENT|no such file|CANVAS_MISSING/i.test(message) ? "missing" : "error");
    }
  }, [canvasPath]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyDoc = useCallback((next: CanvasDoc, record = true) => {
    const prev = docRef.current;
    if (!prev || next === prev) return;
    if (record) historyRef.current = recordHistory(historyRef.current, prev);
    revisionRef.current += 1;
    docRef.current = next;
    setDoc(next);
    setDirty(true);
  }, []);

  const handleViewportChange = useCallback((viewport: CanvasViewport) => {
    const prev = docRef.current;
    if (!prev) return;
    const old = prev.viewport;
    if (old.x === viewport.x && old.y === viewport.y && old.zoom === viewport.zoom) return;
    const next = { ...prev, viewport };
    revisionRef.current += 1;
    docRef.current = next;
    setDoc(next);
    setDirty(true);
  }, []);

  const doSave = useCallback(async (force: boolean) => {
    const current = docRef.current;
    if (!current || statusRef.current !== "ready") return;
    if (savingRef.current) {
      pendingSaveRef.current = true;
      return;
    }
    savingRef.current = true;
    const revision = revisionRef.current;
    try {
      const result = await window.prism.saveCanvas(
        canvasPath,
        serializeCanvas(current),
        force ? null : modifiedAtRef.current,
      );
      if ("conflict" in result) {
        setConflict(true);
        return;
      }
      modifiedAtRef.current = result.modifiedAt;
      notifyCanvasSaved(vaultPath, canvasPath);
      if (revisionRef.current === revision) setDirty(false);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (error) {
      const message = String(error);
      if (/ENOENT|no such file|CANVAS_MISSING/i.test(message)) {
        setStatus("missing");
        showToast(t["canvas.missing"], "error");
      } else {
        showToast(t["canvas.saveFailed"], "error");
      }
    } finally {
      savingRef.current = false;
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        void doSave(false);
      }
    }
  }, [canvasPath, showToast, t, vaultPath]);

  useEffect(() => {
    if (status !== "ready" || !doc || !dirty) return;
    const delay = values.autosave_delay;
    const timer = window.setTimeout(() => { void doSave(false); }, delay);
    return () => window.clearTimeout(timer);
  }, [doc, dirty, doSave, status, values.autosave_delay]);

  // Closing a tab must not drop edits still sitting in the debounce window.
  useEffect(() => () => {
    const current = docRef.current;
    if (!current || !dirtyRef.current) return;
    void window.prism
      .saveCanvas(canvasPath, serializeCanvas(current), modifiedAtRef.current)
      .catch(() => {});
  }, [canvasPath]);

  const requestFocus = useCallback((target: CanvasDoc, id: string) => {
    const node = findNode(target, id);
    if (!node) return;
    focusNonceRef.current += 1;
    setFocusRequest({
      id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      nonce: focusNonceRef.current,
    });
  }, []);

  const handleSelectionChange = useCallback((nodeIds: string[], edgeIds: string[]) => {
    setSelectedIds((previous) => (sameSet(previous, nodeIds) ? previous : new Set(nodeIds)));
    setSelectedEdgeIds((previous) => (sameSet(previous, edgeIds) ? previous : new Set(edgeIds)));
    // Left-click focus: a single selected card, frame, or connection reveals its panel.
    if (nodeIds.length + edgeIds.length === 1) {
      const current = docRef.current;
      const isCard = nodeIds.length === 1 && current !== null && findNode(current, nodeIds[0]) !== undefined;
      const isFrame = nodeIds.length === 1 && current !== null && findGroup(current, nodeIds[0]) !== undefined;
      if (edgeIds.length === 1 || isCard || isFrame) setDetailOpen(true);
    }
  }, []);

  const insertAt = useCallback((position: BoardInsertPosition) => {
    const current = docRef.current;
    if (!current) return;
    const cascade = (insertCountRef.current % 5) * 24;
    insertCountRef.current += 1;
    const node = createNode({
      x: Math.round(position.x - NODE_WIDTH / 2 + cascade),
      y: Math.round(position.y - NODE_HEIGHT / 2 + cascade),
    });
    const next = addNode(current, node);
    applyDoc(next);
    setSelectedIds(new Set([node.id]));
    setSelectedEdgeIds(new Set());
    setEditingId(node.id);
    setDetailOpen(true);
    requestFocus(next, node.id);
  }, [applyDoc, requestFocus]);

  const insertPreset = useCallback((preset: CanvasPreset, position: BoardInsertPosition) => {
    const current = docRef.current;
    if (!current) return;
    const node = createNode({
      x: Math.round(position.x - preset.width / 2),
      y: Math.round(position.y - preset.height / 2),
      color: preset.color,
      fontSize: preset.fontSize,
      bold: preset.bold,
      align: preset.align,
      valign: preset.valign,
      width: preset.width,
      height: preset.height,
    });
    applyDoc(addNode(current, node));
    setSelectedIds(new Set([node.id]));
    setSelectedEdgeIds(new Set());
    setEditingId(node.id);
    setDetailOpen(true);
  }, [applyDoc]);

  const insertGroup = useCallback((bounds: NodeBounds) => {
    const current = docRef.current;
    if (!current) return;
    const group = createGroup({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: clampGroupWidth(Math.round(bounds.width)),
      height: clampGroupHeight(Math.round(bounds.height)),
    });
    applyDoc(addGroup(current, group));
    setSelectedIds(new Set([group.id]));
    setSelectedEdgeIds(new Set());
    setEditingId(null);
    setDrawGroupMode(false);
  }, [applyDoc]);

  const insertGroupAt = useCallback((position: BoardInsertPosition) => {
    insertGroup({
      x: Math.round(position.x - DEFAULT_GROUP_WIDTH / 2),
      y: Math.round(position.y - DEFAULT_GROUP_HEIGHT / 2),
      width: DEFAULT_GROUP_WIDTH,
      height: DEFAULT_GROUP_HEIGHT,
    });
  }, [insertGroup]);

  const frameSelection = useCallback(() => {
    const current = docRef.current;
    if (!current) return;
    const cards = current.nodes.filter((node) => selectedIds.has(node.id));
    if (cards.length < 2) return;
    const padding = 40;
    const minX = Math.min(...cards.map((node) => node.x));
    const minY = Math.min(...cards.map((node) => node.y));
    const maxX = Math.max(...cards.map((node) => node.x + node.width));
    const maxY = Math.max(...cards.map((node) => node.y + node.height));
    const frame = createGroup({
      x: Math.round(minX - padding),
      y: Math.round(minY - padding),
      width: clampGroupWidth(maxX - minX + padding * 2),
      height: clampGroupHeight(maxY - minY + padding * 2),
    });
    applyDoc(addGroup(current, frame));
    setSelectedIds(new Set([frame.id]));
    setSelectedEdgeIds(new Set());
    setDetailOpen(true);
  }, [applyDoc, selectedIds]);

  const openGroupRename = useCallback((id: string) => {
    const current = docRef.current;
    if (!current) return;
    const group = findGroup(current, id);
    if (group) setGroupForRename({ ...group });
  }, []);

  const renameGroup = useCallback((group: CanvasGroup, name: string) => {
    const current = docRef.current;
    if (!current) return;
    const latest = findGroup(current, group.id);
    const trimmed = name.trim();
    if (!latest || latest.name === trimmed) return;
    applyDoc(updateGroup(current, group.id, { name: trimmed }));
  }, [applyDoc]);

  const savePreset = useCallback((node: CanvasNode, name: string) => {
    setSetting("canvas_presets", [...values.canvas_presets, presetFromNode(node, name)]);
  }, [setSetting, values.canvas_presets]);

  const renamePreset = useCallback((preset: CanvasPreset, name: string) => {
    setSetting(
      "canvas_presets",
      values.canvas_presets.map((item) => (item.id === preset.id ? { ...item, name } : item)),
    );
  }, [setSetting, values.canvas_presets]);

  const handlePresetContextMenu = useCallback((preset: CanvasPreset, event: React.MouseEvent) => {
    openContextMenu(event, [
      {
        label: t["menu.rename"],
        icon: <Pencil size={14} />,
        onClick: () => setPresetForRename(preset),
      },
      {
        label: t["canvas.deletePreset"],
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => setSetting(
          "canvas_presets",
          values.canvas_presets.filter((item) => item.id !== preset.id),
        ),
      },
    ]);
  }, [openContextMenu, setSetting, t, values.canvas_presets]);

  const commitText = useCallback((id: string, text: string) => {
    setEditingId(null);
    const current = docRef.current;
    if (!current) return;
    const node = findNode(current, id);
    const nextText = text.trim();
    if (!node || node.text === nextText) return;
    applyDoc(updateNode(current, id, { text: nextText }));
  }, [applyDoc]);

  const moveEdgeLabel = useCallback((id: string, position: number) => {
    const current = docRef.current;
    if (!current) return;
    const edge = findEdge(current, id);
    if (!edge) return;
    const next = sanitizeLabelPosition(position);
    if (edge.labelPosition === next) return;
    applyDoc(updateEdge(current, id, { labelPosition: next }));
  }, [applyDoc]);

  const moveMany = useCallback((moves: NodeMove[]) => {
    const current = docRef.current;
    if (!current) return;
    const groupIds = new Set(current.groups.map((group) => group.id));
    const groupMoves = moves.filter((move) => groupIds.has(move.id));
    const nodeMoves = moves.filter((move) => !groupIds.has(move.id));
    let next = current;
    if (nodeMoves.length > 0) next = updateNodes(next, nodeMoves);
    if (groupMoves.length > 0) next = updateGroups(next, groupMoves);
    if (next !== current) applyDoc(next);
  }, [applyDoc]);

  const duplicateOne = useCallback((id: string) => {
    const current = docRef.current;
    if (!current) return;
    const node = findNode(current, id);
    if (!node) return;
    const result = duplicateNodes(current, [{ id, x: node.x + 24, y: node.y + 24 }]);
    if (!result) return;
    applyDoc(result.doc);
    setSelectedIds(new Set(result.ids));
    setSelectedEdgeIds(new Set());
    setEditingId(null);
  }, [applyDoc]);

  const resizeEnd = useCallback((id: string, bounds: NodeBounds) => {
    const current = docRef.current;
    if (!current) return;
    const node = findNode(current, id);
    if (node) {
      if (
        node.x === bounds.x && node.y === bounds.y
        && node.width === bounds.width && node.height === bounds.height
      ) return;
      applyDoc(updateNode(current, id, bounds));
      return;
    }
    const group = findGroup(current, id);
    if (!group) return;
    if (
      group.x === bounds.x && group.y === bounds.y
      && group.width === bounds.width && group.height === bounds.height
    ) return;
    applyDoc(updateGroup(current, id, bounds));
  }, [applyDoc]);

  const connect = useCallback((connection: Connection) => {
    const current = docRef.current;
    if (!current) return;
    if (connection.source === connection.target) return;
    if (hasConnection(current, connection.source, connection.target, connection.sourceHandle, connection.targetHandle)) return;
    applyDoc(addEdge(current, {
      id: newEdgeId(),
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      label: "",
      labelPosition: DEFAULT_EDGE_LABEL_POSITION,
      strokeWidth: DEFAULT_EDGE_WIDTH,
      lineStyle: DEFAULT_LINE_STYLE,
    }));
  }, [applyDoc]);

  const patchNode = useCallback((id: string, patch: CanvasNodePatch) => {
    const current = docRef.current;
    if (!current) return;
    applyDoc(updateNode(current, id, patch));
  }, [applyDoc]);

  const patchEdge = useCallback((id: string, patch: CanvasEdgePatch) => {
    const current = docRef.current;
    if (!current) return;
    const edge = findEdge(current, id);
    if (!edge) return;
    const unchanged = (Object.keys(patch) as (keyof CanvasEdgePatch)[])
      .every((key) => edge[key] === patch[key]);
    if (unchanged) return;
    applyDoc(updateEdge(current, id, patch));
  }, [applyDoc]);

  const patchFrame = useCallback((id: string, patch: CanvasGroupPatch) => {
    const current = docRef.current;
    if (!current) return;
    const frame = findGroup(current, id);
    if (!frame) return;
    const unchanged = (Object.keys(patch) as (keyof CanvasGroupPatch)[])
      .every((key) => frame[key] === patch[key]);
    if (unchanged) return;
    applyDoc(updateGroup(current, id, patch));
  }, [applyDoc]);

  const applyTarget = useCallback((target: CanvasTarget) => {
    setTargetPickerOpen(false);
    const current = docRef.current;
    if (!current || selectedIds.size !== 1) return;
    const id = [...selectedIds][0];
    const node = findNode(current, id);
    if (!node) return;
    const patch: CanvasNodePatch = { target };
    if (!node.text.trim()) patch.text = targetTitle(target);
    applyDoc(updateNode(current, id, patch));
  }, [applyDoc, selectedIds]);

  const openTarget = useCallback((id: string) => {
    const current = docRef.current;
    if (!current) return;
    const node = findNode(current, id);
    if (node?.target) onOpenTarget(node.target);
  }, [onOpenTarget]);

  const deleteIds = useCallback((ids: string[], edgeIds: string[]) => {
    const current = docRef.current;
    if (!current) return;
    const groupIds = new Set(current.groups.map((group) => group.id));
    const nodeIds = ids.filter((id) => !groupIds.has(id));
    const removedGroupIds = ids.filter((id) => groupIds.has(id));
    let next = current;
    if (nodeIds.length > 0) next = removeNodes(next, new Set(nodeIds));
    if (removedGroupIds.length > 0) next = removeGroups(next, new Set(removedGroupIds));
    if (edgeIds.length > 0) next = removeEdges(next, new Set(edgeIds));
    if (next === current) return;
    applyDoc(next);
    setSelectedIds(new Set());
    setSelectedEdgeIds(new Set());
    setEditingId(null);
  }, [applyDoc]);

  const deleteSelection = useCallback(() => {
    deleteIds([...selectedIds], [...selectedEdgeIds]);
  }, [deleteIds, selectedEdgeIds, selectedIds]);

  const selectAll = useCallback(() => {
    const current = docRef.current;
    if (!current) return;
    setSelectedIds(new Set([
      ...current.nodes.map((node) => node.id),
      ...current.groups.map((group) => group.id),
    ]));
    setSelectedEdgeIds(new Set());
  }, []);

  const applyHistoryDoc = useCallback((next: CanvasDoc) => {
    revisionRef.current += 1;
    docRef.current = next;
    setDoc(next);
    setDirty(true);
    setEditingId(null);
    setSelectedIds((previous) => {
      const kept = [...previous].filter((id) => findNode(next, id) !== undefined || findGroup(next, id) !== undefined);
      return kept.length === previous.size ? previous : new Set(kept);
    });
    setSelectedEdgeIds((previous) => {
      const kept = [...previous].filter((id) => next.edges.some((edge) => edge.id === id));
      return kept.length === previous.size ? previous : new Set(kept);
    });
  }, []);

  const undo = useCallback(() => {
    const current = docRef.current;
    if (!current) return;
    const result = undoHistory(historyRef.current, current);
    if (!result) return;
    historyRef.current = result.history;
    applyHistoryDoc(result.doc);
  }, [applyHistoryDoc]);

  const redo = useCallback(() => {
    const current = docRef.current;
    if (!current) return;
    const result = redoHistory(historyRef.current, current);
    if (!result) return;
    historyRef.current = result.history;
    applyHistoryDoc(result.doc);
  }, [applyHistoryDoc]);

  const startEdit = useCallback((id: string) => {
    setEditingId(id);
    setSelectedIds(new Set([id]));
    setSelectedEdgeIds(new Set());
    setDetailOpen(true);
  }, []);

  const fitView = useCallback(() => setFitSignal((value) => value + 1), []);

  const editSingleSelection = () => {
    if (selectedIds.size !== 1) return;
    const id = [...selectedIds][0];
    const current = docRef.current;
    const group = current ? findGroup(current, id) : undefined;
    if (group) {
      setGroupForRename({ ...group });
      return;
    }
    startEdit(id);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']")) return;
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (modifier && key === "s") {
      event.preventDefault();
      event.stopPropagation();
      void doSave(false);
      return;
    }
    if (modifier && key === "z") {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (modifier && key === "y") {
      event.preventDefault();
      event.stopPropagation();
      redo();
      return;
    }
    if (modifier && key === "a") {
      event.preventDefault();
      event.stopPropagation();
      selectAll();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    switch (event.key) {
      case "Delete":
      case "Backspace":
        event.preventDefault();
        deleteSelection();
        break;
      case "F2":
        if (selectedIds.size === 1) {
          event.preventDefault();
          editSingleSelection();
        }
        break;
      case "Enter":
        if (editingId) break;
        if (selectedIds.size === 1) {
          event.preventDefault();
          editSingleSelection();
        }
        break;
      case "Escape":
        if (drawGroupMode) {
          setDrawGroupMode(false);
          break;
        }
        setSelectedIds(new Set());
        setSelectedEdgeIds(new Set());
        break;
      default:
        break;
    }
  };

  const selectedNodes = useMemo(
    () => (doc ? doc.nodes.filter((node) => selectedIds.has(node.id)) : []),
    [doc, selectedIds],
  );

  const selectedNode: CanvasNode | null = doc && selectedNodes.length === 1 ? selectedNodes[0] : null;

  const selectedFrame: CanvasGroup | null = useMemo(
    () => (doc && selectedIds.size === 1 ? findGroup(doc, [...selectedIds][0]) ?? null : null),
    [doc, selectedIds],
  );

  const selectedEdge = useMemo(
    () => (doc && selectedEdgeIds.size === 1 ? findEdge(doc, [...selectedEdgeIds][0]) ?? null : null),
    [doc, selectedEdgeIds],
  );
  const edgeAutoSource = selectedEdge && doc
    ? findNode(doc, selectedEdge.source)?.text || selectedEdge.source
    : "";

  const hasDetailTarget = selectedNode !== null || selectedEdge !== null || selectedFrame !== null;
  const detailVisible = detailOpen && hasDetailTarget;

  const alignIds = useCallback((ids: string[], mode: AlignMode) => {
    const current = docRef.current;
    if (!current) return;
    const idSet = new Set(ids);
    const targets = current.nodes.filter((node) => idSet.has(node.id));
    if (targets.length < 2) return;
    const moves = alignNodes(targets, mode);
    if (moves.length > 0) applyDoc(updateNodes(current, moves));
  }, [applyDoc]);

  const distributeIds = useCallback((ids: string[], mode: DistributeMode) => {
    const current = docRef.current;
    if (!current) return;
    const idSet = new Set(ids);
    const targets = current.nodes.filter((node) => idSet.has(node.id));
    if (targets.length < 3) return;
    const moves = distributeNodes(targets, mode);
    if (moves.length > 0) applyDoc(updateNodes(current, moves));
  }, [applyDoc]);

  const alignSelection = useCallback((mode: AlignMode) => {
    alignIds([...selectedIds], mode);
  }, [alignIds, selectedIds]);

  const distributeSelection = useCallback((mode: DistributeMode) => {
    distributeIds([...selectedIds], mode);
  }, [distributeIds, selectedIds]);

  const handleNodeContextMenu = useCallback((id: string, event: React.MouseEvent) => {
    const current = docRef.current;
    if (!current) return;
    const group = findGroup(current, id);
    if (group) {
      const wasSelected = selectedIds.has(id);
      if (!wasSelected) {
        setSelectedIds(new Set([id]));
        setSelectedEdgeIds(new Set());
      }
      const ids = wasSelected ? [...selectedIds] : [id];
      const edgeIds = wasSelected ? [...selectedEdgeIds] : [];
      openContextMenu(event, [
        {
          label: t["canvas.renameGroup"],
          icon: <Pencil size={14} />,
          onClick: () => setGroupForRename({ ...group }),
        },
        buildColorMenuItem(t, {
          label: t["canvas.frameColor"],
          autoLabel: t["collections.colorAuto"],
          autoSource: group.name || group.id,
          autoBar: AUTO_SWATCH_COLOR,
          current: group.color,
          onSelect: (color) => {
            const latest = docRef.current;
            if (!latest) return;
            applyDoc(updateGroup(latest, id, { color }));
          },
        }),
        {
          label: ids.length + edgeIds.length > 1 ? t["canvas.deleteSelected"] : t["canvas.deleteGroup"],
          icon: <Trash2 size={14} />,
          danger: true,
          onClick: () => deleteIds(ids, edgeIds),
        },
      ]);
      return;
    }
    const node = findNode(current, id);
    if (!node) return;
    // Right-clicking an unselected card selects it alone; right-clicking one of
    // several selected cards keeps the group so the menu can act on all of them.
    const wasSelected = selectedIds.has(id);
    if (!wasSelected) {
      setSelectedIds(new Set([id]));
      setSelectedEdgeIds(new Set());
    }
    const selectionIds = wasSelected ? [...selectedIds] : [id];
    const nodeIds = selectionIds.filter((nodeId) => findGroup(current, nodeId) === undefined);
    const edgeIds = wasSelected ? [...selectedEdgeIds] : [];
    const multi = nodeIds.length > 1;

    const items: MenuItem[] = [
      {
        label: t["canvas.editText"],
        icon: <Pencil size={14} />,
        onClick: () => startEdit(id),
      },
    ];
    if (node.target) {
      items.push(
        {
          label: t["canvas.openTarget"],
          icon: <ExternalLink size={14} />,
          onClick: () => openTarget(id),
        },
        {
          label: t["canvas.changeTarget"],
          icon: <Link2 size={14} />,
          onClick: () => {
            setSelectedIds(new Set([id]));
            setSelectedEdgeIds(new Set());
            setTargetPickerOpen(true);
          },
        },
        {
          label: t["canvas.unlinkTarget"],
          icon: <Unlink size={14} />,
          onClick: () => patchNode(id, { target: null }),
        },
      );
    } else {
      items.push({
        label: t["canvas.linkTarget"],
        icon: <Link2 size={14} />,
        onClick: () => {
          setSelectedIds(new Set([id]));
          setSelectedEdgeIds(new Set());
          setTargetPickerOpen(true);
        },
      });
    }
    if (!multi) {
      items.push({
        label: t["canvas.duplicateCard"],
        icon: <Copy size={14} />,
        onClick: () => duplicateOne(id),
      });
      items.push(buildColorMenuItem(t, {
        label: t["canvas.cardColor"],
        autoLabel: t["collections.colorAuto"],
        autoSource: node.text || node.id,
        autoBar: AUTO_SWATCH_COLOR,
        current: node.color,
        onSelect: (color) => patchNode(id, { color }),
      }));
      items.push({
        label: t["canvas.savePreset"],
        icon: <BookmarkPlus size={14} />,
        onClick: () => {
          if (values.canvas_presets.length >= MAX_CANVAS_PRESETS) {
            showToast(t["canvas.presetFull"], "error");
            return;
          }
          setPresetForSave(node);
        },
      });
    }
    if (nodeIds.length >= 2) {
      items.push({
        label: t["canvas.align"],
        icon: <AlignStartVertical size={14} />,
        children: [
          { label: t["canvas.alignLeft"], icon: <AlignStartVertical size={14} />, onClick: () => alignIds(nodeIds, "left") },
          { label: t["canvas.alignCenterX"], icon: <AlignCenterVertical size={14} />, onClick: () => alignIds(nodeIds, "centerX") },
          { label: t["canvas.alignRight"], icon: <AlignEndVertical size={14} />, onClick: () => alignIds(nodeIds, "right") },
          { label: t["canvas.alignTop"], icon: <AlignStartHorizontal size={14} />, onClick: () => alignIds(nodeIds, "top") },
          { label: t["canvas.alignCenterY"], icon: <AlignCenterHorizontal size={14} />, onClick: () => alignIds(nodeIds, "centerY") },
          { label: t["canvas.alignBottom"], icon: <AlignEndHorizontal size={14} />, onClick: () => alignIds(nodeIds, "bottom") },
        ],
      });
    }
    if (nodeIds.length >= 3) {
      items.push({
        label: t["canvas.distribute"],
        icon: <AlignHorizontalSpaceBetween size={14} />,
        children: [
          { label: t["canvas.distributeX"], icon: <AlignHorizontalSpaceBetween size={14} />, onClick: () => distributeIds(nodeIds, "horizontal") },
          { label: t["canvas.distributeY"], icon: <AlignVerticalSpaceBetween size={14} />, onClick: () => distributeIds(nodeIds, "vertical") },
        ],
      });
    }
    items.push({
      label: selectionIds.length + edgeIds.length > 1
        ? t["canvas.deleteSelected"]
        : t["canvas.deleteCard"],
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: () => deleteIds(selectionIds, edgeIds),
    });
    openContextMenu(event, items);
  }, [
    alignIds, applyDoc, deleteIds, distributeIds, duplicateOne, openContextMenu, openTarget, patchNode,
    showToast, selectedEdgeIds, selectedIds, startEdit, t, values.canvas_presets,
  ]);

  const handleEdgeContextMenu = useCallback((id: string, event: React.MouseEvent) => {
    const current = docRef.current;
    if (!current) return;
    const edge = findEdge(current, id);
    if (!edge) return;
    const wasSelected = selectedEdgeIds.has(id);
    if (!wasSelected) {
      setSelectedIds(new Set());
      setSelectedEdgeIds(new Set([id]));
    }
    const edgeIds = wasSelected ? [...selectedEdgeIds] : [id];
    const sourceNode = findNode(current, edge.source);
    const items: MenuItem[] = [
      buildColorMenuItem(t, {
        label: t["canvas.edgeColor"],
        autoLabel: t["collections.colorAuto"],
        autoSource: sourceNode?.text || edge.source,
        autoBar: AUTO_SWATCH_COLOR,
        current: edge.color,
        onSelect: (color) => {
          const latest = docRef.current;
          if (!latest) return;
          applyDoc(updateEdge(latest, id, { color }));
        },
      }),
      {
        label: t["canvas.strokeWidth"],
        icon: <Weight size={14} />,
        children: EDGE_WIDTHS.map((width) => ({
          label: t[EDGE_WIDTH_LABEL_KEYS[width]],
          checked: edge.strokeWidth === width,
          onClick: () => patchEdge(id, { strokeWidth: width }),
        })),
      },
      {
        label: t["canvas.lineStyle"],
        icon: <Spline size={14} />,
        children: LINE_STYLES.map((style) => ({
          label: style === "solid" ? t["canvas.lineSolid"] : t["canvas.lineDashed"],
          checked: edge.lineStyle === style,
          onClick: () => patchEdge(id, { lineStyle: style }),
        })),
      },
      {
        label: edgeIds.length > 1 ? t["canvas.deleteSelected"] : t["canvas.deleteEdge"],
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => deleteIds([], edgeIds),
      },
    ];
    openContextMenu(event, items);
  }, [applyDoc, deleteIds, openContextMenu, patchEdge, selectedEdgeIds, t]);

  const handlePaneContextMenu = useCallback((
    event: React.MouseEvent,
    position: BoardInsertPosition,
  ) => {
    if (!docRef.current) return;
    const nodeIds = [...selectedIds];
    const edgeIds = [...selectedEdgeIds];
    const items: MenuItem[] = [
      {
        label: t["canvas.addCard"],
        icon: <Plus size={14} />,
        onClick: () => insertAt(position),
      },
      {
        label: t["canvas.addGroup"],
        icon: <Frame size={14} />,
        onClick: () => insertGroupAt(position),
      },
      {
        label: t["canvas.selectAll"],
        icon: <BoxSelect size={14} />,
        onClick: selectAll,
      },
      {
        label: t["canvas.fitView"],
        icon: <Maximize2 size={14} />,
        onClick: fitView,
      },
    ];
    if (nodeIds.length + edgeIds.length > 0) {
      items.push({
        label: t["canvas.deleteSelected"],
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => deleteIds(nodeIds, edgeIds),
      });
    }
    openContextMenu(event, items);
  }, [
    deleteIds, fitView, insertAt, insertGroupAt, openContextMenu, selectAll, selectedEdgeIds,
    selectedIds, t,
  ]);

  const toolbar = useMemo<ToolbarContribution>(() => ({
    title: (
      <>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBackToLibrary}
          title={t["workspace.backToLibrary"]}
        >
          <ArrowLeft size={15} />
        </Button>
        <span className="min-w-0 max-w-full truncate text-body font-medium text-primary" title={canvasPath}>
          {title}
        </span>
        {dirty ? (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] flex-shrink-0" title={t["editor.unsaved"]} />
        ) : savedAt ? (
          <span className="text-meta text-faint flex-shrink-0 whitespace-nowrap">
            {t["canvas.savedAt"].replace("{time}", savedAt)}
          </span>
        ) : null}
      </>
    ),
    controls: (
      <>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setInsertSignal((value) => value + 1)}
          title={t["canvas.addCard"]}
        >
          <Plus size={15} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          active={drawGroupMode}
          onClick={() => setDrawGroupMode((value) => !value)}
          title={t["canvas.addGroup"]}
        >
          <Frame size={15} />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={fitView} title={t["canvas.fitView"]}>
          <Maximize2 size={15} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!hasDetailTarget}
          active={detailOpen && hasDetailTarget}
          onClick={() => setDetailOpen((open) => !open)}
          title={t["canvas.details"]}
        >
          <PanelRight size={15} />
        </Button>
      </>
    ),
    actions: (
      <>
        <Button
          variant="ghost"
          size="icon-sm"
          active={splitOpen}
          onClick={onToggleSplit}
          title={splitOpen ? t["workspace.closeSplit"] : t["workspace.openSplit"]}
        >
          <Columns3 size={15} />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClose} title={t["editor.closeTab"]}>
          <X size={15} />
        </Button>
      </>
    ),
  }), [
    canvasPath, detailOpen, dirty, drawGroupMode, fitView, hasDetailTarget, onBackToLibrary,
    onClose, onToggleSplit, savedAt, splitOpen, t, title,
  ]);

  useToolbarContribution(toolbarScope, toolbar);

  const handleMouseDown = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']")) return;
    rootRef.current?.focus();
  };

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="application"
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      className="relative h-full w-full outline-none"
    >
      {status === "loading" && (
        <div className="h-full flex flex-col items-center justify-center gap-2 text-muted">
          <Spinner size={22} />
          <span className="text-caption">{t["canvas.loading"]}</span>
        </div>
      )}

      {(status === "missing" || status === "error") && (
        <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center">
          <TriangleAlert size={26} className="text-warning" />
          <p className="text-body text-secondary max-w-md">
            {status === "missing" ? t["canvas.missing"] : t["canvas.loadFailed"]}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onBackToLibrary}>
              {t["workspace.backToLibrary"]}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t["editor.closeTab"]}
            </Button>
          </div>
        </div>
      )}

      {status === "ready" && doc && (
        <>
          <BoardFlow
            key={viewKey}
            doc={doc}
            selectedIds={selectedIds}
            selectedEdgeIds={selectedEdgeIds}
            editingId={editingId}
            placeholder={t["canvas.textPlaceholder"]}
            groupPlaceholder={t["canvas.groupDefault"]}
            drawGroupMode={drawGroupMode}
            focusRequest={focusRequest}
            fitSignal={fitSignal}
            insertSignal={insertSignal}
            showMiniMap={!detailVisible}
            onSelectionChange={handleSelectionChange}
            onFocusItem={() => setDetailOpen(true)}
            onStartEdit={startEdit}
            onCommitText={commitText}
            onCancelEdit={() => setEditingId(null)}
            onOpenTarget={openTarget}
            onMoveMany={moveMany}
            onResizeEnd={resizeEnd}
            onConnect={connect}
            onMoveEdgeLabel={moveEdgeLabel}
            onNodeContextMenu={handleNodeContextMenu}
            onEdgeContextMenu={handleEdgeContextMenu}
            onPaneContextMenu={handlePaneContextMenu}
            onInsertAt={insertAt}
            onDropPreset={insertPreset}
            onCreateGroup={insertGroup}
            onRenameGroup={openGroupRename}
            onViewportChange={handleViewportChange}
          />
          <PresetBar presets={values.canvas_presets} onContextMenu={handlePresetContextMenu} />

          {doc.nodes.length === 0 && doc.groups.length === 0 && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto flex w-72 flex-col items-center gap-2 rounded-card border border-line/60 bg-surface/95 px-6 py-7 text-center shadow-popover">
                <Frame size={26} className="text-muted" />
                <p className="text-body font-medium text-primary">{t["canvas.emptyBoard"]}</p>
                <p className="text-caption text-muted">{t["canvas.emptyBoardHint"]}</p>
                <Button
                  variant="primary"
                  size="sm"
                  className="mt-1"
                  onClick={() => setInsertSignal((value) => value + 1)}
                >
                  <Plus size={13} />
                  {t["canvas.addCard"]}
                </Button>
              </div>
            </div>
          )}

          {detailVisible && selectedNode && (
            <NodeDetailPanel
              node={selectedNode}
              onChangeText={(text) => patchNode(selectedNode.id, { text })}
              onChangeNotes={(notes) => patchNode(selectedNode.id, { notes })}
              onChangeColor={(color) => patchNode(selectedNode.id, { color })}
              onChangeAlign={(align) => patchNode(selectedNode.id, { align })}
              onChangeVAlign={(valign) => patchNode(selectedNode.id, { valign })}
              onChangeFontSize={(fontSize) => patchNode(selectedNode.id, { fontSize })}
              onChangeBold={(bold) => patchNode(selectedNode.id, { bold })}
              onChangeTarget={() => setTargetPickerOpen(true)}
              onOpenTarget={() => openTarget(selectedNode.id)}
              onUnlinkTarget={() => patchNode(selectedNode.id, { target: null })}
              onClose={() => setDetailOpen(false)}
            />
          )}

          {detailVisible && selectedEdge && !selectedNode && (
            <EdgeDetailPanel
              key={selectedEdge.id}
              edge={selectedEdge}
              autoSource={edgeAutoSource}
              onChangeLabel={(label) => patchEdge(selectedEdge.id, { label })}
              onChangeColor={(color) => patchEdge(selectedEdge.id, { color })}
              onChangeWidth={(strokeWidth) => patchEdge(selectedEdge.id, { strokeWidth })}
              onChangeLineStyle={(lineStyle) => patchEdge(selectedEdge.id, { lineStyle })}
              onClose={() => setDetailOpen(false)}
            />
          )}

          {detailVisible && selectedFrame && (
            <FrameDetailPanel
              key={selectedFrame.id}
              frame={selectedFrame}
              onChangeName={(name) => patchFrame(selectedFrame.id, { name: name.trim() })}
              onChangeColor={(color) => patchFrame(selectedFrame.id, { color })}
              onChangeMoveContents={(moveContents) => patchFrame(selectedFrame.id, { moveContents })}
              onChangeLocked={(locked) => patchFrame(selectedFrame.id, { locked })}
              onClose={() => setDetailOpen(false)}
            />
          )}

          {selectedNodes.length >= 2 && (
            <SelectionToolbar
              count={selectedNodes.length}
              onAlign={alignSelection}
              onDistribute={distributeSelection}
              onCreateFrame={frameSelection}
            />
          )}

          {targetPickerOpen && selectedNode && (
            <TargetPickerModal
              vaultPath={vaultPath}
              currentCanvasPath={canvasPath}
              onPick={applyTarget}
              onClose={() => setTargetPickerOpen(false)}
            />
          )}

        </>
      )}

      <Modal
        open={conflict}
        onClose={() => setConflict(false)}
        position="center"
        title={t["canvas.conflictTitle"]}
        icon={TriangleAlert}
        size="sm"
        footer={(
          <>
            <Button variant="secondary" size="sm" onClick={() => { setConflict(false); void load(); }}>
              {t["canvas.reload"]}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => { setConflict(false); void doSave(true); }}
            >
              {t["canvas.overwrite"]}
            </Button>
          </>
        )}
      >
        <p className="text-body text-primary">{t["canvas.conflictMessage"]}</p>
      </Modal>

      <RenameModal
        open={presetForSave !== null}
        title={t["canvas.savePreset"]}
        icon={BookmarkPlus}
        initialValue={presetForSave?.text.trim().split("\n")[0]?.slice(0, 24) ?? ""}
        placeholder={t["canvas.presetNamePlaceholder"]}
        onSubmit={(name) => {
          if (presetForSave) savePreset({ ...presetForSave }, name);
        }}
        onClose={() => setPresetForSave(null)}
      />

      <RenameModal
        open={presetForRename !== null}
        title={t["menu.rename"]}
        initialValue={presetForRename?.name ?? ""}
        placeholder={t["canvas.presetNamePlaceholder"]}
        onSubmit={(name) => {
          if (presetForRename) renamePreset(presetForRename, name);
        }}
        onClose={() => setPresetForRename(null)}
      />

      <RenameModal
        open={groupForRename !== null}
        title={t["canvas.renameGroup"]}
        initialValue={groupForRename?.name ?? ""}
        placeholder={t["canvas.groupNamePlaceholder"]}
        onSubmit={(name) => {
          if (groupForRename) renameGroup(groupForRename, name);
        }}
        onClose={() => setGroupForRename(null)}
      />
    </div>
  );
}
