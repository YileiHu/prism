import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import { blockAt } from "./blockModel";
import {
  blockSession, focusedBlock, setFocusedBlock, sourceSession, type FocusedBlock,
} from "./blockState";
import { beginBlockSession } from "./blockSession";
import { copyText, deleteBlockSource, enterBlockSource, exitBlockEdit } from "./blockActions";
import { containerSpec } from "./containers/registry";

// A block reached with the arrow keys is focused (outlined) instead of opening
// its editor: arrows stop on it, Enter inserts a paragraph beside it, Delete
// removes it, and a click / Ctrl+Enter opens it. Keeps the editor's caret at
// the entry edge; blockState.focusedBlockField drops the focus as soon as the
// caret moves anywhere on its own.

export function focusAdjacentBlock(view: EditorView, direction: -1 | 1): boolean {
  const { state } = view;
  const selection = state.selection.main;
  if (!selection.empty || focusedBlock(state) || blockSession(state)) return false;
  const probe = direction > 0
    ? Math.min(state.doc.length, selection.head + 1)
    : Math.max(0, selection.head - 1);
  const block = blockAt(state, probe);
  if (!block) return false;
  focusBlock(view, block.replaceFrom, block.replaceTo, block.kind, selection.head);
  return true;
}

function focusBlock(
  view: EditorView,
  from: number,
  to: number,
  kind: FocusedBlock["kind"],
  caret: number,
): void {
  view.dispatch({
    effects: setFocusedBlock.of({
      from,
      to,
      kind,
      caret,
      restore: view.state.selection.main.head,
    }),
  });
}

export function focusedBlockKeydown(event: KeyboardEvent, view: EditorView): boolean {
  const focused = focusedBlock(view.state);
  if (!focused || event.isComposing) return false;
  const mod = event.ctrlKey || event.metaKey;

  if (mod && event.key === "Enter") {
    event.preventDefault();
    editFocusedBlock(view, focused);
    return true;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    view.dispatch({
      effects: setFocusedBlock.of(null),
      selection: { anchor: Math.max(0, Math.min(focused.restore, view.state.doc.length)) },
      scrollIntoView: true,
    });
    view.focus();
    return true;
  }
  if (mod && (event.key === "c" || event.key === "C")) {
    event.preventDefault();
    void copyText(view.state.sliceDoc(focused.from, focused.to));
    return true;
  }
  if (mod && (event.key === "x" || event.key === "X")) {
    event.preventDefault();
    const text = view.state.sliceDoc(focused.from, focused.to);
    void copyText(text).then((ok) => {
      const current = focusedBlock(view.state);
      if (ok && current && current.from === focused.from) deleteFocusedBlock(view, current);
    });
    return true;
  }
  // Formatting shortcuts must not reach the hidden source under the card
  if (mod && (event.key === "b" || event.key === "B" || event.key === "i" || event.key === "I")) {
    event.preventDefault();
    return true;
  }
  // Leave other shortcuts (save, search, …) to the regular keymap
  if (mod) return false;

  if (event.key === "Enter") {
    event.preventDefault();
    insertParagraphNearBlock(view, focused, event.shiftKey ? "above" : "below");
    return true;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteFocusedBlock(view, focused);
    return true;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    event.preventDefault();
    moveOutOfBlock(view, focused, 1);
    return true;
  }
  if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    event.preventDefault();
    moveOutOfBlock(view, focused, -1);
    return true;
  }
  // The block is a black box: swallow typing, Space and Tab so they can't
  // silently modify the hidden source underneath the card.
  if (event.key.length === 1 || event.key === "Tab") {
    event.preventDefault();
    return true;
  }
  return false;
}

// Escape in source-editing mode closes the session (edits are already live)
export function sourceSessionEscape(event: KeyboardEvent, view: EditorView): boolean {
  if (event.key !== "Escape" || event.isComposing) return false;
  if (!sourceSession(view.state)) return false;
  event.preventDefault();
  exitBlockEdit(view);
  return true;
}

// Backspace at the start of the line right under a block (or Delete at the
// end of the line right above one) would otherwise join that line with the
// block's hidden source. Focus the block instead; a second press deletes it.
export function blockBoundaryKeydown(event: KeyboardEvent, view: EditorView): boolean {
  if (event.isComposing) return false;
  if (event.key !== "Backspace" && event.key !== "Delete") return false;
  const { state } = view;
  const selection = state.selection.main;
  if (!selection.empty || focusedBlock(state) || blockSession(state)) return false;
  const head = selection.head;

  if (event.key === "Backspace") {
    if (head === 0) return false;
    if (state.doc.lineAt(head).from !== head) return false;
    const block = blockAt(state, head - 1);
    if (!block || block.replaceTo !== head - 1) return false;
    event.preventDefault();
    focusBlock(view, block.replaceFrom, block.replaceTo, block.kind, head);
    return true;
  }

  if (head >= state.doc.length) return false;
  if (state.doc.lineAt(head).to !== head) return false;
  const block = blockAt(state, head + 1);
  if (!block || block.replaceFrom !== head + 1) return false;
  event.preventDefault();
  focusBlock(view, block.replaceFrom, block.replaceTo, block.kind, head);
  return true;
}

function moveOutOfBlock(view: EditorView, focused: FocusedBlock, direction: -1 | 1): void {
  const { state } = view;
  let pos: number;
  if (direction > 0) {
    const last = state.doc.lineAt(focused.to);
    if (last.number >= state.doc.lines) return;
    pos = state.doc.line(last.number + 1).from;
  } else {
    const first = state.doc.lineAt(focused.from);
    if (first.number <= 1) return;
    pos = state.doc.line(first.number - 1).to;
  }
  // Adjacent block: hop the focus straight onto it
  const neighbor = blockAt(state, pos);
  if (neighbor) {
    focusBlock(view, neighbor.replaceFrom, neighbor.replaceTo, neighbor.kind, pos);
    return;
  }
  view.dispatch({
    effects: setFocusedBlock.of(null),
    selection: { anchor: pos },
    scrollIntoView: true,
  });
  view.focus();
}

function insertParagraphNearBlock(
  view: EditorView,
  focused: FocusedBlock,
  side: "above" | "below",
): void {
  const { doc } = view.state;
  let insert: { from: number; insert: string } | null = null;
  let caret: number;
  if (side === "below") {
    const last = doc.lineAt(focused.to);
    // Reuse an existing blank line instead of stacking another one
    if (last.number < doc.lines && doc.line(last.number + 1).text.trim() === "") {
      caret = doc.line(last.number + 1).from;
    } else {
      const at = last.number < doc.lines ? last.to : doc.length;
      insert = { from: at, insert: "\n\n" };
      caret = at + 1;
    }
  } else {
    const first = doc.lineAt(focused.from);
    if (first.number > 1 && doc.line(first.number - 1).text.trim() === "") {
      caret = doc.line(first.number - 1).from;
    } else {
      const at = first.number > 1 ? first.from : 0;
      insert = { from: at, insert: "\n\n" };
      caret = at + 1;
    }
  }
  view.dispatch({
    ...(insert ? { changes: insert } : {}),
    effects: setFocusedBlock.of(null),
    selection: { anchor: caret },
    scrollIntoView: true,
    userEvent: "input",
  });
  view.focus();
}

function deleteFocusedBlock(view: EditorView, focused: FocusedBlock): void {
  view.dispatch({ effects: setFocusedBlock.of(null) });
  deleteBlockSource(view, { replaceFrom: focused.from, replaceTo: focused.to });
}

function editFocusedBlock(view: EditorView, focused: FocusedBlock): void {
  const block = blockAt(view.state, focused.from);
  if (!block) {
    view.dispatch({ effects: setFocusedBlock.of(null) });
    return;
  }
  const spec = containerSpec(block.kind);
  if (!spec.container) {
    const anchor = spec.sourceAnchor(block);
    enterBlockSource(view, {
      kind: block.kind,
      from: block.replaceFrom,
      to: block.replaceTo,
      anchor,
    }, anchor);
    return;
  }
  const entry = spec.entry(block);
  beginBlockSession(view, {
    kind: block.kind,
    mode: "container",
    from: block.replaceFrom,
    to: block.replaceTo,
    anchor: entry.anchor,
    restore: focused.caret,
    target: entry.target,
  });
}

// Keeps the focused block's widget outlined across decoration rebuilds and
// drops the focus when the editor itself loses DOM focus (toolbar, dialogs…)
export const focusedBlockHighlighter = ViewPlugin.fromClass(class {
  private readonly view: EditorView;
  private pending = 0;
  private readonly onFocusOut = () => {
    if (!this.view.dom.isConnected) return;
    if (focusedBlock(this.view.state)) {
      this.view.dispatch({ effects: setFocusedBlock.of(null) });
    }
  };

  constructor(view: EditorView) {
    this.view = view;
    view.contentDOM.addEventListener("focusout", this.onFocusOut);
  }

  update(update: ViewUpdate) {
    this.apply();
    // Plugin updates run before the DOM is redrawn, so a widget rebuilt by
    // this same update would lose its class — reapply after the frame.
    if (focusedBlock(update.state)) {
      if (this.pending) cancelAnimationFrame(this.pending);
      this.pending = requestAnimationFrame(() => {
        this.pending = 0;
        if (this.view.dom.isConnected) this.apply();
      });
    }
  }

  private apply(): void {
    const dom = this.view.contentDOM;
    dom.querySelectorAll<HTMLElement>(".cm-md-block-selected")
      .forEach((el) => el.classList.remove("cm-md-block-selected"));
    const focused = focusedBlock(this.view.state);
    // The block itself is the "cursor" while focused — hide the text caret so
    // it doesn't blink at the card's edge
    dom.style.caretColor = focused ? "transparent" : "";
    if (!focused) return;
    const widgets = dom.querySelectorAll<HTMLElement>(".cm-md-block-widget[data-block-from]");
    for (const el of widgets) {
      const from = Number(el.dataset.blockFrom);
      const to = Number(el.dataset.blockTo);
      if (from <= focused.from && to >= focused.to) {
        el.classList.add("cm-md-block-selected");
        break;
      }
    }
  }

  destroy() {
    if (this.pending) cancelAnimationFrame(this.pending);
    this.view.contentDOM.removeEventListener("focusout", this.onFocusOut);
    this.view.contentDOM.style.caretColor = "";
  }
});
