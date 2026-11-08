import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { BookOpen, FileText, Frame, Link2 } from "lucide-react";
import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  MAX_NODE_HEIGHT,
  MAX_NODE_WIDTH,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  type CanvasNode,
} from "../../../lib/canvas/model";
import { targetTitle } from "../../../lib/canvas/targets";

export interface NodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoardNodeData extends Record<string, unknown> {
  node: CanvasNode;
  editing: boolean;
  resizable: boolean;
  placeholder: string;
  onStartEdit: () => void;
  onCommitText: (text: string) => void;
  onCancelEdit: () => void;
  onOpenTarget: () => void;
  onResizeEnd: (bounds: NodeBounds) => void;
}

export type BoardFlowNode = Node<BoardNodeData, "board">;

function TargetIcon({
  node,
  size = 13,
  className = "text-muted",
}: {
  node: CanvasNode;
  size?: number;
  className?: string;
}) {
  const kind = node.target?.kind;
  if (kind === "note") return <FileText size={size} className={`flex-shrink-0 ${className}`} />;
  if (kind === "pdf") return <BookOpen size={size} className={`flex-shrink-0 ${className}`} />;
  if (kind === "canvas") return <Frame size={size} className={`flex-shrink-0 ${className}`} />;
  if (kind === "url") return <Link2 size={size} className={`flex-shrink-0 ${className}`} />;
  return null;
}

function BoardNode({ data, selected }: NodeProps<BoardFlowNode>) {
  const { node } = data;
  const [draft, setDraft] = useState(node.text);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (data.editing) {
      cancelledRef.current = false;
      setDraft(node.text);
    }
  }, [data.editing, node.text]);

  const commit = () => {
    data.onCommitText(draft);
  };

  const displayText = node.text;
  const editing = data.editing;
  // Highlight with the card's own color when it has one, accent otherwise.
  const highlight = node.color || "var(--accent)";
  const highlightRing = node.color
    ? `color-mix(in srgb, ${node.color} 22%, transparent)`
    : "var(--accent-muted)";
  const borderColor = selected || editing
    ? highlight
    : node.color
      ? `color-mix(in srgb, ${node.color} 80%, transparent)`
      : "rgb(var(--c-strong))";
  const background = node.color
    ? `color-mix(in srgb, ${node.color} 20%, rgb(var(--c-surface)))`
    : undefined;
  const boxShadow = editing
    ? `0 0 0 3px ${highlightRing}, var(--shadow-popover)`
    : selected
      ? `0 0 0 2px ${highlightRing}, var(--shadow-popover)`
      : "var(--shadow-popover)";
  const textStyle: CSSProperties = {
    textAlign: node.align,
    fontSize: `${node.fontSize}px`,
    fontWeight: node.bold ? 600 : 400,
    lineHeight: 1.5,
  };
  const verticalClass = node.valign === "middle"
    ? "items-center"
    : node.valign === "bottom"
      ? "items-end"
      : "items-start";

  return (
    <div
      className="group relative w-full h-full"
      style={{ "--prism-node-highlight": highlight } as CSSProperties}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (!editing) data.onStartEdit();
      }}
      onClick={(event) => {
        if (event.altKey && node.target) {
          event.stopPropagation();
          event.preventDefault();
          data.onOpenTarget();
        }
      }}
    >
      <NodeResizer
        isVisible={data.resizable}
        minWidth={MIN_NODE_WIDTH}
        minHeight={MIN_NODE_HEIGHT}
        maxWidth={MAX_NODE_WIDTH}
        maxHeight={MAX_NODE_HEIGHT}
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
      <Handle type="source" position={Position.Top} id="top" className="prism-canvas-handle" />
      <Handle type="source" position={Position.Left} id="left" className="prism-canvas-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="prism-canvas-handle" />
      <div
        className="w-full h-full rounded-card border-2 bg-surface px-3 py-2 transition-shadow"
        style={{
          borderColor,
          borderWidth: selected || editing ? 2 : undefined,
          backgroundColor: background,
          boxShadow,
        }}
      >
        {editing ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              if (cancelledRef.current) {
                cancelledRef.current = false;
                return;
              }
              commit();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                cancelledRef.current = true;
                data.onCancelEdit();
              }
            }}
            onDoubleClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            placeholder={data.placeholder}
            style={textStyle}
            className="nodrag nowheel w-full h-full resize-none appearance-none border-0 bg-transparent p-0 text-primary caret-[var(--accent)] outline-none ring-0 focus:outline-none focus-visible:outline-none placeholder:text-faint"
          />
        ) : (
          // Overflow scroll lives on the outer box; the inner flex grows with
          // the text so middle/bottom alignment never clips overflowing lines.
          <div className="w-full h-full overflow-auto">
            <div className={`flex gap-1.5 w-full min-w-0 min-h-full ${verticalClass}`}>
              <span
                style={textStyle}
                className={`flex-1 min-w-0 break-words whitespace-pre-wrap ${node.target ? "pr-4" : ""} ${displayText ? "text-primary" : "text-faint"}`}
              >
                {displayText || data.placeholder}
              </span>
            </div>
          </div>
        )}
      </div>

      {node.target && !editing && (
        <span className="pointer-events-none absolute right-2 top-2 flex items-center">
          <TargetIcon node={node} size={12} className="text-faint" />
        </span>
      )}

      {node.target && !editing && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            data.onOpenTarget();
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          title={targetTitle(node.target)}
          className="nodrag pointer-events-none absolute right-0 -top-6 z-10 flex max-w-full items-center gap-1 truncate rounded-chip border border-line/60 bg-surface px-2 py-1 text-left text-caption text-secondary opacity-0 shadow-popover transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 hover:text-primary"
        >
          <TargetIcon node={node} size={12} />
          <span className="min-w-0 truncate">{targetTitle(node.target)}</span>
        </button>
      )}

      <Handle type="source" position={Position.Right} id="right" className="prism-canvas-handle" />
    </div>
  );
}

export default memo(BoardNode);
