import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "../../lib/workspace/WorkspaceProvider";
import type { PaneSide } from "../../lib/workspace/types";
import { useSidebarCollapsed } from "../../lib/sidebarState";
import DocumentPane from "./DocumentPane";
import DocumentSidebar from "./DocumentSidebar";
import { ModuleSidebar } from "../AppSidebarSlot";

interface Props {
  active: boolean;
}

interface PaneLayout {
  side: PaneSide | null;
  id: string;
}

// Neither pane may shrink below this share of the split area.
const SPLIT_MIN_RATIO = 0.25;
const SPLIT_DEFAULT_RATIO = 0.5;

export default function DocumentWorkspace({ active }: Props) {
  const { state, focusSide, activateDoc, setLibrary } = useWorkspace();
  const collapsed = useSidebarCollapsed();
  const lastLayoutRef = useRef<PaneLayout[] | null>(null);
  const syncedTabRef = useRef<string | null>(null);
  const panesRef = useRef<HTMLDivElement>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const ratioRef = useRef(SPLIT_DEFAULT_RATIO);
  const draggingRef = useRef(false);
  const [splitRatio, setSplitRatio] = useState(SPLIT_DEFAULT_RATIO);
  const [dragging, setDragging] = useState(false);

  const currentLayout = useMemo<PaneLayout[] | null>(() => {
    if (state.split) {
      return [
        { side: "left", id: state.split.leftId },
        { side: "right", id: state.split.rightId },
      ];
    }
    return state.activeId ? [{ side: null, id: state.activeId }] : null;
  }, [state.activeId, state.split]);

  useEffect(() => {
    if (currentLayout) lastLayoutRef.current = currentLayout;
  }, [currentLayout]);

  // Focusing a document selects the library it belongs to; manually choosing
  // another library in the sidebar then sticks until the focus changes.
  const activeTab = useMemo(
    () => state.tabs.find((tab) => tab.id === state.activeId) ?? null,
    [state.activeId, state.tabs],
  );
  // Restoring the workspace must not overwrite the persisted library choice.
  const activeIdRef = useRef(state.activeId);
  activeIdRef.current = state.activeId;
  useEffect(() => {
    if (state.hydrated) syncedTabRef.current = activeIdRef.current;
  }, [state.hydrated]);
  useEffect(() => {
    if (!activeTab || syncedTabRef.current === activeTab.id) return;
    syncedTabRef.current = activeTab.id;
    if (activeTab.kind === "note" || activeTab.kind === "canvas") {
      setLibrary({ kind: activeTab.kind, vaultPath: activeTab.vaultPath });
    } else {
      setLibrary({ kind: "pdf", repoPath: activeTab.repoPath });
    }
  }, [activeTab, setLibrary]);

  // Module pages hide the workspace without unmounting it, so readers keep
  // their page/zoom while the user browses the library.
  const layout = currentLayout ?? lastLayoutRef.current;

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    setDragging(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  // Write the width straight to the DOM while dragging: re-rendering the
  // panes (CodeMirror / the PDF canvas) on every pointer move is far too slow.
  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !panesRef.current || !leftPaneRef.current) return;
    const rect = panesRef.current.getBoundingClientRect();
    if (rect.width === 0) return;
    const next = Math.min(
      1 - SPLIT_MIN_RATIO,
      Math.max(SPLIT_MIN_RATIO, (event.clientX - rect.left) / rect.width),
    );
    ratioRef.current = next;
    leftPaneRef.current.style.width = `${next * 100}%`;
  };

  const endResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    // Commit the final width to state so later renders keep the ratio.
    setSplitRatio(ratioRef.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  };

  return (
    <div
      className={active ? "h-full relative" : "absolute inset-0 invisible"}
      aria-hidden={!active}
    >
      {layout && (
        <div className="h-full flex">
          <ModuleSidebar active={active}>
            <div
              className={`h-full flex-shrink-0 grid transition-[grid-template-columns] duration-200 ease-out ${
                collapsed ? "grid-cols-[0fr]" : "grid-cols-[1fr]"
              }`}
            >
              <div className="overflow-hidden min-w-0 h-full flex">
                <DocumentSidebar />
              </div>
            </div>
          </ModuleSidebar>
          <div ref={panesRef} className="flex-1 min-w-0 h-full flex">
            {layout.map((pane, index) => {
              const tab = state.tabs.find((entry) => entry.id === pane.id);
              if (!tab) return null;
              const split = state.split !== null;
              const focused = state.split
                ? state.split.focused === pane.side
                : true;
              const toolbarScope = state.split ? `doc:${pane.side}` : "doc:single";
              return (
                <Fragment key={`${pane.side ?? "single"}:${tab.id}`}>
                  {index > 0 && (
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      onPointerDown={startResize}
                      onPointerMove={resize}
                      onPointerUp={endResize}
                      onPointerCancel={endResize}
                      className={`relative w-px flex-shrink-0 cursor-col-resize transition-colors after:absolute after:inset-y-0 after:-left-2 after:-right-2 after:content-[''] ${
                        dragging ? "bg-[var(--accent)]" : "bg-line hover:bg-[var(--accent-border)]"
                      }`}
                    />
                  )}
                  <div
                    ref={index === 0 ? leftPaneRef : undefined}
                    style={split && index === 0 ? { width: `${splitRatio * 100}%` } : undefined}
                    className={`min-w-0 h-full ${split && index === 0 ? "flex-shrink-0" : "flex-1"}`}
                  >
                    <DocumentPane
                      tab={tab}
                      focused={focused}
                      visible={active}
                      toolbarScope={toolbarScope}
                      splitOpen={state.split !== null}
                      onFocus={() => {
                        if (state.split && pane.side) focusSide(pane.side);
                        else activateDoc(tab.id);
                      }}
                    />
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
