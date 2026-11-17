import { useEffect } from "react";
import { useSettings } from "./settings";
import {
  QUICK_CAPTURE_EVENT,
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
      // Container block editors own the keyboard while focused (Ctrl+E/F must
      // not toggle modes or steal focus mid-edit).
      if (e.target instanceof Element && e.target.closest("[data-prism-subeditor]")) return;
      if (overlayOpen()) return;
      // The settings recorder owns the keyboard while it is listening.
      if (e.target instanceof Element && e.target.closest("[data-prism-shortcut-recorder]")) return;
      const combo = shortcutFromEvent(e);
      if (!combo) return;
      const action = SHORTCUT_ACTIONS.find((candidate) => shortcuts[candidate] === combo);
      if (!action) return;
      // Bringing the main window forward only matters while Prism is unfocused;
      // main's OS-level registration owns that. Leave the in-app key untouched.
      if (action === "showMain") return;
      // Quick capture is app-wide, not vault-scoped. The OS-level shortcut in
      // main is the primary path; this in-app fallback keeps it working when
      // that registration was unavailable.
      if (action === "quickCapture") {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new Event(QUICK_CAPTURE_EVENT));
        return;
      }
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
