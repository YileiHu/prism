import { useEffect } from "react";
import { useSettings } from "./settings";
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_EVENT,
  shortcutFromEvent,
  type ShortcutEventDetail,
} from "../shared/shortcuts";

function overlayOpen(): boolean {
  return (
    document.querySelector('[role="dialog"][aria-modal="true"]') !== null ||
    document.querySelector("[data-prism-menu]") !== null
  );
}

// App-level shortcuts must run in the capture phase: CodeMirror's default
// keymap binds Ctrl+F/Ctrl+E and would preventDefault them before a bubble
// listener could see them.
export function useGlobalShortcuts(activeTab: string, isVaultTab: boolean) {
  const { values } = useSettings();
  const shortcuts = values.shortcuts;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing || e.key === "Process") return;
      if (overlayOpen()) return;
      const combo = shortcutFromEvent(e);
      if (!combo) return;
      const action = SHORTCUT_ACTIONS.find((candidate) => shortcuts[candidate] === combo);
      if (!action) return;
      // Non-vault tabs have no target for these actions; leave the event
      // untouched so the settings recorder still receives it.
      if (!isVaultTab) return;
      e.preventDefault();
      e.stopPropagation();
      const detail: ShortcutEventDetail = { action, vaultPath: activeTab };
      window.dispatchEvent(new CustomEvent(SHORTCUT_EVENT, { detail }));
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [shortcuts, activeTab, isVaultTab]);
}
