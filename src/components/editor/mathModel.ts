import { StateField, type EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";

export interface MathBlockRef {
  kind: "math";
  from: number;
  to: number;
  replaceFrom: number;
  replaceTo: number;
  bodyFrom: number;
  bodyTo: number;
  openLine: number;
  closeLine: number;
  tex: string;
}

function isInCode(state: EditorState, pos: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  while (node) {
    if (node.name === "FencedCode" || node.name === "CodeBlock"
      || node.name === "CodeText" || node.name === "InlineCode"
      || node.name === "HTMLBlock") return true;
    node = node.parent;
  }
  return false;
}

function makeMathBlock(state: EditorState, open: number, close: number): MathBlockRef {
  const openLine = state.doc.line(open);
  const closeLine = state.doc.line(close);
  return {
    kind: "math",
    from: openLine.from,
    to: closeLine.to,
    replaceFrom: openLine.from,
    replaceTo: closeLine.to,
    bodyFrom: openLine.to,
    bodyTo: closeLine.from,
    openLine: open,
    closeLine: close,
    tex: state.sliceDoc(openLine.to, closeLine.from).trim(),
  };
}

function scanMathBlocks(state: EditorState): MathBlockRef[] {
  const blocks: MathBlockRef[] = [];
  let open = -1;
  let lineNo = 1;
  for (const text of state.doc.iterLines()) {
    if (text.trim() === "$$") {
      if (open >= 0) {
        blocks.push(makeMathBlock(state, open, lineNo));
        open = -1;
      } else if (!isInCode(state, state.doc.line(lineNo).from)) {
        open = lineNo;
      }
    }
    lineNo += 1;
  }
  return blocks;
}

export const mathBlocksField = StateField.define<MathBlockRef[]>({
  create: (state) => scanMathBlocks(state),
  update(value, tr) {
    const treeChanged = syntaxTree(tr.startState) !== syntaxTree(tr.state);
    if (!tr.docChanged) return treeChanged ? scanMathBlocks(tr.state) : value;

    let structural = false;
    tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
      if (structural) return;
      const removed = tr.startState.doc.sliceString(fromA, toA);
      const inserted = tr.state.doc.sliceString(fromB, toB);
      structural = /[$\n`~]/.test(removed) || /[$\n`~]/.test(inserted);
    });
    if (structural) return scanMathBlocks(tr.state);

    const next: MathBlockRef[] = [];
    for (const block of value) {
      const replaceFrom = tr.changes.mapPos(block.replaceFrom, -1);
      const replaceTo = tr.changes.mapPos(block.replaceTo, 1);
      if (replaceFrom >= replaceTo) return scanMathBlocks(tr.state);
      const openLine = tr.state.doc.lineAt(replaceFrom);
      const closeLine = tr.state.doc.lineAt(replaceTo);
      if (openLine.text.trim() !== "$$" || closeLine.text.trim() !== "$$") {
        return scanMathBlocks(tr.state);
      }
      next.push(makeMathBlock(tr.state, openLine.number, closeLine.number));
    }
    return next;
  },
});

export function mathBlockRefs(state: EditorState): MathBlockRef[] {
  return state.field(mathBlocksField, false) ?? scanMathBlocks(state);
}

export function mathBlockAt(state: EditorState, pos: number): MathBlockRef | null {
  const bounded = Math.max(0, Math.min(pos, state.doc.length));
  return mathBlockRefs(state).find(
    (block) => bounded >= block.replaceFrom && bounded <= block.replaceTo,
  ) ?? null;
}
