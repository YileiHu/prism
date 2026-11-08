import { memo } from "react";
import { NodeResizer, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import {
  MAX_GROUP_HEIGHT,
  MAX_GROUP_WIDTH,
  MIN_GROUP_HEIGHT,
  MIN_GROUP_WIDTH,
  type CanvasGroup,
} from "../../../lib/canvas/model";
import type { NodeBounds } from "./BoardNode";

export interface GroupFlowNodeData extends Record<string, unknown> {
  group: CanvasGroup;
  placeholder: string;
  resizable: boolean;
  onRename: () => void;
  onResizeEnd: (bounds: NodeBounds) => void;
  onInsertCardAt: (position: { x: number; y: number }) => void;
}

export type GroupFlowNode = Node<GroupFlowNodeData, "frame">;

function GroupNode({ data, selected }: NodeProps<GroupFlowNode>) {
  const { screenToFlowPosition } = useReactFlow();
  const { group } = data;

  return (
    <div
      className="relative h-full w-full"
      onDoubleClick={(event) => {
        event.stopPropagation();
        data.onInsertCardAt(screenToFlowPosition({ x: event.clientX, y: event.clientY }));
      }}
    >
      <NodeResizer
        isVisible={data.resizable}
        minWidth={MIN_GROUP_WIDTH}
        minHeight={MIN_GROUP_HEIGHT}
        maxWidth={MAX_GROUP_WIDTH}
        maxHeight={MAX_GROUP_HEIGHT}
        lineClassName="prism-canvas-resizer-line"
        handleClassName="prism-canvas-resizer-handle"
        onResizeEnd={(_event, params) => {
          data.onResizeEnd({
            x: Math.round(params.x),
            y: Math.round(params.y),
            width: Math.round(params.width),
            height: Math.round(params.height),
          });
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-xl border-2 transition-shadow"
        style={{
          borderColor: selected
            ? "var(--accent)"
            : group.color
              ? `color-mix(in srgb, ${group.color} 50%, transparent)`
              : "color-mix(in srgb, rgb(var(--c-strong)) 14%, transparent)",
          backgroundColor: group.color
            ? `color-mix(in srgb, ${group.color} 7%, rgb(var(--c-base)))`
            : "color-mix(in srgb, rgb(var(--c-surface)) 40%, rgb(var(--c-base)))",
          boxShadow: selected ? "0 0 0 2px var(--accent-muted)" : undefined,
        }}
      />
      <div
        className={`nodrag absolute -top-6 left-1 max-w-[80%] cursor-text truncate rounded-chip px-1.5 py-0.5 text-caption ${
          group.name ? "text-secondary" : "text-faint"
        }`}
        title={group.name || data.placeholder}
        onDoubleClick={(event) => {
          event.stopPropagation();
          data.onRename();
        }}
      >
        {group.name || data.placeholder}
      </div>
    </div>
  );
}

export default memo(GroupNode);
