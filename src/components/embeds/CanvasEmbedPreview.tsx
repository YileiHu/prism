import { memo, useEffect, useMemo, useRef } from "react";
import {
  ConnectionMode,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { CanvasDoc } from "../../lib/canvas/model";
import BoardNode, { type BoardFlowNode } from "../canvas/nodes/BoardNode";
import GroupNode, { type GroupFlowNode } from "../canvas/nodes/GroupNode";
import ArrowEdge, { type ArrowFlowEdge } from "../canvas/edges/ArrowEdge";

// Read-only board used by note embeds. This is the only embed module that pulls
// in @xyflow/react, and EmbedCard loads it lazily.
const nodeTypes = { board: BoardNode, frame: GroupNode } satisfies NodeTypes;
const edgeTypes = { arrow: ArrowEdge } satisfies EdgeTypes;

type CanvasFlowNode = BoardFlowNode | GroupFlowNode;

const noop = () => {};

function PreviewInner({ doc }: { doc: CanvasDoc }) {
  const { fitView } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const nodes = useMemo<CanvasFlowNode[]>(() => {
    const groups: GroupFlowNode[] = doc.groups.map((group) => ({
      id: group.id,
      type: "frame",
      position: { x: group.x, y: group.y },
      selected: false,
      style: { width: group.width, height: group.height },
      measured: { width: group.width, height: group.height },
      zIndex: -1,
      connectable: false,
      draggable: false,
      data: {
        group,
        placeholder: "",
        resizable: false,
        onRename: noop,
        onResizeEnd: noop,
        onInsertCardAt: noop,
      },
    }));
    const cards: BoardFlowNode[] = doc.nodes.map((node) => ({
      id: node.id,
      type: "board",
      position: { x: node.x, y: node.y },
      selected: false,
      style: { width: node.width, height: node.height },
      measured: { width: node.width, height: node.height },
      draggable: false,
      connectable: false,
      data: {
        node,
        editing: false,
        resizable: false,
        placeholder: "",
        onStartEdit: noop,
        onCommitText: noop,
        onCancelEdit: noop,
        onOpenTarget: noop,
        onResizeEnd: noop,
      },
    }));
    return [...groups, ...cards];
  }, [doc]);

  const edges = useMemo<ArrowFlowEdge[]>(() => {
    return doc.edges.map((edge) => {
      const color = edge.color || "";
      const markerSize = Math.round(12 + 4 * edge.strokeWidth);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle || "right",
        targetHandle: edge.targetHandle || "left",
        type: "arrow",
        selected: false,
        data: {
          color,
          label: edge.label,
          labelPosition: edge.labelPosition,
          strokeWidth: edge.strokeWidth,
          lineStyle: edge.lineStyle,
          onMove: noop,
          onSelect: noop,
          onContextMenu: noop,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          markerUnits: "userSpaceOnUse",
          width: markerSize,
          height: markerSize,
          color: color || "rgb(var(--c-strong))",
        },
      };
    });
  }, [doc]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      void fitView({ padding: 0.08, maxZoom: 1 });
    });
    return () => cancelAnimationFrame(raf);
  }, [doc, fitView]);

  // The card can be resized with the size slider; re-fit after the size settles
  // so dragging the slider doesn't re-fit the whole board on every step.
  useEffect(() => {
    const host = wrapperRef.current;
    if (!host) return;
    let timer = 0;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void fitView({ padding: 0.08, maxZoom: 1 });
      }, 120);
    });
    observer.observe(host);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [fitView]);

  return (
    <div ref={wrapperRef} className="embed-visual-frame w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        // BoardNode declares every handle as a source; loose mode lets edges
        // resolve their target handle, matching the editor.
        connectionMode={ConnectionMode.Loose}
        minZoom={0.02}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        panOnDrag={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        selectionOnDrag={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
}

function CanvasEmbedPreview({ doc }: { doc: CanvasDoc }) {
  return (
    <ReactFlowProvider>
      <PreviewInner doc={doc} />
    </ReactFlowProvider>
  );
}

export default memo(CanvasEmbedPreview);
