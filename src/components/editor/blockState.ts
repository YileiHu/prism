import { EditorState, StateEffect, StateField, Transaction } from "@codemirror/state";

export const toggleCodeFold = StateEffect.define<number>();

export const codeFoldField = StateField.define<Set<number>>({
  create: () => new Set(),
  update(value, tr) {
    let next: Set<number> | null = null;
    if (tr.docChanged) {
      next = new Set<number>();
      for (const pos of value) next.add(tr.changes.mapPos(pos, -1));
    }
    for (const effect of tr.effects) {
      if (!effect.is(toggleCodeFold)) continue;
      if (!next) next = new Set(value);
      const key = effect.value;
      if (next.has(key)) next.delete(key);
      else next.add(key);
    }
    return next ?? value;
  },
});

export function isCodeFolded(state: EditorState, from: number): boolean {
  return state.field(codeFoldField, false)?.has(from) ?? false;
}

export type BlockKind = "code" | "table" | "callout" | "math" | "embed";

export type BlockTarget =
  | { kind: "code"; part: "body"; line: number; offset: number }
  | { kind: "table"; row: number; col: number; offset: number }
  | { kind: "callout"; part: "title" | "body"; line: number }
  | { kind: "math"; part: "body" }
  | { kind: "embed"; part: "label" | "source" };

export interface BlockSession {
  id: number;
  kind: BlockKind;
  mode: "container" | "source";
  from: number;
  to: number;
  anchor: number;
  // Caret to return to when the session closes without any changes
  restore?: number;
  target?: BlockTarget;
}

export type BlockSessionInit = Omit<BlockSession, "id">;

let nextSessionId = 1;

export function createBlockSession(init: BlockSessionInit): BlockSession {
  return { id: nextSessionId++, ...init };
}

export const setBlockSession = StateEffect.define<BlockSession | null>();

export const blockSessionField = StateField.define<BlockSession | null>({
  create: () => null,
  update(value, tr) {
    let next = value;
    if (next && tr.docChanged) {
      next = {
        ...next,
        from: tr.changes.mapPos(next.from, -1),
        to: tr.changes.mapPos(next.to, 1),
        anchor: tr.changes.mapPos(next.anchor, 1),
      };
      if (next.from >= next.to) next = null;
    }
    for (const effect of tr.effects) {
      if (effect.is(setBlockSession)) next = effect.value;
    }
    if (next?.mode === "source" && tr.selection) {
      const range = next;
      const inside = tr.newSelection.ranges.some(
        (selection) => selection.from <= range.to && selection.to >= range.from,
      );
      if (!inside) next = null;
    }
    if (next && tr.annotation(Transaction.remote)) next = null;
    return next;
  },
});

export function blockSession(state: EditorState): BlockSession | null {
  return state.field(blockSessionField, false) ?? null;
}

// A block reached with the arrow keys (not yet being edited). It behaves as an
// atomic unit: Enter inserts a paragraph beside it, Delete removes it, and
// Ctrl/Cmd+Enter (or a mouse click) opens its editor. Mutually exclusive with
// blockSessionField — starting a session clears the focus.
export interface FocusedBlock {
  from: number;
  to: number;
  kind: BlockKind;
  // Caret kept at the entry edge while the block is focused
  caret: number;
  // Caret to restore when the focus is dismissed with Escape
  restore: number;
}

export const setFocusedBlock = StateEffect.define<FocusedBlock | null>();

export const focusedBlockField = StateField.define<FocusedBlock | null>({
  create: () => null,
  update(value, tr) {
    let next = value;
    if (next && tr.docChanged) {
      next = {
        ...next,
        from: tr.changes.mapPos(next.from, -1),
        to: tr.changes.mapPos(next.to, 1),
        caret: tr.changes.mapPos(next.caret, 1),
        restore: tr.changes.mapPos(next.restore, 1),
      };
      // The block itself was deleted by an outside edit
      if (next.from >= next.to) next = null;
    }
    for (const effect of tr.effects) {
      if (effect.is(setFocusedBlock)) next = effect.value;
    }
    // A caret move we didn't orchestrate (mouse click elsewhere) drops focus
    if (next && tr.selection
      && (!tr.newSelection.main.empty || tr.newSelection.main.head !== next.caret)) {
      next = null;
    }
    return next;
  },
});

export function focusedBlock(state: EditorState): FocusedBlock | null {
  return state.field(focusedBlockField, false) ?? null;
}

export function sourceSession(state: EditorState): BlockSession | null {
  const session = blockSession(state);
  return session?.mode === "source" ? session : null;
}

export function containerSession(state: EditorState): BlockSession | null {
  const session = blockSession(state);
  return session?.mode === "container" ? session : null;
}

export function isBlockSourceEditing(state: EditorState, from: number, to: number): boolean {
  const session = sourceSession(state);
  return session != null && session.from <= to && session.to >= from;
}

export function isBlockContainerEditing(state: EditorState, from: number, to: number): boolean {
  const session = containerSession(state);
  return session != null && session.from <= to && session.to >= from;
}
