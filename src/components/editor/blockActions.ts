import type { EditorView } from "@codemirror/view";
import {
  createBlockSession, isBlockSourceEditing, isCodeFolded, setBlockSession, setFocusedBlock,
  toggleCodeFold, type BlockSessionInit,
} from "./blockState";
import { tableBlockAt, type CalloutBlockRef, type CodeBlockRef } from "./blockModel";
import {
  flatTableCells,
  tableCellAt,
  tableColumnCount,
  type TableAlignment,
  type TableModel,
} from "./tableModel";
import { CALLOUT_DEFAULT_TITLES } from "./callouts";
import { caretOutsideBlock, endBlockSession } from "./blockSession";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function setCodeLanguage(view: EditorView, block: CodeBlockRef, lang: string): void {
  const current = view.state.sliceDoc(block.infoFrom, block.infoTo);
  if (current === lang) return;
  view.dispatch({
    changes: { from: block.infoFrom, to: block.infoTo, insert: lang },
    userEvent: "input",
  });
  view.focus();
}

export function toggleCodeFoldAt(view: EditorView, block: CodeBlockRef): boolean {
  if (isCodeFolded(view.state, block.from)) {
    view.dispatch({ effects: toggleCodeFold.of(block.from) });
    view.focus();
    return true;
  }

  const selection = view.state.selection.main;
  const inside = selection.from <= block.to && selection.to >= block.from;
  if (inside) {
    const lastLine = view.state.doc.lineAt(Math.max(block.from, block.to - 1));
    // Folding would hide the selection; there is nowhere to move it when the
    // block ends the document, so leave folding disabled in that case.
    if (lastLine.to >= view.state.doc.length) return false;
    view.dispatch({
      effects: toggleCodeFold.of(block.from),
      selection: { anchor: lastLine.to + 1 },
    });
  } else {
    view.dispatch({ effects: toggleCodeFold.of(block.from) });
  }
  view.focus();
  return true;
}

export function insertBlockText(view: EditorView, text: string, offsetInText: number): void {
  const { state } = view;
  const { from, to } = state.selection.main;
  const fromLine = state.doc.lineAt(from);
  const toLine = state.doc.lineAt(to);
  const before = state.sliceDoc(fromLine.from, from);
  const after = state.sliceDoc(to, toLine.to);
  const prefix = before.trim() ? "\n" : "";
  const suffix = after.trim() ? "\n\n" : "";
  view.dispatch({
    changes: { from, to, insert: prefix + text + suffix },
    selection: { anchor: from + prefix.length + offsetInText },
    scrollIntoView: true,
    userEvent: "input",
  });
  view.focus();
}

export function insertCodeBlock(view: EditorView, lang: string): void {
  const fence = "```";
  const info = lang && lang !== "text" ? lang : "";
  insertBlockText(view, `${fence}${info}\n\n${fence}`, fence.length + info.length + 1);
}

export function insertMathBlock(view: EditorView): void {
  // Caret lands on the empty body line between the $$ fences
  insertBlockText(view, "$$\n\n$$", 3);
}

// Remove a block's whole source range; an open source session maps to a
// collapsed range and clears itself.
export function deleteBlockSource(
  view: EditorView,
  ref: { replaceFrom: number; replaceTo: number },
): void {
  const state = view.state;
  const change = ref.replaceTo < state.doc.length
    ? { from: ref.replaceFrom, to: ref.replaceTo + 1, insert: "" }
    : { from: Math.max(0, ref.replaceFrom - 1), to: ref.replaceTo, insert: "" };
  view.dispatch({
    changes: change,
    selection: { anchor: Math.min(change.from, state.doc.length) },
    userEvent: "delete",
  });
  view.focus();
}

// Two blank-ish newlines + a caret on the first real empty line give the user
// an editable paragraph between two rendered blocks (which are otherwise
// unreachable by pointer selection).
export function insertParagraphAbove(view: EditorView, pos: number): void {
  const at = Math.max(0, Math.min(pos, view.state.doc.length));
  view.dispatch({
    changes: { from: at, insert: "\n\n" },
    selection: { anchor: at + 1 },
    scrollIntoView: true,
    userEvent: "input",
  });
  view.focus();
}

export function insertParagraphBelow(view: EditorView, pos: number): void {
  const at = Math.max(0, Math.min(pos, view.state.doc.length));
  view.dispatch({
    changes: { from: at, insert: "\n\n" },
    selection: { anchor: at + 2 },
    scrollIntoView: true,
    userEvent: "input",
  });
  view.focus();
}

export function insertCallout(view: EditorView, type: string): void {
  const title = CALLOUT_DEFAULT_TITLES[type] ?? type;
  // Trailing blank line keeps following text out of the lazy blockquote
  const text = `> [!${type}] ${title}\n> \n`;
  insertBlockText(view, text, text.length - 1);
}

export function setCalloutType(view: EditorView, block: CalloutBlockRef, type: string): boolean {
  const current = view.state.sliceDoc(block.typeFrom, block.typeTo);
  if (current === type) return false;
  const line = view.state.doc.lineAt(block.titleFrom);
  const currentTitle = view.state.sliceDoc(block.titleFrom, line.to).trim();
  const oldDefault = CALLOUT_DEFAULT_TITLES[block.rawType] ?? block.rawType;
  const nextDefault = CALLOUT_DEFAULT_TITLES[type] ?? type;
  const changes: { from: number; to: number; insert: string }[] = [
    { from: block.typeFrom, to: block.typeTo, insert: type },
  ];
  // A title that was just the old default follows the type change; custom
  // titles are left untouched.
  if (currentTitle !== "" && currentTitle === oldDefault && nextDefault !== currentTitle) {
    changes.push({ from: block.titleFrom, to: line.to, insert: nextDefault });
  }
  view.dispatch({ changes, userEvent: "input" });
  view.focus();
  return true;
}

export function enterBlockSource(
  view: EditorView,
  init: Omit<BlockSessionInit, "id" | "mode">,
  anchor: number,
): void {
  const pos = Math.max(0, Math.min(anchor, view.state.doc.length));
  view.dispatch({
    effects: [
      setBlockSession.of(createBlockSession({
        ...init,
        mode: "source",
        anchor: pos,
        restore: init.restore ?? caretOutsideBlock(view.state, init.from, init.to),
      })),
      setFocusedBlock.of(null),
    ],
    selection: { anchor: pos },
    scrollIntoView: true,
  });
  view.focus();
}

export function enterBlockContainer(
  view: EditorView,
  init: Omit<BlockSessionInit, "id" | "mode">,
): void {
  view.dispatch({
    effects: [
      setBlockSession.of(createBlockSession({
        ...init,
        mode: "container",
        restore: init.restore ?? caretOutsideBlock(view.state, init.from, init.to),
      })),
      setFocusedBlock.of(null),
    ],
    selection: { anchor: init.anchor },
  });
}

export function exitBlockEdit(view: EditorView): void {
  endBlockSession(view, true);
}

// ---- Tables ----

function rowText(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

function cellOffset(texts: string[], index: number): number {
  // "| " is 2 chars; every preceding cell contributes its text + " | "
  let offset = 2;
  for (let i = 0; i < index; i++) offset += texts[i].length + 3;
  return offset;
}

function rowTexts(model: TableModel, rowIndex: number, count: number): string[] {
  const row = model.rows[rowIndex];
  return Array.from({ length: count }, (_, i) => row?.cells[i]?.text ?? "");
}

export function insertTable(view: EditorView, rows: number, cols: number): void {
  const colCount = Math.max(1, cols);
  const rowCount = Math.max(1, rows);
  const empty = Array.from({ length: colCount }, () => "");
  const lines = [
    rowText(empty),
    rowText(Array.from({ length: colCount }, () => "---")),
  ];
  for (let i = 1; i < rowCount; i++) lines.push(rowText(empty));
  insertBlockText(view, lines.join("\n"), 2);
}

export function tableInsertRow(
  view: EditorView,
  model: TableModel,
  rowIndex: number,
  side: "above" | "below",
): boolean {
  const row = model.rows[rowIndex];
  if (!row) return false;
  const state = view.state;

  let insertAfter: number;
  if (row.kind !== "body") {
    // Header/delimiter rows stay glued; "below" starts the body (or is a no-op
    // for an unsupported "above").
    if (side === "above") return false;
    insertAfter = model.rows[1].lineTo;
  } else {
    insertAfter = side === "above" ? model.rows[rowIndex - 1].lineTo : row.lineTo;
  }

  const text = "\n" + rowText(Array.from({ length: tableColumnCount(model) }, () => ""));
  const editing = isBlockSourceEditing(state, model.replaceFrom, model.replaceTo);
  view.dispatch({
    changes: { from: insertAfter, insert: text },
    ...(editing ? { selection: { anchor: insertAfter + 3 } } : {}),
    scrollIntoView: true,
    userEvent: "input",
  });
  view.focus();
  return true;
}

export function tableDeleteRow(view: EditorView, model: TableModel, rowIndex: number): boolean {
  const row = model.rows[rowIndex];
  if (!row || row.kind !== "body") return false;
  const state = view.state;
  const change = row.lineTo < state.doc.length
    ? { from: row.lineFrom, to: row.lineTo + 1, insert: "" }
    : { from: Math.max(0, row.lineFrom - 1), to: row.lineTo, insert: "" };
  view.dispatch({ changes: change, scrollIntoView: true, userEvent: "delete" });
  view.focus();
  return true;
}

export function tableInsertColumn(
  view: EditorView,
  model: TableModel,
  rowIndex: number,
  colIndex: number,
  side: "left" | "right",
): boolean {
  const count = tableColumnCount(model);
  const insertAt = side === "left" ? colIndex : colIndex + 1;
  const bounded = Math.max(0, Math.min(count, insertAt));
  const state = view.state;
  const changes: { from: number; to: number; insert: string }[] = [];
  const targetRowIndex = model.rows[rowIndex]?.kind === "delimiter" ? 0 : Math.min(rowIndex, model.rows.length - 1);
  let targetTexts: string[] = [];

  for (let r = 0; r < model.rows.length; r++) {
    const row = model.rows[r];
    const texts = rowTexts(model, r, count);
    texts.splice(bounded, 0, row.kind === "delimiter" ? "---" : "");
    if (r === targetRowIndex) targetTexts = texts;
    changes.push({ from: row.lineFrom, to: row.lineTo, insert: rowText(texts) });
  }
  if (targetTexts.length === 0) targetTexts = rowTexts(model, 0, count);

  const changeSet = state.changes(changes);
  const newDoc = changeSet.apply(state.doc);
  const targetRow = model.rows[targetRowIndex];
  const newLine = newDoc.line(targetRow.lineNo);
  const anchor = newLine.from + cellOffset(targetTexts, bounded);
  const editing = isBlockSourceEditing(state, model.replaceFrom, model.replaceTo);
  view.dispatch({
    changes: changeSet,
    ...(editing ? { selection: { anchor } } : {}),
    scrollIntoView: true,
    userEvent: "input",
  });
  view.focus();
  return true;
}

export function tableDeleteColumn(
  view: EditorView,
  model: TableModel,
  rowIndex: number,
  colIndex: number,
): boolean {
  const count = tableColumnCount(model);
  if (count <= 1) return false;
  const state = view.state;
  const changes: { from: number; to: number; insert: string }[] = [];
  const targetRowIndex = model.rows[rowIndex]?.kind === "delimiter" ? 0 : Math.min(rowIndex, model.rows.length - 1);
  let targetTexts: string[] = [];

  for (let r = 0; r < model.rows.length; r++) {
    const row = model.rows[r];
    const texts = rowTexts(model, r, count);
    texts.splice(colIndex, 1);
    if (r === targetRowIndex) targetTexts = texts;
    changes.push({ from: row.lineFrom, to: row.lineTo, insert: rowText(texts) });
  }
  if (targetTexts.length === 0) targetTexts = rowTexts(model, 0, count).slice(0, -1);

  const changeSet = state.changes(changes);
  const newDoc = changeSet.apply(state.doc);
  const targetRow = model.rows[targetRowIndex];
  const newLine = newDoc.line(targetRow.lineNo);
  const targetCol = Math.min(colIndex, count - 2);
  const anchor = newLine.from + cellOffset(targetTexts, targetCol);
  view.dispatch({
    changes: changeSet,
    selection: { anchor },
    scrollIntoView: true,
    userEvent: "delete",
  });
  view.focus();
  return true;
}

export function tableSetAlignment(
  view: EditorView,
  model: TableModel,
  colIndex: number,
  alignment: TableAlignment,
): boolean {
  const delimiter = model.rows[1];
  const cell = delimiter?.cells[colIndex];
  if (!cell) return false;
  const token = alignment === "center"
    ? ":---:"
    : alignment === "left"
      ? ":---"
      : alignment === "right"
        ? "---:"
        : "---";
  if (cell.text === token) return false;
  view.dispatch({
    changes: { from: cell.from, to: cell.to, insert: token },
    userEvent: "input",
  });
  view.focus();
  return true;
}

export function tableDelete(view: EditorView, model: TableModel): boolean {
  const state = view.state;
  const change = model.replaceTo < state.doc.length
    ? { from: model.replaceFrom, to: model.replaceTo + 1, insert: "" }
    : { from: Math.max(0, model.replaceFrom - 1), to: model.replaceTo, insert: "" };
  view.dispatch({ changes: change, selection: { anchor: Math.min(change.from, state.doc.length) }, userEvent: "delete" });
  view.focus();
  return true;
}

export function tableTab(view: EditorView, backwards: boolean): boolean {
  const state = view.state;
  const ref = tableBlockAt(state, state.selection.main.head);
  if (!ref) return false;
  // A rendered table must not consume Tab through a hidden cursor.
  if (!isBlockSourceEditing(state, ref.model.replaceFrom, ref.model.replaceTo)) return true;
  const cells = flatTableCells(ref.model);
  const hit = tableCellAt(ref.model, state.selection.main.head);
  const index = hit
    ? cells.findIndex((item) => item.row === hit.row && item.col === hit.col)
    : -1;

  if (!backwards && index === cells.length - 1) {
    return tableInsertRow(view, ref.model, ref.model.rows.length - 1, "below");
  }

  const targetIndex = backwards
    ? Math.max(0, index - 1)
    : Math.min(cells.length - 1, Math.max(0, index + 1));
  const target = cells[targetIndex];
  if (!target) return true;
  view.dispatch({ selection: { anchor: target.cell.from }, scrollIntoView: true });
  view.focus();
  return true;
}
