import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  ViewportPortal,
  applyNodeChanges,
  useReactFlow,
  ConnectionMode,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { CanvasBackground, CanvasPreset } from "../../shared/settings";
import { useSettings } from "../../lib/settings";
import { PRESET_MIME } from "../../lib/canvas/presets";
import {
  DEFAULT_GROUP_HEIGHT,
  DEFAULT_GROUP_WIDTH,
  type CanvasDoc,
  type CanvasViewport,
} from "../../lib/canvas/model";
import BoardNode, { type BoardFlowNode, type NodeBounds } from "./nodes/BoardNode";
import GroupNode, { type GroupFlowNode } from "./nodes/GroupNode";
import ArrowEdge, { type ArrowFlowEdge } from "./edges/ArrowEdge";

const nodeTypes = { board: BoardNode, frame: GroupNode } satisfies NodeTypes;

type CanvasFlowNode = BoardFlowNode | GroupFlowNode;
const edgeTypes = { arrow: ArrowEdge } satisfies EdgeTypes;

const BG_VARIANT: Record<Exclude<CanvasBackground, "none">, BackgroundVariant> = {
  dots: BackgroundVariant.Dots,
  lines: BackgroundVariant.Lines,
  cross: BackgroundVariant.Cross,
};

export interface FocusRequest {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nonce: number;
}

export interface BoardInsertPosition {
  x: number;
  y: number;
}

interface Props {
  doc: CanvasDoc;
  selectedIds: Set<string>;
  selectedEdgeIds: Set<string>;
  editingId: string | null;
  placeholder: string;
  focusRequest: FocusRequest | null;
  fitSignal: number;
  insertSignal: number;
  showMiniMap: boolean;
  groupPlaceholder: string;
  drawGroupMode: boolean;
  onCreateGroup: (bounds: NodeBounds) => void;
  onRenameGroup: (id: string) => void;
  onSelectionChange: (nodeIds: string[], edgeIds: string[]) => void;
  onFocusItem: () => void;
  onStartEdit: (id: string) => void;
  onCommitText: (id: string, text: string) => void;
  onCancelEdit: () => void;
  onOpenTarget: (id: string) => void;
  onMoveMany: (moves: { id: string; x: number; y: number }[]) => void;
  onResizeEnd: (id: string, bounds: NodeBounds) => void;
  onConnect: (connection: Connection) => void;
  onMoveEdgeLabel: (id: string, position: number) => void;
  onNodeContextMenu: (id: string, event: React.MouseEvent) => void;
  onEdgeContextMenu: (id: string, event: React.MouseEvent) => void;
  onPaneContextMenu: (event: React.MouseEvent, position: BoardInsertPosition) => void;
  onInsertAt: (position: BoardInsertPosition) => void;
  onDropPreset: (preset: CanvasPreset, position: BoardInsertPosition) => void;
  onViewportChange: (viewport: CanvasViewport) => void;
}

interface Handlers {
  onSelectionChange: (nodeIds: string[], edgeIds: string[]) => void;
  onRenameGroup: (id: string) => void;
  onFocusItem: () => void;
  onStartEdit: (id: string) => void;
  onCommitText: (id: string, text: string) => void;
  onCancelEdit: () => void;
  onOpenTarget: (id: string) => void;
  onMoveMany: (moves: { id: string; x: number; y: number }[]) => void;
  onResizeEnd: (id: string, bounds: NodeBounds) => void;
  onConnect: (connection: Connection) => void;
  onMoveEdgeLabel: (id: string, position: number) => void;
  onNodeContextMenu: (id: string, event: React.MouseEvent) => void;
  onEdgeContextMenu: (id: string, event: React.MouseEvent) => void;
  onPaneContextMenu: (event: React.MouseEvent, position: BoardInsertPosition) => void;
  onInsertAt: (position: BoardInsertPosition) => void;
  onDropPreset: (preset: CanvasPreset, position: BoardInsertPosition) => void;
  onViewportChange: (viewport: CanvasViewport) => void;
}

function FlowInner({
  doc,
  selectedIds,
  selectedEdgeIds,
  editingId,
  placeholder,
  focusRequest,
  fitSignal,
  insertSignal,
  showMiniMap,
  groupPlaceholder,
  drawGroupMode,
  onCreateGroup,
  onRenameGroup,
  onSelectionChange,
  onFocusItem,
  onStartEdit,
  onCommitText,
  onCancelEdit,
  onOpenTarget,
  onMoveMany,
  onResizeEnd,
  onConnect,
  onMoveEdgeLabel,
  onNodeContextMenu,
  onEdgeContextMenu,
  onPaneContextMenu,
  onInsertAt,
  onDropPreset,
  onViewportChange,
}: Props) {
  const { values } = useSettings();
  const minimapPosition = values.canvas_minimap_position;
  const { fitView, setCenter, setViewport, getNodes, screenToFlowPosition } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  const handlers = useRef<Handlers>({
    onSelectionChange,
    onRenameGroup,
    onFocusItem,
    onStartEdit,
    onCommitText,
    onCancelEdit,
    onOpenTarget,
    onMoveMany,
    onResizeEnd,
    onConnect,
    onMoveEdgeLabel,
    onNodeContextMenu,
    onEdgeContextMenu,
    onPaneContextMenu,
    onInsertAt,
    onDropPreset,
    onViewportChange,
  });
  handlers.current = {
    onSelectionChange,
    onRenameGroup,
    onFocusItem,
    onStartEdit,
    onCommitText,
    onCancelEdit,
    onOpenTarget,
    onMoveMany,
    onResizeEnd,
    onConnect,
    onMoveEdgeLabel,
    onNodeContextMenu,
    onEdgeContextMenu,
    onPaneContextMenu,
    onInsertAt,
    onDropPreset,
    onViewportChange,
  };

  // During a drag React Flow owns the live positions; the committed doc wins on
  // stop. Selection is controlled so document rebuilds do not clear it.
  const baseNodes = useMemo<CanvasFlowNode[]>(() => {
    const groupNodes: GroupFlowNode[] = doc.groups.map((group) => ({
      id: group.id,
      type: "frame",
      position: { x: group.x, y: group.y },
      selected: selectedIds.has(group.id),
      style: { width: group.width, height: group.height },
      measured: { width: group.width, height: group.height },
      // Frames sit behind cards and edges; manual z-index mode keeps a selected
      // frame from being elevated over its contents.
      zIndex: -1,
      connectable: false,
      draggable: !group.locked,
      data: {
        group,
        placeholder: groupPlaceholder,
        resizable: selectedIds.size === 1 && selectedIds.has(group.id) && !group.locked,
        onRename: () => handlers.current.onRenameGroup(group.id),
        onResizeEnd: (bounds: NodeBounds) => handlers.current.onResizeEnd(group.id, bounds),
        onInsertCardAt: (position: { x: number; y: number }) => handlers.current.onInsertAt(position),
      },
    }));
    const cardNodes: BoardFlowNode[] = doc.nodes.map((node) => ({
      id: node.id,
      type: "board",
      position: { x: node.x, y: node.y },
      selected: selectedIds.has(node.id),
      style: { width: node.width, height: node.height },
      // Dimensions are known from the model. Supplying them keeps React Flow from
      // resetting measurement (and handle bounds) whenever we rebuild node
      // objects, which otherwise breaks an immediate drag with error #015.
      measured: { width: node.width, height: node.height },
      data: {
        node,
        editing: node.id === editingId,
        resizable: selectedIds.size === 1 && selectedIds.has(node.id) && node.id !== editingId,
        placeholder,
        onStartEdit: () => handlers.current.onStartEdit(node.id),
        onCommitText: (text: string) => handlers.current.onCommitText(node.id, text),
        onCancelEdit: () => handlers.current.onCancelEdit(),
        onOpenTarget: () => handlers.current.onOpenTarget(node.id),
        onResizeEnd: (bounds: NodeBounds) => handlers.current.onResizeEnd(node.id, bounds),
      },
    }));
    return [...groupNodes, ...cardNodes];
  }, [doc, selectedIds, editingId, placeholder, groupPlaceholder]);

  const baseEdges = useMemo<ArrowFlowEdge[]>(() => {
    return doc.edges.map((edge) => {
      const color = edge.color || "";
      const selected = selectedEdgeIds.has(edge.id);
      const markerSize = Math.round(12 + 4 * edge.strokeWidth);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle || "right",
        targetHandle: edge.targetHandle || "left",
        type: "arrow",
        selected,
        data: {
          color,
          label: edge.label,
          labelPosition: edge.labelPosition,
          strokeWidth: edge.strokeWidth,
          lineStyle: edge.lineStyle,
          onMove: (position: number) => handlers.current.onMoveEdgeLabel(edge.id, position),
          onSelect: () => {
            handlers.current.onFocusItem();
            handlers.current.onSelectionChange([], [edge.id]);
          },
          onContextMenu: (event: React.MouseEvent) => {
            handlers.current.onEdgeContextMenu(edge.id, event);
          },
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          markerUnits: "userSpaceOnUse",
          width: markerSize,
          height: markerSize,
          color: selected ? "var(--accent)" : color || "rgb(var(--c-strong))",
        },
      };
    });
  }, [doc, selectedEdgeIds]);

  const [nodes, setNodes] = useState<CanvasFlowNode[]>(baseNodes);

  useEffect(() => {
    setNodes(baseNodes);
  }, [baseNodes]);

  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const selectedEdgeIdsRef = useRef(selectedEdgeIds);
  selectedEdgeIdsRef.current = selectedEdgeIds;

  // The editor owns selection (document rebuilds drive the `selected` flags), so
  // translate React Flow's select changes back into node / edge id updates.
  const handleNodesChange = useCallback((changes: NodeChange<CanvasFlowNode>[]) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
    let next: Set<string> | null = null;
    for (const change of changes) {
      if (change.type !== "select") continue;
      if (!next) next = new Set(selectedIdsRef.current);
      if (change.selected) next.add(change.id);
      else next.delete(change.id);
    }
    if (!next) return;
    selectedIdsRef.current = next;
    handlers.current.onSelectionChange([...next], [...selectedEdgeIdsRef.current]);
  }, []);

  const handleEdgesChange = useCallback((changes: EdgeChange<ArrowFlowEdge>[]) => {
    let next: Set<string> | null = null;
    for (const change of changes) {
      if (change.type !== "select") continue;
      if (!next) next = new Set(selectedEdgeIdsRef.current);
      if (change.selected) next.add(change.id);
      else next.delete(change.id);
    }
    if (!next) return;
    selectedEdgeIdsRef.current = next;
    handlers.current.onSelectionChange([...selectedIdsRef.current], [...next]);
  }, []);

  // Dragging a frame carries the cards fully inside it. React Flow moves only
  // the selected nodes, so followers are translated locally during the drag and
  // committed together with the selection on drop.
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const followRef = useRef<{ id: string; x: number; y: number }[] | null>(null);

  const handleDragStart = useCallback((
    _event: MouseEvent | TouchEvent,
    node: CanvasFlowNode,
    dragged: CanvasFlowNode[],
  ) => {
    dragStartRef.current = { x: node.position.x, y: node.position.y };
    followRef.current = null;
    const current = docRef.current;
    if (!current || current.groups.length === 0) return;
    const draggedIds = new Set(dragged.map((item) => item.id));
    draggedIds.add(node.id);
    const groups = current.groups.filter((group) => draggedIds.has(group.id) && group.moveContents);
    if (groups.length === 0) return;
    const followers: { id: string; x: number; y: number }[] = [];
    for (const card of current.nodes) {
      if (draggedIds.has(card.id)) continue;
      const inside = groups.some((group) =>
        card.x >= group.x
        && card.y >= group.y
        && card.x + card.width <= group.x + group.width
        && card.y + card.height <= group.y + group.height);
      if (inside) followers.push({ id: card.id, x: card.x, y: card.y });
    }
    followRef.current = followers.length > 0 ? followers : null;
  }, []);

  const handleDrag = useCallback((_event: MouseEvent | TouchEvent, node: CanvasFlowNode) => {
    const start = dragStartRef.current;
    const followers = followRef.current;
    if (!start || !followers) return;
    const dx = node.position.x - start.x;
    const dy = node.position.y - start.y;
    const origins = new Map(followers.map((item) => [item.id, item]));
    setNodes((prev) => prev.map((item) => {
      const origin = origins.get(item.id);
      if (!origin) return item;
      const x = origin.x + dx;
      const y = origin.y + dy;
      if (item.position.x === x && item.position.y === y) return item;
      return { ...item, position: { x, y } };
    }));
  }, []);

  const handleDragStop = useCallback((_event: MouseEvent | TouchEvent, node: CanvasFlowNode) => {
    dragStartRef.current = null;
    const followers = followRef.current;
    followRef.current = null;
    const current = docRef.current;
    if (!current) return;
    const known = new Set(current.nodes.map((item) => item.id));
    for (const group of current.groups) known.add(group.id);
    const followIds = new Set(followers?.map((item) => item.id) ?? []);
    const moves = getNodes()
      .filter((item) => (item.selected || item.id === node.id || followIds.has(item.id)) && known.has(item.id))
      .map((item) => ({ id: item.id, x: item.position.x, y: item.position.y }));
    if (moves.length === 0) return;
    handlers.current.onMoveMany(moves);
  }, [getNodes]);

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    const { source, target, sourceHandle, targetHandle } = connection;
    if (source === target) return false;
    return !docRef.current.edges.some((edge) =>
      edge.source === source
      && edge.target === target
      && (edge.sourceHandle ?? null) === (sourceHandle ?? null)
      && (edge.targetHandle ?? null) === (targetHandle ?? null));
  }, []);

  const handleConnect = useCallback((connection: Connection) => {
    handlers.current.onConnect(connection);
  }, []);

  const lastFocus = useRef<number | null>(null);
  useEffect(() => {
    if (!focusRequest || lastFocus.current === focusRequest.nonce) return;
    lastFocus.current = focusRequest.nonce;
    setCenter(
      focusRequest.x + focusRequest.width / 2,
      focusRequest.y + focusRequest.height / 2,
      { zoom: 1, duration: 250 },
    );
  }, [focusRequest, setCenter]);

  const lastFit = useRef(0);
  useEffect(() => {
    if (fitSignal <= lastFit.current) return;
    lastFit.current = fitSignal;
    const raf = requestAnimationFrame(() => {
      if (docRef.current.nodes.length === 0 && docRef.current.groups.length === 0) {
        void setViewport({ x: 0, y: 0, zoom: 1 });
      } else {
        void fitView({ padding: 0.2, duration: 250 });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [fitSignal, fitView, setViewport]);

  const lastInsert = useRef(0);
  useEffect(() => {
    if (insertSignal <= lastInsert.current) return;
    lastInsert.current = insertSignal;
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const position = screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    handlers.current.onInsertAt(position);
  }, [insertSignal, screenToFlowPosition]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(PRESET_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const raw = event.dataTransfer.getData(PRESET_MIME);
    if (!raw) return;
    event.preventDefault();
    let preset: CanvasPreset;
    try {
      preset = JSON.parse(raw) as CanvasPreset;
    } catch {
      return;
    }
    if (!preset || typeof preset.width !== "number" || typeof preset.height !== "number") return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    handlers.current.onDropPreset(preset, position);
  }, [screenToFlowPosition]);

  const handleDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (drawGroupMode) return;
    const target = event.target as HTMLElement;
    if (target.closest(".react-flow__node") || target.closest(".react-flow__edge")) return;
    if (target.closest(".react-flow__edgelabel-renderer")) return;
    if (!target.closest(".react-flow__pane")) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    handlers.current.onInsertAt(position);
  }, [drawGroupMode, screenToFlowPosition]);

  // Frame drawing is a modal gesture: swallow the pane pointer-down and track
  // the pointer on the window so the rectangle survives leaving the wrapper.
  const [drawRect, setDrawRect] = useState<NodeBounds | null>(null);

  const handleDrawPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawGroupMode || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest(".react-flow__panel")) return;
    event.preventDefault();
    event.stopPropagation();
    const start = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setDrawRect({ x: start.x, y: start.y, width: 0, height: 0 });

    const handleMove = (moveEvent: PointerEvent) => {
      const point = screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
      setDrawRect({
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y),
      });
    };
    const finish = (upEvent: PointerEvent | null) => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
      setDrawRect(null);
      if (!upEvent) return;
      const point = screenToFlowPosition({ x: upEvent.clientX, y: upEvent.clientY });
      const width = Math.round(Math.abs(point.x - start.x));
      const height = Math.round(Math.abs(point.y - start.y));
      const bounds: NodeBounds = width < 60 || height < 60
        ? {
          x: Math.round(start.x),
          y: Math.round(start.y),
          width: DEFAULT_GROUP_WIDTH,
          height: DEFAULT_GROUP_HEIGHT,
        }
        : {
          x: Math.round(Math.min(start.x, point.x)),
          y: Math.round(Math.min(start.y, point.y)),
          width,
          height,
        };
      onCreateGroup(bounds);
    };
    const handleUp = (upEvent: PointerEvent) => finish(upEvent);
    const handleCancel = () => finish(null);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
  }, [drawGroupMode, onCreateGroup, screenToFlowPosition]);

  const handleMoveEnd = useCallback((_: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    handlers.current.onViewportChange({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={`prism-canvas w-full h-full${drawGroupMode ? " cursor-crosshair" : ""}`}
      onPointerDownCapture={handleDrawPointerDown}
      onDoubleClick={handleDoubleClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={baseEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultViewport={doc.viewport}
        minZoom={0.2}
        maxZoom={2.5}
        snapToGrid={values.canvas_snap_to_grid}
        snapGrid={[values.canvas_grid_size, values.canvas_grid_size]}
        zIndexMode="manual"
        elevateNodesOnSelect={false}
        nodesConnectable
        connectionMode={ConnectionMode.Loose}
        connectionRadius={18}
        isValidConnection={isValidConnection}
        onConnect={handleConnect}
        elementsSelectable
        nodesFocusable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnDrag={[2]}
        selectionKeyCode={null}
        multiSelectionKeyCode={["Shift", "Meta", "Control"]}
        zoomOnDoubleClick={false}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodeDragStart={handleDragStart}
        onNodeDrag={handleDrag}
        onNodeDragStop={handleDragStop}
        onNodeClick={() => handlers.current.onFocusItem()}
        onEdgeClick={() => handlers.current.onFocusItem()}
        onMoveEnd={handleMoveEnd}
        onNodeContextMenu={(event, node) => {
          if (node.id === editingId) return;
          handlers.current.onNodeContextMenu(node.id, event);
        }}
        onEdgeContextMenu={(event, edge) => handlers.current.onEdgeContextMenu(edge.id, event)}
        onPaneClick={() => handlers.current.onSelectionChange([], [])}
        onPaneContextMenu={(event) => {
          const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
          handlers.current.onPaneContextMenu(event as React.MouseEvent, position);
        }}
        proOptions={{ hideAttribution: true }}
      >
        {values.canvas_background !== "none" && (
          <Background
            variant={BG_VARIANT[values.canvas_background]}
            gap={values.canvas_grid_size}
            size={values.canvas_background === "cross" ? 6 : 1.2}
            color="rgb(var(--c-line))"
          />
        )}
        {drawRect && (
          <ViewportPortal>
            <div
              className="pointer-events-none absolute rounded-xl border-2 border-dashed"
              style={{
                transform: `translate(${drawRect.x}px, ${drawRect.y}px)`,
                width: drawRect.width,
                height: drawRect.height,
                borderColor: "var(--accent)",
                backgroundColor: "var(--accent-muted)",
              }}
            />
          </ViewportPortal>
        )}
        {showMiniMap && minimapPosition !== "off" && (
          <MiniMap
            position={minimapPosition}
            pannable
            zoomable
            nodeColor={(node) => {
              if (node.type === "frame") {
                const frame = node.data as GroupFlowNode["data"];
                const base = node.selected ? "var(--accent)" : frame.group.color || "rgb(var(--c-strong))";
                return `color-mix(in srgb, ${base} ${node.selected ? 45 : 20}%, transparent)`;
              }
              if (node.selected) return "var(--accent)";
              const data = node.data as BoardFlowNode["data"];
              return data.node.color || "rgb(var(--c-strong))";
            }}
          />
        )}
      </ReactFlow>
    </div>
  );
}

export default function BoardFlow(props: Props) {
  return (
    <ReactFlowProvider>
      <FlowInner {...props} />
    </ReactFlowProvider>
  );
}
