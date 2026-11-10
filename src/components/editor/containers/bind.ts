import type { EditorView } from "@codemirror/view";
import { indentUnit } from "@codemirror/language";
import { blockSession } from "../blockState";

// Single commit point for a container: when focus leaves the widget entirely,
// commit the draft (focus moving between the widget's own fields is ignored).
// Checked after a frame so a click that activates another block can run first.
export function commitContainerOnFocusOut(
  view: EditorView,
  sessionId: number,
  root: HTMLElement,
  commit: (focusView: boolean, preserveSelection?: boolean) => boolean,
  alive: () => boolean = () => true,
): void {
  root.addEventListener("focusout", (event) => {
    if (!alive()) return;
    const related = (event as FocusEvent).relatedTarget;
    if (related instanceof Node && root.contains(related)) return;
    requestAnimationFrame(() => {
      if (!alive() || !root.isConnected) return;
      if (blockSession(view.state)?.id !== sessionId) return;
      const active = document.activeElement;
      if (active instanceof Node && root.contains(active)) return;
      commit(false, active instanceof Node && view.dom.contains(active));
    });
  });
}

export type ContainerEnterPolicy = "newline" | "focus" | "commit";
export type ContainerTabPolicy = "indent" | "focus" | "cells";

export interface ContainerField {
  id: string;
  el: HTMLTextAreaElement | HTMLInputElement;
  enter: ContainerEnterPolicy;
  tab: ContainerTabPolicy;
}

export interface ContainerKeyActions {
  commit: (focusView: boolean, preserveSelection?: boolean) => void;
  onSave?: () => void;
  // Moves focus within the container (callout title ↔ body); returns false
  // when the field has no next one
  nextField?: (id: string, backwards: boolean) => boolean;
  // Table-style navigation: commit the cell and activate its neighbor
  onTab?: (id: string, backwards: boolean) => void;
}

const BROWSER_EVENTS = [
  "keyup", "beforeinput", "input", "paste", "drop", "cut",
  "compositionstart", "compositionupdate", "compositionend",
] as const;

function grow(el: HTMLTextAreaElement): void {
  const max = Math.max(120, window.innerHeight * 0.6);
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
}

function insertIndent(el: HTMLTextAreaElement, width: number): void {
  el.setRangeText(" ".repeat(width), el.selectionStart, el.selectionEnd, "end");
}

function outdent(el: HTMLTextAreaElement, width: number): void {
  const pos = el.selectionStart;
  const before = el.value.slice(Math.max(0, pos - width), pos);
  const count = / +$/.exec(before)?.[0].length ?? 0;
  if (count) el.setRangeText("", pos - count, pos, "end");
}

// Shared key contract for every container field: Esc/Mod+Enter commit and
// exit, Mod+S commits and saves, Enter/Tab follow the field's policy, Tab
// indents with the editor's indentUnit. The block preview sees nothing of
// these events.
export function bindContainerField(
  view: EditorView,
  sessionId: number,
  root: HTMLElement,
  field: ContainerField,
  actions: ContainerKeyActions,
): void {
  const active = () => root.isConnected && blockSession(view.state)?.id === sessionId;

  for (const name of BROWSER_EVENTS) {
    field.el.addEventListener(name, (event) => event.stopPropagation());
  }
  if (field.el instanceof HTMLTextAreaElement) {
    field.el.addEventListener("input", () => grow(field.el as HTMLTextAreaElement));
  }

  (field.el as HTMLElement).addEventListener("keydown", (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.isComposing || !active()) return;
    const mod = event.ctrlKey || event.metaKey;

    if (event.key === "Escape") {
      event.preventDefault();
      actions.commit(true);
      return;
    }
    if (mod && event.key.toLowerCase() === "s") {
      event.preventDefault();
      actions.commit(true);
      actions.onSave?.();
      return;
    }
    if (mod && event.key === "Enter") {
      event.preventDefault();
      actions.commit(true);
      return;
    }
    if (event.key === "Enter") {
      if (field.enter === "newline") return;
      event.preventDefault();
      if (field.enter === "focus" && actions.nextField?.(field.id, event.shiftKey)) return;
      actions.commit(true);
      return;
    }
    if (event.key !== "Tab") return;
    event.preventDefault();
    if (field.tab === "cells") {
      actions.onTab?.(field.id, event.shiftKey);
      return;
    }
    if (field.tab === "focus") {
      if (!actions.nextField?.(field.id, event.shiftKey)) actions.commit(true);
      return;
    }
    if (field.el instanceof HTMLTextAreaElement) {
      const width = Math.max(1, view.state.facet(indentUnit).length);
      if (event.shiftKey) outdent(field.el, width);
      else insertIndent(field.el, width);
      grow(field.el);
    }
  });
}
