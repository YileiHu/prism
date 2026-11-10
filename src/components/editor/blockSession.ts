import type { ChangeSet, EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  blockSession, createBlockSession, setBlockSession, setFocusedBlock,
  type BlockSession, type BlockSessionInit,
} from "./blockState";
import {
  calloutBlockAt, codeBlockAt, mathBlockRefAt, tableBlockAt,
  type CalloutBlockRef, type CodeBlockRef,
} from "./blockModel";
import type { MathBlockRef } from "./mathModel";
import { flatTableCells, tableColumnCount, type TableModel } from "./tableModel";
import { prefixCalloutBody, stripCalloutBody } from "./callouts";

interface ActiveBlockEditor {
  sessionId: number;
  root: HTMLElement;
  commit: (focusView: boolean, preserveSelection?: boolean) => boolean;
}

const activeEditors = new WeakMap<EditorView, ActiveBlockEditor>();

export function registerBlockEditor(
  view: EditorView,
  sessionId: number,
  root: HTMLElement,
  commit: (focusView: boolean, preserveSelection?: boolean) => boolean,
): () => void {
  const entry = { sessionId, root, commit };
  activeEditors.set(view, entry);
  return () => {
    if (activeEditors.get(view) === entry) activeEditors.delete(view);
  };
}

export function commitActiveBlock(
  view: EditorView,
  focusView: boolean,
  preserveSelection = false,
): boolean {
  return activeEditors.get(view)?.commit(focusView, preserveSelection) ?? false;
}

export function caretOutsideBlock(state: EditorState, from: number, to: number): number {
  const boundedTo = Math.max(0, Math.min(to, state.doc.length));
  const line = state.doc.lineAt(boundedTo);
  if (line.number < state.doc.lines) return state.doc.line(line.number + 1).from;
  return Math.max(0, Math.min(from, state.doc.length));
}

export function endBlockSession(
  view: EditorView,
  focusView = true,
  selection?: number,
): void {
  const session = blockSession(view.state);
  const anchor = selection ?? (session
    ? caretOutsideBlock(view.state, session.from, session.to)
    : view.state.selection.main.head);
  view.dispatch({
    effects: setBlockSession.of(null),
    selection: { anchor },
    scrollIntoView: true,
  });
  if (focusView) view.focus();
}

export function beginBlockSession(
  view: EditorView,
  init: BlockSessionInit,
  anchor = init.anchor,
): BlockSession {
  const session = createBlockSession({
    ...init,
    restore: init.restore ?? caretOutsideBlock(view.state, init.from, init.to),
  });
  view.dispatch({
    effects: [setBlockSession.of(session), setFocusedBlock.of(null)],
    selection: { anchor },
  });
  return session;
}

// Closing a session whose draft was unchanged: leave the document and the
// caret alone (or put the caret back at the entry point when taking focus).
function closeUnchangedSession(view: EditorView, focusView: boolean): void {
  const restore = blockSession(view.state)?.restore ?? view.state.selection.main.head;
  view.dispatch({
    effects: setBlockSession.of(null),
    ...(focusView ? { selection: { anchor: Math.max(0, Math.min(restore, view.state.doc.length)) } } : {}),
  });
  if (focusView) view.focus();
}

export function activateBlockFromDom(
  view: EditorView,
  root: HTMLElement,
  resolve: (state: EditorState, pos: number) => { init: BlockSessionInit; anchor: number } | null,
): boolean {
  if (activeEditors.has(view)) commitActiveBlock(view, false, true);
  if (!root.isConnected) return false;
  let pos: number;
  try {
    pos = view.posAtDOM(root, 0);
  } catch {
    return false;
  }
  const next = resolve(view.state, pos);
  if (!next) return false;
  beginBlockSession(view, next.init, next.anchor);
  return true;
}

export function outsideCaretAfterChanges(
  state: EditorState,
  changes: ChangeSet,
  from: number,
  to: number,
): number {
  const doc = changes.apply(state.doc);
  const mappedTo = changes.mapPos(to, 1);
  const line = doc.lineAt(mappedTo);
  if (line.number < doc.lines) return doc.line(line.number + 1).from;
  return Math.max(0, changes.mapPos(from, -1));
}

function domPos(view: EditorView, root: HTMLElement): number | null {
  try {
    return view.posAtDOM(root, 0);
  } catch {
    return null;
  }
}

export function codeBodyInitial(ref: CodeBlockRef): string {
  return ref.closed ? ref.code.replace(/\n$/, "") : ref.code;
}

export function writeCodeBody(
  view: EditorView,
  root: HTMLElement,
  text: string,
  focusView: boolean,
  preserveSelection = false,
): boolean {
  const pos = domPos(view, root);
  const ref = pos == null ? null : codeBlockAt(view.state, pos);
  if (!ref) {
    endBlockSession(view, focusView);
    return false;
  }
  const normalized = text.replace(/\r\n?/g, "\n");
  if (normalized === codeBodyInitial(ref)) {
    closeUnchangedSession(view, focusView);
    return false;
  }
  const insert = ref.closed
    ? (normalized === "" ? "" : normalized + "\n")
    : normalized;
  const changes = view.state.changes({ from: ref.bodyFrom, to: ref.bodyTo, insert });
  view.dispatch({
    changes,
    effects: setBlockSession.of(null),
    ...(focusView || !preserveSelection
      ? { selection: { anchor: outsideCaretAfterChanges(view.state, changes, ref.replaceFrom, ref.replaceTo) } }
      : {}),
    userEvent: "input",
  });
  if (focusView) view.focus();
  return true;
}

export function escapeTableCellPipes(text: string): string {
  const singleLine = text.replace(/\r\n?/g, "\n").replace(/\n/g, " ");
  let out = "";
  for (let i = 0; i < singleLine.length; i++) {
    const ch = singleLine[i];
    if (ch === "|") {
      let backslashes = 0;
      for (let j = out.length - 1; j >= 0 && out[j] === "\\"; j--) backslashes++;
      if (backslashes % 2 === 0) out += "\\";
    }
    out += ch;
  }
  return out;
}

export function nextTableCell(
  model: TableModel,
  active: { row: number; col: number },
  step: -1 | 1,
): { row: number; col: number } | null {
  const cells = flatTableCells(model);
  const index = cells.findIndex((hit) => hit.row === active.row && hit.col === active.col);
  const target = index >= 0 ? cells[index + step] : undefined;
  return target ? { row: target.row, col: target.col } : null;
}

export function writeTableCell(
  view: EditorView,
  root: HTMLElement,
  active: { row: number; col: number },
  text: string,
  next: { row: number; col: number } | null,
  focusView: boolean,
  nextOffset = 0,
  preserveSelection = false,
  appendRow = false,
): boolean {
  const pos = domPos(view, root);
  const ref = pos == null ? null : tableBlockAt(view.state, pos);
  if (!ref) {
    endBlockSession(view, focusView);
    return false;
  }
  const cell = ref.model.rows[active.row]?.cells[active.col];
  if (!cell) {
    endBlockSession(view, focusView);
    return false;
  }
  const insert = escapeTableCellPipes(text);
  const changed = insert !== cell.text;
  const specs: { from: number; to?: number; insert: string }[] = [];
  if (changed) specs.push({ from: cell.from, to: cell.to, insert });
  // Appended alongside the cell write so the widget sees one transaction:
  // a separate row-insert dispatch would detach the widget mid-commit
  let appendPos: number | null = null;
  if (appendRow) {
    const lastRow = ref.model.rows[ref.model.rows.length - 1];
    if (lastRow) {
      appendPos = lastRow.lineTo;
      const cols = tableColumnCount(ref.model);
      specs.push({
        from: appendPos,
        insert: `\n| ${Array.from({ length: cols }, () => "").join(" | ")} |`,
      });
    }
  }
  const changes = specs.length ? view.state.changes(specs) : null;
  const mapPos = (value: number, assoc: -1 | 1) => (changes ? changes.mapPos(value, assoc) : value);

  if (!changed && !next && !appendRow) {
    closeUnchangedSession(view, focusView);
    return false;
  }

  if (next) {
    const nextCell = ref.model.rows[next.row]?.cells[next.col];
    // Appended row: the first cell starts 3 chars into "\n|  …" (tab order)
    const anchor = appendPos != null
      ? mapPos(appendPos, -1) + 3
      : mapPos(nextCell?.from ?? cell.from, 1) + nextOffset;
    const session = createBlockSession({
      kind: "table",
      mode: "container",
      from: mapPos(ref.model.replaceFrom, -1),
      to: mapPos(ref.model.replaceTo, 1),
      anchor,
      restore: blockSession(view.state)?.restore
        ?? caretOutsideBlock(view.state, ref.model.replaceFrom, ref.model.replaceTo),
      target: { kind: "table", row: next.row, col: next.col, offset: nextOffset },
    });
    view.dispatch({
      ...(changes ? { changes } : {}),
      effects: setBlockSession.of(session),
      selection: { anchor: session.anchor },
      userEvent: changed || appendRow ? "input" : undefined,
    });
    return changed;
  }

  const selection = (focusView || !preserveSelection) && changes
    ? outsideCaretAfterChanges(view.state, changes, ref.model.replaceFrom, ref.model.replaceTo)
    : undefined;
  view.dispatch({
    ...(changes ? { changes } : {}),
    effects: setBlockSession.of(null),
    ...(selection != null ? { selection: { anchor: selection } } : {}),
    userEvent: changed ? "input" : undefined,
  });
  if (focusView) view.focus();
  return changed;
}

export function calloutBodyInitial(view: EditorView, ref: CalloutBlockRef): string {
  const firstLine = view.state.doc.lineAt(ref.from);
  if (ref.replaceTo <= firstLine.to) return "";
  return stripCalloutBody(view.state.sliceDoc(firstLine.to + 1, ref.replaceTo));
}

export function mathBodyInitial(ref: MathBlockRef): string {
  return ref.tex;
}

export function writeMathBody(
  view: EditorView,
  root: HTMLElement,
  text: string,
  focusView: boolean,
  preserveSelection = false,
): boolean {
  const pos = domPos(view, root);
  const ref = pos == null ? null : mathBlockRefAt(view.state, pos);
  if (!ref) {
    endBlockSession(view, focusView);
    return false;
  }
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (normalized === ref.tex.trim()) {
    closeUnchangedSession(view, focusView);
    return false;
  }
  const insert = normalized === "" ? "\n" : `\n${normalized}\n`;
  const changes = view.state.changes({ from: ref.bodyFrom, to: ref.bodyTo, insert });
  view.dispatch({
    changes,
    effects: setBlockSession.of(null),
    ...(focusView || !preserveSelection
      ? { selection: { anchor: outsideCaretAfterChanges(view.state, changes, ref.replaceFrom, ref.replaceTo) } }
      : {}),
    userEvent: "input",
  });
  if (focusView) view.focus();
  return true;
}

export function writeCallout(
  view: EditorView,
  root: HTMLElement,
  title: string,
  body: string,
  focusView: boolean,
  preserveSelection = false,
): boolean {
  const pos = domPos(view, root);
  const ref = pos == null ? null : calloutBlockAt(view.state, pos);
  if (!ref) {
    endBlockSession(view, focusView);
    return false;
  }
  const firstLine = view.state.doc.lineAt(ref.from);
  const bodyFrom = firstLine.to;
  const bodySource = ref.replaceTo > bodyFrom
    ? view.state.sliceDoc(bodyFrom + 1, ref.replaceTo)
    : "";
  const normalizedTitle = title.replace(/\r\n?/g, "\n").replace(/\n/g, " ");
  const normalizedBody = body.replace(/\r\n?/g, "\n");
  const titleChanged = normalizedTitle !== ref.title;
  const bodyChanged = normalizedBody !== stripCalloutBody(bodySource);
  if (!titleChanged && !bodyChanged) {
    closeUnchangedSession(view, focusView);
    return false;
  }

  const changes: { from: number; to: number; insert: string }[] = [];
  if (titleChanged) {
    changes.push({ from: ref.titleFrom, to: firstLine.to, insert: normalizedTitle });
  }
  if (bodyChanged) {
    const prefixed = prefixCalloutBody(normalizedBody);
    changes.push({
      from: bodyFrom,
      to: ref.replaceTo,
      insert: prefixed === "" ? "" : "\n" + prefixed,
    });
  }
  const changeSet = view.state.changes(changes);
  view.dispatch({
    changes: changeSet,
    effects: setBlockSession.of(null),
    ...(focusView || !preserveSelection
      ? { selection: { anchor: outsideCaretAfterChanges(view.state, changeSet, ref.replaceFrom, ref.replaceTo) } }
      : {}),
    userEvent: "input",
  });
  if (focusView) view.focus();
  return true;
}
