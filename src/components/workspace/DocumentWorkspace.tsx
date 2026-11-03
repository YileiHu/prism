import { useEffect, useMemo, useRef } from "react";
import { useWorkspace } from "../../lib/workspace/WorkspaceProvider";
import type { PaneSide } from "../../lib/workspace/types";
import { useSidebarCollapsed } from "../../lib/sidebarState";
import DocumentPane from "./DocumentPane";
import DocumentSidebar from "./DocumentSidebar";

interface Props {
  active: boolean;
}

interface PaneLayout {
  side: PaneSide | null;
  id: string;
}

export default function DocumentWorkspace({ active }: Props) {
  const { state, focusSide, activateDoc, setLibrary } = useWorkspace();
  const collapsed = useSidebarCollapsed();
  const lastLayoutRef = useRef<PaneLayout[] | null>(null);
  const syncedTabRef = useRef<string | null>(null);

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
    if (activeTab.kind === "note") setLibrary({ kind: "note", vaultPath: activeTab.vaultPath });
    else setLibrary({ kind: "pdf", repoPath: activeTab.repoPath });
  }, [activeTab, setLibrary]);

  // Module pages hide the workspace without unmounting it, so readers keep
  // their page/zoom while the user browses the library.
  const layout = currentLayout ?? lastLayoutRef.current;

  return (
    <div
      className={active ? "h-full bg-base relative" : "absolute inset-0 invisible"}
      aria-hidden={!active}
    >
      {layout && (
        <div className="h-full flex">
          <div
            className={`h-full flex-shrink-0 grid transition-[grid-template-columns] duration-200 ease-out ${
              collapsed ? "grid-cols-[0fr]" : "grid-cols-[1fr]"
            }`}
          >
            <div className="overflow-hidden min-w-0 h-full flex">
              <DocumentSidebar />
            </div>
          </div>
          <div className="flex-1 min-w-0 h-full flex">
            {layout.map((pane, index) => {
              const tab = state.tabs.find((entry) => entry.id === pane.id);
              if (!tab) return null;
              const focused = state.split
                ? state.split.focused === pane.side
                : true;
              const toolbarScope = state.split ? `doc:${pane.side}` : "doc:single";
              return (
                <div key={`${pane.side ?? "single"}:${tab.id}`} className="flex min-w-0 flex-1">
                  {index > 0 && <div className="w-px bg-line flex-shrink-0" />}
                  <div className="flex-1 min-w-0 h-full">
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
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
