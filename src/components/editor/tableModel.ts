import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

export type TableAlignment = "default" | "left" | "center" | "right";

export interface TableCell {
  from: number;
  to: number;
  text: string;
}

export interface TableRow {
  kind: "header" | "delimiter" | "body";
  lineNo: number;
  lineFrom: number;
  lineTo: number;
  cells: TableCell[];
  pipes: number[];
}

export interface TableModel {
  from: number;
  to: number;
  replaceFrom: number;
  replaceTo: number;
  rows: TableRow[];
  alignments: TableAlignment[];
}

export interface TableBlockRef {
  kind: "table";
  from: number;
  to: number;
  replaceFrom: number;
  replaceTo: number;
  model: TableModel;
}

export interface TableCellHit {
  row: number;
  col: number;
  cell: TableCell;
}

function isNestedInContainer(node: SyntaxNode): boolean {
  let parent = node.parent;
  while (parent) {
    if (parent.name === "ListItem" || parent.name === "Blockquote") return true;
    if (parent.name === "Document") return false;
    parent = parent.parent;
  }
  return false;
}

// Mirrors @lezer/markdown's row scanner: unescaped pipes split cells, leading
// and trailing whitespace is trimmed, and empty cells keep their slot (the
// parser produces no TableCell node for them, so this can't lean on lezer).
function parseRow(state: EditorState, lineNo: number, kind: TableRow["kind"]): TableRow {
  const line = state.doc.line(lineNo);
  const text = line.text;
  const cells: TableCell[] = [];
  const pipes: number[] = [];
  let first = true;
  let cellStart = -1;
  let cellEnd = -1;
  let esc = false;
  let lastPipe = -1;

  const pushCell = () => {
    if (cellStart >= 0) {
      cells.push({
        from: line.from + cellStart,
        to: line.from + cellEnd,
        text: text.slice(cellStart, cellEnd),
      });
    } else {
      const anchor = lastPipe >= 0 ? lastPipe + 1 : line.from;
      cells.push({ from: anchor, to: anchor, text: "" });
    }
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "|" && !esc) {
      if (!first || cellStart > -1) pushCell();
      pipes.push(line.from + i);
      lastPipe = line.from + i;
      first = false;
      cellStart = -1;
      cellEnd = -1;
    } else if (esc || (ch !== " " && ch !== "\t")) {
      if (cellStart < 0) cellStart = i;
      cellEnd = i + 1;
    }
    esc = !esc && ch === "\\";
  }
  if (cellStart > -1) pushCell();

  return {
    kind,
    lineNo,
    lineFrom: line.from,
    lineTo: line.to,
    cells,
    pipes,
  };
}

function alignmentOf(text: string): TableAlignment {
  const value = text.trim();
  const left = value.startsWith(":");
  const right = value.endsWith(":");
  if (left && right) return "center";
  if (left) return "left";
  if (right) return "right";
  return "default";
}

export function tableModelAt(state: EditorState, node: SyntaxNode): TableModel | null {
  if (node.name !== "Table") return null;
  // Nested tables keep the source view: rebuilding their lines would strip the
  // surrounding list/quote prefixes.
  if (isNestedInContainer(node)) return null;

  const firstLine = state.doc.lineAt(node.from);
  const lastLine = state.doc.lineAt(Math.max(node.from, node.to - 1));
  if (lastLine.number - firstLine.number < 1) return null;

  const rows: TableRow[] = [];
  for (let n = firstLine.number; n <= lastLine.number; n++) {
    const kind: TableRow["kind"] = n === firstLine.number
      ? "header"
      : n === firstLine.number + 1
        ? "delimiter"
        : "body";
    rows.push(parseRow(state, n, kind));
  }

  const colCount = rows[0].cells.length;
  if (colCount === 0) return null;
  const alignments: TableAlignment[] = [];
  for (let i = 0; i < colCount; i++) {
    const cell = rows[1].cells[i];
    alignments.push(cell ? alignmentOf(cell.text) : "default");
  }

  return {
    from: node.from,
    to: node.to,
    replaceFrom: firstLine.from,
    replaceTo: lastLine.to,
    rows,
    alignments,
  };
}

export function tableBlockRef(state: EditorState, node: SyntaxNode): TableBlockRef | null {
  const model = tableModelAt(state, node);
  if (!model) return null;
  return {
    kind: "table",
    from: node.from,
    to: node.to,
    replaceFrom: model.replaceFrom,
    replaceTo: model.replaceTo,
    model,
  };
}

export function tableColumnCount(model: TableModel): number {
  return Math.max(1, model.rows[0]?.cells.length ?? 1);
}

export function tableCellAt(model: TableModel, pos: number): TableCellHit | null {
  let best: TableCellHit | null = null;
  let bestDist = Infinity;
  for (let row = 0; row < model.rows.length; row++) {
    if (model.rows[row].kind === "delimiter") continue;
    const cells = model.rows[row].cells;
    for (let col = 0; col < cells.length; col++) {
      const cell = cells[col];
      if (pos >= cell.from && pos <= cell.to) return { row, col, cell };
      const dist = pos < cell.from ? cell.from - pos : pos - cell.to;
      if (dist < bestDist) {
        bestDist = dist;
        best = { row, col, cell };
      }
    }
  }
  return best;
}

export function flatTableCells(model: TableModel): TableCellHit[] {
  const out: TableCellHit[] = [];
  for (let row = 0; row < model.rows.length; row++) {
    if (model.rows[row].kind === "delimiter") continue;
    const cells = model.rows[row].cells;
    for (let col = 0; col < cells.length; col++) {
      out.push({ row, col, cell: cells[col] });
    }
  }
  return out;
}

export function sameTableModel(a: TableModel, b: TableModel): boolean {
  if (a.from !== b.from || a.to !== b.to) return false;
  if (a.rows.length !== b.rows.length) return false;
  for (let r = 0; r < a.rows.length; r++) {
    const ra = a.rows[r];
    const rb = b.rows[r];
    if (ra.lineFrom !== rb.lineFrom || ra.cells.length !== rb.cells.length) return false;
    for (let c = 0; c < ra.cells.length; c++) {
      if (ra.cells[c].text !== rb.cells[c].text) return false;
    }
  }
  if (a.alignments.length !== b.alignments.length) return false;
  return a.alignments.every((value, index) => value === b.alignments[index]);
}
