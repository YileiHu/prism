import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { tableBlockRef, type TableBlockRef } from "./tableModel";
import { parseCalloutLine } from "./callouts";
import { mathBlockAt, type MathBlockRef } from "./mathModel";
import { embedBlockAt, type EmbedBlockRef } from "./embedBlockModel";

export interface CodeBlockRef {
  kind: "code";
  from: number;
  to: number;
  replaceFrom: number;
  replaceTo: number;
  openLine: number;
  bodyFrom: number;
  bodyTo: number;
  bodyStartLine: number;
  lineCount: number;
  infoFrom: number;
  infoTo: number;
  lang: string;
  fence: string;
  code: string;
  closed: boolean;
}

export interface CalloutBlockRef {
  kind: "callout";
  from: number;
  to: number;
  replaceFrom: number;
  replaceTo: number;
  calloutType: string;
  rawType: string;
  typeFrom: number;
  typeTo: number;
  titleFrom: number;
  title: string;
  fold: string;
}

export type BlockRef = CodeBlockRef | TableBlockRef | CalloutBlockRef | MathBlockRef | EmbedBlockRef;

const CLOSE_FENCE_BACKTICK = /^\s*`{3,}\s*$/;
const CLOSE_FENCE_TILDE = /^\s*~{3,}\s*$/;

function isNestedInContainer(node: SyntaxNode): boolean {
  let parent = node.parent;
  while (parent) {
    if (parent.name === "ListItem" || parent.name === "Blockquote") return true;
    if (parent.name === "Document") return false;
    parent = parent.parent;
  }
  return false;
}

export function codeBlockRef(state: EditorState, node: SyntaxNode): CodeBlockRef | null {
  if (node.name !== "FencedCode") return null;
  // Blocks nested in lists/quotes keep the plain source rendering for now —
  // a line-boundary block replace would detach them from their container.
  if (isNestedInContainer(node)) return null;

  const openLine = state.doc.lineAt(node.from);
  const lastLine = state.doc.lineAt(Math.max(node.from, node.to - 1));
  const openMatch = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(openLine.text);
  if (!openMatch) return null;

  const fence = openMatch[2];
  const infoStart = openLine.from + openMatch[1].length + fence.length;
  const infoText = openMatch[3];
  const leading = /^\s*/.exec(infoText)?.[0].length ?? 0;
  const lang = /^[^\s`]*/.exec(infoText.slice(leading))?.[0] ?? "";
  const infoFrom = Math.min(openLine.to, infoStart + leading);
  const infoTo = Math.min(openLine.to, infoFrom + lang.length);

  const closeRe = fence[0] === "`" ? CLOSE_FENCE_BACKTICK : CLOSE_FENCE_TILDE;
  const closed = lastLine.number > openLine.number && closeRe.test(lastLine.text);

  const bodyFrom = openLine.to < state.doc.length ? openLine.to + 1 : openLine.to;
  const bodyTo = closed ? lastLine.from : lastLine.to;
  const lineCount = bodyTo > bodyFrom ? state.doc.lineAt(bodyTo - 1).number - openLine.number : 0;

  return {
    kind: "code",
    from: node.from,
    to: node.to,
    replaceFrom: openLine.from,
    replaceTo: lastLine.to,
    openLine: openLine.number,
    bodyFrom,
    bodyTo,
    bodyStartLine: openLine.number + 1,
    lineCount,
    infoFrom,
    infoTo,
    lang,
    fence,
    code: state.doc.sliceString(bodyFrom, bodyTo),
    closed,
  };
}

export function calloutBlockRef(state: EditorState, node: SyntaxNode): CalloutBlockRef | null {
  if (node.name !== "Blockquote") return null;
  if (isNestedInContainer(node)) return null;
  const firstLine = state.doc.lineAt(node.from);
  const info = parseCalloutLine(firstLine.text);
  if (!info) return null;
  const lastLine = state.doc.lineAt(Math.max(node.from, node.to - 1));
  return {
    kind: "callout",
    from: node.from,
    to: node.to,
    replaceFrom: firstLine.from,
    replaceTo: lastLine.to,
    calloutType: info.family,
    rawType: info.rawType,
    typeFrom: firstLine.from + info.typeFrom,
    typeTo: firstLine.from + info.typeTo,
    titleFrom: firstLine.from + info.titleFrom,
    title: info.title,
    fold: info.fold,
  };
}

export function blockAt(state: EditorState, pos: number): BlockRef | null {
  const clamped = Math.max(0, Math.min(pos, state.doc.length));
  const tree = syntaxTree(state);
  // -1 first: a cursor at the end of a block still belongs to it. +1 covers
  // the block start, where -1 can resolve to the previous line's node.
  for (const side of [-1, 1] as const) {
    let node: SyntaxNode | null = tree.resolveInner(clamped, side);
    while (node) {
      if (node.name === "FencedCode") {
        const ref = codeBlockRef(state, node);
        // The node is the nearest one *before* a cursor sitting on the line
        // after the block; only claim positions inside the replaced lines.
        if (ref && clamped >= ref.replaceFrom && clamped <= ref.replaceTo) return ref;
      }
      if (node.name === "Table") {
        const ref = tableBlockRef(state, node);
        if (ref && clamped >= ref.replaceFrom && clamped <= ref.replaceTo) return ref;
      }
      if (node.name === "Blockquote") {
        const ref = calloutBlockRef(state, node);
        if (ref && clamped >= ref.replaceFrom && clamped <= ref.replaceTo) return ref;
      }
      node = node.parent;
    }
  }
  return mathBlockAt(state, clamped) ?? embedBlockAt(state, clamped);
}

export function mathBlockRefAt(state: EditorState, pos: number): MathBlockRef | null {
  const ref = blockAt(state, pos);
  return ref?.kind === "math" ? ref : null;
}

export function codeBlockAt(state: EditorState, pos: number): CodeBlockRef | null {
  const ref = blockAt(state, pos);
  return ref?.kind === "code" ? ref : null;
}

export function tableBlockAt(state: EditorState, pos: number): TableBlockRef | null {
  const ref = blockAt(state, pos);
  return ref?.kind === "table" ? ref : null;
}

export function calloutBlockAt(state: EditorState, pos: number): CalloutBlockRef | null {
  const ref = blockAt(state, pos);
  return ref?.kind === "callout" ? ref : null;
}
