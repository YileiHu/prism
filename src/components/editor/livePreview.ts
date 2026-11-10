import { EditorState, Range, RangeSet, StateField, type Transaction } from "@codemirror/state";
import {
  Decoration, DecorationSet, EditorView, ViewPlugin, WidgetType, type ViewUpdate,
} from "@codemirror/view";
import { forceParsing, syntaxTree, syntaxTreeAvailable } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import type { AssetContext } from "./assetUrl";
import { withSizeInAlt } from "./imageSize";
import { mountEmbedCard } from "../embeds/embedMount";
import {
  serializeEmbedSpec,
  type EmbedOpenTarget,
  type EmbedSpec,
} from "../embeds/model";
import {
  collectEmbeds, isEmbedOnlyLine, sameEmbed,
  type EditorEmbed,
} from "./embedBlockModel";
import { DEFAULT_EMBED_LABELS, type EmbedLabels } from "../embeds/EmbedCard";
import { calloutBlockRef, codeBlockRef } from "./blockModel";
import {
  blockSession, blockSessionField, codeFoldField, containerSession, createBlockSession,
  focusedBlockField, isCodeFolded, setBlockSession, sourceSession, toggleCodeFold,
  type BlockSession,
} from "./blockState";
import {
  CalloutWidget, CodeBlockWidget, TableWidget,
  type BlockPreviewContext, type BlockWidgetLabels, type CreateSubEditor,
} from "./blockRender";
import { MathBlockWidget, MathWidget } from "./mathRender";
import { mathBlockRefs, mathBlocksField } from "./mathModel";
import { tableBlockRef } from "./tableModel";

export type { EmbedLabels };

export interface LivePreviewHooks {
  onOpenWikilink: (target: string) => void;
  onOpenLink: (url: string) => void;
  onOpenEmbed: (target: EmbedOpenTarget) => void;
  // Resolves vault-relative image refs to prism-file:// URLs for the
  // edit-mode embed widgets
  assetCtx: AssetContext;
  embedLabels?: () => EmbedLabels;
  blockLabels?: () => BlockWidgetLabels;
  onToggleTask?: (taskIndex: number) => void;
  onSave?: () => void;
  // Builds the miniature live-preview editor used for callout bodies
  createSubEditor: CreateSubEditor;
}

// Nodes whose marker text hides while the selection is outside their parent
// construct (note: heading marks are "HeaderMark" in @lezer/markdown; ListMark
// is handled separately — unordered markers become bullets, ordered stay visible;
// QuoteMark stays visible by design — blockquote "> " prefixes never hide)
const HIDDEN_MARK_NODES = new Set([
  "HeaderMark", "EmphasisMark", "StrongEmphasisMark", "StrikethroughMark",
  "CodeMark", "LinkMark",
]);

// ---- Widgets ----

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) { super(); }

  override eq(other: this): boolean { return other.checked === this.checked && other.pos === this.pos; }

  override toDOM(view: EditorView): HTMLElement {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-md-checkbox";
    box.checked = this.checked;
    box.addEventListener("mousedown", (e) => e.preventDefault());
    box.addEventListener("click", (e) => {
      e.preventDefault();
      const ch = view.state.doc.sliceString(this.pos + 1, this.pos + 2);
      view.dispatch({
        changes: { from: this.pos + 1, to: this.pos + 2, insert: ch === " " ? "x" : " " },
      });
    });
    return box;
  }

  override ignoreEvent(): boolean { return true; }
}

// Replaces "-"/"*" list markers with a dot on non-cursor lines
class BulletWidget extends WidgetType {
  override eq(other: this): boolean { return true; }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-bullet";
    span.textContent = "•";
    return span;
  }
}

// An embed found in the raw source line. from/to span the editable part: the
// alt text for ![alt](url), or the full "target|label|size" for ![[...]].
// syntaxFrom/syntaxTo cover the complete syntax so it can be copied or deleted.
// Re-read the embeds at the widget's current document position. Widgets are
// mapped through edits above them without being rebuilt, so the positions
// captured at build time can be stale by the time a toolbar button is used.
function rescanEmbedsFrom(
  view: EditorView,
  wrap: HTMLElement,
  expected: EditorEmbed[],
): EditorEmbed[] {
  let pos: number;
  try {
    pos = view.posAtDOM(wrap, 0);
  } catch {
    return expected;
  }
  const startLine = view.state.doc.lineAt(Math.max(0, Math.min(pos, view.state.doc.length)));
  const found: EditorEmbed[] = [];
  const lastLine = Math.min(view.state.doc.lines, startLine.number + expected.length + 1);
  for (let n = startLine.number; n <= lastLine && found.length < expected.length; n++) {
    found.push(...collectEmbeds(view.state, view.state.doc.line(n)));
  }
  return found.slice(0, expected.length);
}

function deleteEmbedAt(view: EditorView, embed: EditorEmbed): void {
  const { state } = view;
  if (state.sliceDoc(embed.syntaxFrom, embed.syntaxTo) !== embed.syntaxRaw) return;
  const line = state.doc.lineAt(embed.syntaxFrom);
  const rest = line.text.slice(0, embed.syntaxFrom - line.from)
    + line.text.slice(embed.syntaxTo - line.from);
  const change = rest.trim() === ""
    ? (line.to < state.doc.length
      ? { from: line.from, to: line.to + 1, insert: "" }
      : { from: Math.max(0, line.from - 1), to: line.to, insert: "" })
    : { from: embed.syntaxFrom, to: embed.syntaxTo, insert: "" };
  view.dispatch({
    changes: change,
    selection: { anchor: Math.min(change.from, state.doc.length) },
    userEvent: "delete",
  });
  view.focus();
}

// Rewrite the markdown source for one embed, preserving everything outside the
// alt/inner span. Autosave picks the change up through the normal doc-change
// listener.
function commitEmbedChange(
  view: EditorView,
  embed: EditorEmbed,
  patch: { size?: EmbedSpec["size"]; label?: string },
): void {
  if (embed.from < 0 || embed.to > view.state.doc.length) return;
  if (view.state.sliceDoc(embed.from, embed.to) !== embed.raw) return;
  let insert: string;
  if (embed.syntax === "embed") {
    insert = serializeEmbedSpec({ ...embed.spec, ...patch });
  } else {
    const label = patch.label !== undefined ? patch.label : embed.spec.label ?? "";
    const size = patch.size !== undefined ? patch.size : embed.spec.size;
    insert = withSizeInAlt(label, size);
  }
  if (insert === embed.raw) return;
  view.dispatch({ changes: { from: embed.from, to: embed.to, insert }, userEvent: "input" });
  view.focus();
}

// Card roots mount independent React trees; the widget owns their cleanup.
const embedCleanups = new WeakMap<HTMLElement, (() => void)[]>();

// Editable embed cards. A blockRange marks the line-replacement form (source
// hidden); without one the widget is the preview below a mixed source line.
class EmbedPreviewWidget extends WidgetType {
  constructor(
    readonly embeds: EditorEmbed[],
    readonly labels: () => EmbedLabels,
    readonly assetCtx: AssetContext,
    readonly onOpen: (target: EmbedOpenTarget) => void,
    readonly blockRange: { from: number; to: number } | null = null,
  ) { super(); }

  override eq(other: this): boolean {
    return other.embeds.length === this.embeds.length
      && (other.blockRange == null) === (this.blockRange == null)
      && other.embeds.every((embed, i) => sameEmbed(embed, this.embeds[i]));
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-md-block-widget cm-md-embed-preview";
    if (this.blockRange) {
      wrap.dataset.blockKind = "embed";
      wrap.dataset.blockFrom = String(this.blockRange.from);
      wrap.dataset.blockTo = String(this.blockRange.to);
    }
    const labels = this.labels();
    const cleanups: (() => void)[] = [];
    this.embeds.forEach((embed, index) => {
      const host = document.createElement("div");
      host.className = "cm-md-embed-host";
      wrap.appendChild(host);
      const current = () => rescanEmbedsFrom(view, wrap, this.embeds)[index] ?? null;
      cleanups.push(mountEmbedCard(host, {
        spec: embed.spec,
        ctx: this.assetCtx,
        editable: true,
        labels,
        onOpen: this.onOpen,
        onSizeCommit: (size) => {
          const live = current();
          if (live) commitEmbedChange(view, live, { size });
        },
        onLabelCommit: (label) => {
          const live = current();
          if (live) commitEmbedChange(view, live, { label });
        },
        onCopySyntax: () => {
          const live = current();
          if (live) void navigator.clipboard.writeText(live.syntaxRaw);
        },
        onDelete: () => {
          const live = current();
          if (live) deleteEmbedAt(view, live);
        },
        onEditSource: () => {
          const live = current();
          if (!live) return;
          const line = view.state.doc.lineAt(live.syntaxFrom);
          view.dispatch({
            effects: setBlockSession.of(createBlockSession({
              kind: "embed",
              mode: "source",
              from: line.from,
              to: line.to,
              anchor: live.syntaxFrom,
            })),
            selection: { anchor: live.syntaxFrom },
            scrollIntoView: true,
          });
          view.focus();
        },
      }));
    });
    embedCleanups.set(wrap, cleanups);
    return wrap;
  }

  override destroy(dom: HTMLElement): void {
    const cleanups = embedCleanups.get(dom);
    if (!cleanups) return;
    embedCleanups.delete(dom);
    for (const cleanup of cleanups) cleanup();
  }
}

// ---- Helpers ----

function isActiveLine(activeLines: Set<number>, state: EditorState, pos: number): boolean {
  return activeLines.has(state.doc.lineAt(pos).number);
}

// Obsidian reveals inline syntax at construct granularity: only when the
// cursor/selection actually overlaps the construct's range — sitting on the
// same line (e.g. right after a pasted image) keeps it rendered
function selectionIntersects(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.from <= to && range.to >= from) return true;
  }
  return false;
}

function isInCode(state: EditorState, pos: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  while (node) {
    if (node.name === "FencedCode" || node.name === "CodeBlock" || node.name === "CodeText" || node.name === "InlineCode" || node.name === "HTMLBlock") {
      return true;
    }
    node = node.parent;
  }
  return false;
}

// ---- Incremental rebuild windowing ----

interface BuildWindow {
  fromLine: number;
  toLine: number;
}

// Inline constructs reveal/hide as a whole when the selection enters them.
// Expanding a partial rebuild to cover these keeps it equivalent to a full one.
const EXPAND_INLINE_NODES = new Set([
  "Emphasis", "StrongEmphasis", "Strikethrough", "InlineCode", "Link", "Image",
  "ATXHeading1", "ATXHeading2", "ATXHeading3", "ATXHeading4", "ATXHeading5", "ATXHeading6",
  "SetextHeading1", "SetextHeading2",
]);

// Nearest enclosing block that can gain or lose decorations when its
// delimiter changes (paragraph reflow, table rows, heading markers).
const BLOCK_BOUNDARY_NODES = new Set([
  "Paragraph", "ListItem", "Table", "TableRow", "TableHeader", "TableCell",
  "ATXHeading1", "ATXHeading2", "ATXHeading3", "ATXHeading4", "ATXHeading5", "ATXHeading6",
  "SetextHeading1", "SetextHeading2",
]);

// Edits inside code never change surrounding decorations; keep them local.
const CODE_BLOCK_NODES = new Set(["FencedCode", "CodeBlock", "HTMLBlock"]);

function findFrontmatter(state: EditorState): BuildWindow | null {
  if (state.doc.line(1).text.trim() !== "---") return null;
  for (let n = 2; n <= state.doc.lines; n++) {
    if (state.doc.line(n).text.trim() === "---") return { fromLine: 1, toLine: n };
  }
  return null;
}

function lineWindowForRange(state: EditorState, from: number, to: number): BuildWindow {
  const length = state.doc.length;
  const start = Math.max(0, Math.min(from, length));
  const end = Math.max(start, Math.min(to, length));
  return {
    fromLine: state.doc.lineAt(start).number,
    toLine: state.doc.lineAt(end > start ? end - 1 : end).number,
  };
}

function expandInlineAt(
  state: EditorState,
  pos: number,
  include: (from: number, to: number) => void,
): void {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(Math.min(pos, state.doc.length), 1);
  while (node) {
    if (EXPAND_INLINE_NODES.has(node.name)) include(node.from, node.to);
    if (node.name === "Document") break;
    node = node.parent;
  }
}

function expandBlockAt(
  state: EditorState,
  pos: number,
  include: (from: number, to: number) => void,
): void {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(Math.min(pos, state.doc.length), 1);
  while (node) {
    if (CODE_BLOCK_NODES.has(node.name)) return;
    if (BLOCK_BOUNDARY_NODES.has(node.name)) {
      include(node.from, node.to);
      return;
    }
    if (node.name === "Document") return;
    node = node.parent;
  }
}

interface RenderBlockRange {
  from: number;
  to: number;
}

// Nearest block that toggles between rendered-source and replaced-card states.
// Used to expand the rebuild window when the selection enters or leaves one.
function renderBlockRangeAt(state: EditorState, pos: number): RenderBlockRange | null {
  const clamped = Math.max(0, Math.min(pos, state.doc.length));
  const tree = syntaxTree(state);
  const lineNo = state.doc.lineAt(clamped).number;
  const linesOf = (node: SyntaxNode): [number, number] => [
    state.doc.lineAt(node.from).number,
    state.doc.lineAt(Math.max(node.from, node.to - 1)).number,
  ];
  for (const side of [-1, 1] as const) {
    let node: SyntaxNode | null = tree.resolveInner(clamped, side);
    while (node) {
      if (node.name === "FencedCode" || node.name === "Table") {
        const [first, last] = linesOf(node);
        // Checking line containment (not just from/to) treats leading
        // indentation as part of the block while excluding the line after it,
        // which resolveInner(-1) would otherwise attribute to the block.
        if (lineNo >= first && lineNo <= last) return { from: node.from, to: node.to };
      }
      if (node.name === "Blockquote") {
        const [first, last] = linesOf(node);
        if (lineNo >= first && lineNo <= last) {
          const callout = calloutBlockRef(state, node);
          if (callout) return { from: callout.from, to: callout.to };
        }
      }
      if (node.name === "Document") break;
      node = node.parent;
    }
  }
  return null;
}

// A full rebuild is required when an edit can change decorations far beyond
// its own range: fenced code may swallow or release the rest of the document,
// frontmatter/$$ blocks re-pair, or the edit is simply too large to window.
function needsFullRebuild(startState: EditorState, tr: Transaction): boolean {
  if (tr.effects.some((effect) => effect.is(toggleCodeFold)
    || (effect.is(setBlockSession) && effect.value?.mode === "source"))) return true;
  if (Math.abs(tr.newDoc.length - startState.doc.length) > 2000) return true;
  let structural = false;
  let edits = 0;
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    edits += 1;
    if (edits > 50) {
      structural = true;
      return;
    }
    const oldWindow = lineWindowForRange(startState, fromA, toA);
    const newWindow = lineWindowForRange(tr.state, fromB, toB);
    const isStructural = (text: string): boolean => {
      const trimmed = text.trim();
      return trimmed.startsWith("```") || trimmed.startsWith("~~~")
        || trimmed === "$$" || trimmed === "---";
    };
    if (
      isStructural(startState.doc.line(oldWindow.fromLine).text)
      || isStructural(startState.doc.line(oldWindow.toLine).text)
      || isStructural(tr.state.doc.line(newWindow.fromLine).text)
      || isStructural(tr.state.doc.line(newWindow.toLine).text)
    ) {
      structural = true;
    }
  });
  return structural;
}

function computeWindow(
  state: EditorState,
  tr: Transaction,
  mapped: DecorationSet,
): BuildWindow | null {
  const mathBlocks = mathBlockRefs(state);
  const frontmatter = findFrontmatter(state);

  let fromLine = Number.POSITIVE_INFINITY;
  let toLine = Number.NEGATIVE_INFINITY;
  const grow = (from: number, to: number) => {
    if (from < fromLine) fromLine = from;
    if (to > toLine) toLine = to;
  };
  const include = (from: number, to: number) => {
    const window = lineWindowForRange(state, from, to);
    grow(window.fromLine, window.toLine);
  };

  const selectionPositions: number[] = [];
  for (const range of tr.newSelection.ranges) {
    const window = lineWindowForRange(state, range.from, range.to);
    grow(window.fromLine, window.toLine);
    selectionPositions.push(range.from, range.to);
  }
  // On a pure selection change the document is unchanged, so old cursor
  // positions still identify constructs that must hide again.
  if (!tr.docChanged) {
    for (const range of tr.startState.selection.ranges) {
      const window = lineWindowForRange(state, range.from, range.to);
      grow(window.fromLine, window.toLine);
      selectionPositions.push(range.from, range.to);
    }
  }

  const changedPositions: number[] = [];
  if (tr.docChanged) {
    tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
      const window = lineWindowForRange(state, fromB, toB);
      grow(window.fromLine, window.toLine);
      changedPositions.push(fromB, toB);
    });
  }

  // A change inside a rendered block made from outside (toolbar actions such
  // as changing a language or a table column) must rebuild the whole block.
  // Otherwise the mapped widget is dropped and the rest of the block loses
  // its decorations. Edits made while the selection is inside the block stay
  // on the cheap windowed path.
  if (tr.docChanged) {
    for (const pos of changedPositions) {
      const block = renderBlockRangeAt(state, pos);
      if (!block) continue;
      const selected = state.selection.ranges.some(
        (range) => range.from <= block.to && range.to >= block.from,
      );
      if (!selected) include(block.from, block.to);
    }
  }

  // A block that just gained or lost the selection must be rebuilt in full —
  // otherwise a table or code block can stay half source and half rendered.
  // Moves *within* the same block stay on the cheap path (the block was and
  // remains source), so long code blocks don't rebuild on every keystroke.
  const newBlocks = new Map<string, RenderBlockRange>();
  for (const range of tr.newSelection.ranges) {
    const block = renderBlockRangeAt(state, range.from) ?? renderBlockRangeAt(state, range.to);
    if (block) newBlocks.set(`${block.from}:${block.to}`, block);
  }
  const oldBlocks = new Map<string, RenderBlockRange>();
  for (const range of tr.startState.selection.ranges) {
    const block = renderBlockRangeAt(tr.startState, range.from) ?? renderBlockRangeAt(tr.startState, range.to);
    if (!block) continue;
    const from = tr.changes.mapPos(block.from, 1);
    const to = tr.changes.mapPos(block.to, -1);
    oldBlocks.set(`${from}:${to}`, { from, to });
  }
  for (const [key, block] of newBlocks) {
    if (!oldBlocks.has(key)) include(block.from, block.to);
  }
  for (const [key, block] of oldBlocks) {
    if (!newBlocks.has(key)) include(block.from, block.to);
  }

  // Container edit state changes must rebuild the affected block without a
  // full-document rebuild (cell-to-cell navigation is effect-only). Toggling
  // edit mode is an effect, so the state object differs; a background parse
  // advance keeps the same object and must not touch an open editor.
  const oldContainer = containerSession(tr.startState);
  const newContainer = containerSession(state);
  if (!sameContainerState(oldContainer, newContainer)) {
    if (oldContainer) {
      // Map into the new document: a code/callout commit can add or remove
      // lines, and the old end position would otherwise miss the block tail.
      include(
        tr.changes.mapPos(oldContainer.from, -1),
        tr.changes.mapPos(oldContainer.to, 1),
      );
    }
    if (newContainer) include(newContainer.from, newContainer.to);
  }

  if (fromLine === Number.POSITIVE_INFINITY) return null;

  for (let pass = 0; pass < 6; pass++) {
    const previousFrom = fromLine;
    const previousTo = toLine;

    for (const pos of selectionPositions) expandInlineAt(state, pos, include);
    for (const pos of changedPositions) expandBlockAt(state, pos, include);

    for (const block of mathBlocks) {
      if (block.openLine <= toLine && block.closeLine >= fromLine) {
        grow(block.openLine, block.closeLine);
      }
    }
    if (frontmatter && frontmatter.fromLine <= toLine && frontmatter.toLine >= fromLine) {
      grow(frontmatter.fromLine, frontmatter.toLine);
    }

    const fromPos = state.doc.line(fromLine).from;
    const toPos = state.doc.line(toLine).to;
    expandInlineAt(state, fromPos, include);
    expandInlineAt(state, toPos, include);
    mapped.between(fromPos, toPos, (from, to) => include(from, to));

    if (fromLine === previousFrom && toLine === previousTo) break;
  }

  return {
    fromLine: Math.max(1, Math.min(fromLine, state.doc.lines)),
    toLine: Math.max(1, Math.min(toLine, state.doc.lines)),
  };
}

function sameContainerState(
  a: BlockSession | null,
  b: BlockSession | null,
): boolean {
  if (!a || !b) return a === b;
  return a.id === b.id
    && a.from === b.from
    && a.to === b.to
    && a.mode === b.mode
    && a.target?.kind === b.target?.kind
    && (a.target?.kind !== "table" || b.target?.kind !== "table"
      || (a.target.row === b.target.row && a.target.col === b.target.col));
}

// The parser initially covers only a prefix of the document. When background
// parsing advances, rebuild the newly parsed region. The outermost node that
// straddles the old boundary may start many lines above it (a code fence or a
// paragraph whose emphasis only closes in the new text), so include it whole.
function treeAdvanceWindow(tr: Transaction, previous: DecorationSet): BuildWindow {
  const state = tr.state;
  const oldLen = syntaxTree(tr.startState).length;
  const newLen = syntaxTree(state).length;
  if (newLen <= oldLen) {
    return { fromLine: 1, toLine: state.doc.lines };
  }
  let start = oldLen;
  let node = syntaxTree(state).resolveInner(oldLen, 1);
  while (node.parent && node.parent.name !== "Document") node = node.parent;
  if (node.name !== "Document") start = Math.min(node.from, oldLen);
  let fromLine = state.doc.lineAt(start).number;
  let toLine = Math.min(
    state.doc.lines,
    state.doc.lineAt(Math.min(newLen, state.doc.length)).number + 1,
  );
  // The windowed build only replaces a rendered block when the block fits
  // entirely inside it; cutting one in half would drop its widget. Expand
  // over anything the window touches — widget equality keeps an open
  // container editor's DOM (and draft) alive while its block is rebuilt.
  for (let grew = true; grew;) {
    grew = false;
    const from = state.doc.line(fromLine).from;
    const to = state.doc.line(toLine).to;
    previous.between(from, to, (rangeFrom, rangeTo) => {
      const window = lineWindowForRange(state, rangeFrom, rangeTo);
      if (window.fromLine < fromLine) {
        fromLine = window.fromLine;
        grew = true;
      }
      if (window.toLine > toLine) {
        toLine = window.toLine;
        grew = true;
      }
    });
  }
  return { fromLine, toLine };
}

function forEachDecoration(
  set: DecorationSet,
  visit: (from: number, to: number, value: Decoration) => void,
): void {
  for (let iter = set.iter(); iter.value; iter.next()) {
    visit(iter.from, iter.to, iter.value);
  }
}

function mergeDecorations(
  previous: DecorationSet,
  next: DecorationSet,
  state: EditorState,
  window: BuildWindow,
): DecorationSet {
  const from = state.doc.line(window.fromLine).from;
  const to = state.doc.line(window.toLine).to;
  const ranges: Range<Decoration>[] = [];
  if (from > 0) {
    previous.between(0, from, (rangeFrom, rangeTo, value) => {
      if (rangeTo < from) ranges.push(value.range(rangeFrom, rangeTo));
    });
  }
  if (to < state.doc.length) {
    previous.between(to, state.doc.length, (rangeFrom, rangeTo, value) => {
      if (rangeFrom > to) ranges.push(value.range(rangeFrom, rangeTo));
    });
  }
  forEachDecoration(next, (rangeFrom, rangeTo, value) => {
    ranges.push(value.range(rangeFrom, rangeTo));
  });
  return Decoration.set(ranges, true);
}

// Replaces must not overlap each other — first come wins
class DecorationsBuilder {
  private replaceRanges: Array<[number, number]> = [];

  private insertionIndex(from: number, to: number): number | null {
    let low = 0;
    let high = this.replaceRanges.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.replaceRanges[mid][1] <= from) low = mid + 1;
      else high = mid;
    }
    if (low < this.replaceRanges.length && this.replaceRanges[low][0] < to) return null;
    return low;
  }

  canReplace(from: number, to: number): boolean {
    return this.insertionIndex(from, to) != null;
  }

  markReplace(ranges: Range<Decoration>[], from: number, to: number, spec: Parameters<typeof Decoration.replace>[0]): boolean {
    const index = this.insertionIndex(from, to);
    if (index == null) return false;
    this.replaceRanges.splice(index, 0, [from, to]);
    ranges.push(Decoration.replace(spec).range(from, to));
    return true;
  }
}

// Splits "[[target|alias]]" / "![[target|alias]]" internals: how much of the
// opening to hide so only the display text (alias or target) stays visible
function wikilinkParts(inner: string): { target: string; hiddenHead: number } {
  const pipe = inner.indexOf("|");
  if (pipe === -1) return { target: inner.trim(), hiddenHead: 0 };
  return { target: inner.slice(0, pipe).trim(), hiddenHead: pipe + 1 };
}

// Regex-based inline decorations for syntax the lezer grammar doesn't model
// (wikilinks, ==highlight==, #tags, $math$). Embed syntax is collected
// separately by collectEmbeds so it can be folded as a whole line/group.
function collectRegexDecorations(
  state: EditorState,
  line: { from: number; text: string },
  ranges: Range<Decoration>[],
  builder: DecorationsBuilder,
): void {
  // Per-match construct granularity: a construct stays raw only while the
  // selection overlaps its own range
  const tryAdd = (re: RegExp, apply: (m: RegExpExecArray, from: number, to: number) => void): void => {
    re.lastIndex = 0;
    for (let m = re.exec(line.text); m; m = re.exec(line.text)) {
      const from = line.from + m.index;
      const to = from + m[0].length;
      if (selectionIntersects(state, from, to)) continue;
      if (isInCode(state, from)) continue;
      apply(m, from, to);
    }
  };

  // [[wikilinks]] — hide "[[target|" + "]]" so only the alias shows.
  // (?<!!) excludes the inner "[[...]]" of an embed — the embed branch owns it
  tryAdd(/(?<!!)\[\[([^\[\]\n]+)\]\]/g, (m, from, to) => {
    const { target, hiddenHead } = wikilinkParts(m[1]);
    const headTo = from + 2 + hiddenHead;
    if (!builder.markReplace(ranges, from, headTo, { class: "cm-md-hidden" })) return;
    builder.markReplace(ranges, to - 2, to, { class: "cm-md-hidden" });
    ranges.push(Decoration.mark({ class: "cm-md-wikilink", attributes: { "data-wikilink": target } }).range(headTo, to - 2));
  });

  // ==highlight==
  tryAdd(/==[^=\n]+==/g, (_m, from, to) => {
    if (!builder.markReplace(ranges, from, from + 2, { class: "cm-md-hidden" })) return;
    builder.markReplace(ranges, to - 2, to, { class: "cm-md-hidden" });
    ranges.push(Decoration.mark({ class: "cm-md-highlight" }).range(from + 2, to - 2));
  });

  // $$display$$ then $inline$ (longest delimiters first)
  tryAdd(/\$\$[^$\n]+\$\$/g, (m, from, to) => {
    builder.markReplace(ranges, from, to, {
      widget: new MathWidget(m[0].slice(2, -2), true, from + 2),
      block: false,
    });
  });
  tryAdd(/(?<![$\\])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)(?![$])/g, (m, from, to) => {
    builder.markReplace(ranges, from, to, {
      widget: new MathWidget(m[1], false, from + 1),
      block: false,
    });
  });

  // #tags
  tryAdd(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu, (m) => {
    const tagStart = line.from + m.index + m[0].length - m[0].trimStart().length;
    ranges.push(Decoration.mark({ class: "cm-md-tag" }).range(tagStart, tagStart + m[0].trimStart().length));
  });
}

// ---- Decoration computation ----

// Block decorations ($$ math blocks) may NOT come from a ViewPlugin's dynamic
// decorations — CM6 throws "Block decorations may not be specified via
// plugins" — so this lives in a StateField provided through
// EditorView.decorations.from. An optional line window restricts the build to
// the region that can actually change; the untouched remainder is carried over
// from the previous decoration set.
function buildDecorations(
  state: EditorState,
  hooks: LivePreviewHooks,
  window?: BuildWindow,
): DecorationSet {
  const windowFromLine = window?.fromLine ?? 1;
  const windowToLine = window?.toLine ?? state.doc.lines;
  const windowFrom = state.doc.line(windowFromLine).from;
  const windowTo = state.doc.line(windowToLine).to;
  const editRange = sourceSession(state);
  const blockLabels = hooks.blockLabels?.() ?? {
    codeLines: (count: number) => `${count} lines`,
  };
  const embedLabels = hooks.embedLabels?.() ?? DEFAULT_EMBED_LABELS;
  const preview: BlockPreviewContext = {
    assetContext: hooks.assetCtx,
    embedLabels,
    onOpenWikilink: hooks.onOpenWikilink,
    onOpenLink: hooks.onOpenLink,
    onOpenEmbed: hooks.onOpenEmbed,
    onToggleTask: hooks.onToggleTask,
    createSubEditor: hooks.createSubEditor,
  };

  const activeLines = new Set<number>();
  for (const range of state.selection.ranges) {
    const from = state.doc.lineAt(range.from).number;
    const to = state.doc.lineAt(range.to).number;
    for (let n = from; n <= to; n++) activeLines.add(n);
  }

  const ranges: Range<Decoration>[] = [];
  const builder = new DecorationsBuilder();

  // 1) Grammar-driven decorations
  syntaxTree(state).iterate({
    ...(window ? { from: windowFrom, to: windowTo } : {}),
    enter: (node) => {
      // Explicit edit mode: the block's source is shown as plain text, with
      // just the line background added by the per-line pass below.
      if (editRange && node.from >= editRange.from && node.to <= editRange.to) {
        return false;
      }

      // Heading lines carry a level class so the editor's vertical rhythm can
      // match the reading view (line-height + padding, see cmExtensions).
      if (node.name.startsWith("ATXHeading") || node.name.startsWith("SetextHeading")) {
        const line = state.doc.lineAt(node.from);
        if (line.number >= windowFromLine && line.number <= windowToLine) {
          ranges.push(Decoration.line({
            class: `cm-md-heading cm-md-heading-${node.name.slice(-1)}`,
          }).range(line.from));
        }
        return true;
      }

      if (node.name === "ListMark") {
        if (node.from < windowFrom || node.to > windowTo) return false;
        if (isActiveLine(activeLines, state, node.from)) return false;
        const text = state.doc.sliceString(node.from, node.to);
        if (!/^\d/.test(text.trim())) {
          builder.markReplace(ranges, node.from, node.to, {
            widget: new BulletWidget(),
            block: false,
          });
        } else {
          // Ordered list numbers stay visible as plain text
        }
        return false;
      }

      if (node.name === "TaskMarker") {
        if (node.from < windowFrom || node.to > windowTo) return false;
        if (isActiveLine(activeLines, state, node.from)) return false;
        const ch = state.doc.sliceString(node.from + 1, node.from + 2);
        builder.markReplace(ranges, node.from, node.to, {
          widget: new CheckboxWidget(ch === "x" || ch === "X", node.from),
          block: false,
        });
        return false;
      }

      // Inline links "[text](url)": hide "[" and "](url)", keep the text
      // as a styled, Ctrl+clickable link (Obsidian live preview behavior)
      if (node.name === "Link") {
        if (node.from < windowFrom || node.to > windowTo) return false;
        if (selectionIntersects(state, node.from, node.to)) return true;
        const text = state.doc.sliceString(node.from, node.to);
        const m = /^\[([^\]]*)\]\(((?:<[^>]*>|[^\s"']|\([^)]*\))+)/.exec(text);
        if (m) {
          const labelFrom = node.from + 1;
          const labelTo = labelFrom + m[1].length;
          const url = m[2].replace(/^<|>$/g, "");
          builder.markReplace(ranges, node.from, labelFrom, { class: "cm-md-hidden" });
          builder.markReplace(ranges, labelTo, node.to, { class: "cm-md-hidden" });
          ranges.push(Decoration.mark({
            class: "cm-md-link",
            attributes: { "data-url": url, title: url },
          }).range(labelFrom, labelTo));
          return false;
        }
        return true;
      }

      // Bare URLs / autolinks: keep the text, make it Ctrl+clickable
      if (node.name === "URL") {
        if (node.from < windowFrom || node.to > windowTo) return true;
        const parentName = node.node.parent?.name;
        if (parentName === "Link" || parentName === "Image") return true;
        const url = state.doc.sliceString(node.from, node.to).replace(/^<|>$/g, "");
        ranges.push(Decoration.mark({
          class: "cm-md-link",
          attributes: { "data-url": url, title: url },
        }).range(node.from, node.to));
        return true;
      }

      if (node.name === "Blockquote") {
        const callout = calloutBlockRef(state, node.node);
        if (callout && callout.replaceFrom >= windowFrom && callout.replaceTo <= windowTo) {
          const source = state.doc.sliceString(callout.replaceFrom, callout.replaceTo);
          const container = containerSession(state);
          const editing = container?.kind === "callout"
            && container.from <= callout.replaceFrom
            && container.to >= callout.replaceTo;
          const target = editing && container.target?.kind === "callout"
            ? container.target
            : undefined;
          const replaced = builder.markReplace(ranges, callout.replaceFrom, callout.replaceTo, {
            widget: new CalloutWidget(
              callout, source, hooks.assetCtx,
              editing && container ? container.id : null, target, preview, hooks.onSave,
            ),
            block: true,
          });
          if (replaced) return false;
        }
        const lineFrom = state.doc.lineAt(node.from).number;
        const lineTo = state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
        for (let n = Math.max(lineFrom, windowFromLine); n <= Math.min(lineTo, windowToLine); n++) {
          if (!activeLines.has(n)) {
            ranges.push(Decoration.line({ class: "cm-md-blockquote" }).range(state.doc.line(n).from));
          }
        }
        return true;
      }

      // GFM table: unfocused tables become a rendered grid; focused ones keep
      // the source plus the usual inline decorations.
      if (node.name === "Table") {
        if (node.from >= windowFrom && node.to <= windowTo) {
          const ref = tableBlockRef(state, node.node);
          if (ref) {
            const container = containerSession(state);
            const editing = container?.kind === "table"
              && container.from <= ref.replaceFrom
              && container.to >= ref.replaceTo;
            const target = editing && container.target?.kind === "table"
              ? container.target
              : undefined;
            const replaced = builder.markReplace(ranges, ref.replaceFrom, ref.replaceTo, {
              widget: new TableWidget(
                ref.model,
                hooks.assetCtx,
                editing && container ? container.id : null,
                target,
                preview,
                hooks.onSave,
              ),
              block: true,
            });
            if (replaced) return false;
          }
        }
        return true;
      }

      // Fenced/indented code. An unfocused fenced block becomes a card; when
      // the selection is inside it (or the block is only partly in the rebuild
      // window) the source stays visible with the usual line decorations.
      if (node.name === "FencedCode" || node.name === "CodeBlock") {
        if (node.name === "FencedCode") {
          const ref = codeBlockRef(state, node.node);
          if (ref && ref.replaceFrom >= windowFrom && ref.replaceTo <= windowTo) {
            const container = containerSession(state);
            const editing = container?.kind === "code"
              && container.from <= ref.replaceFrom
              && container.to >= ref.replaceTo;
            const target = editing && container.target?.kind === "code"
              ? container.target
              : undefined;
            const replaced = builder.markReplace(ranges, ref.replaceFrom, ref.replaceTo, {
              widget: new CodeBlockWidget(
                ref, isCodeFolded(state, ref.from), blockLabels,
                editing && container ? container.id : null, target, hooks.onSave,
              ),
              block: true,
            });
            if (replaced) return false;
          }
        }
        const firstLine = state.doc.lineAt(node.from).number;
        const lastLine = state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
        for (let n = Math.max(firstLine, windowFromLine); n <= Math.min(lastLine, windowToLine); n++) {
          ranges.push(Decoration.line({ class: "cm-md-codeblock" }).range(state.doc.line(n).from));
        }
        return false;
      }

      if (HIDDEN_MARK_NODES.has(node.name)) {
        if (node.from < windowFrom || node.to > windowTo) return false;
        const parent = node.node.parent;
        // Image syntax (![alt](url)) always stays raw and editable — a
        // non-editable preview renders below the line instead
        if (parent?.name === "Image") return false;
        // Wikilinks ([[...]]) parse as Link nodes — their marks are handled
        // by the regex pass below, so don't let the grammar pass claim (and
        // fragment) those ranges first
        if (parent && parent.name === "Link") {
          // Lezer parses "[[x]]" as "[" + Link("[x]") + "]" — detect the
          // wikilink by the brackets surrounding the construct and leave
          // those marks to the regex pass below, so it can decorate the
          // whole construct at once
          const head = state.doc.sliceString(parent.from, Math.min(parent.from + 3, parent.to));
          const before = state.doc.sliceString(Math.max(0, parent.from - 1), parent.from);
          const after = state.doc.sliceString(parent.to, Math.min(state.doc.length, parent.to + 1));
          if (head.startsWith("[[") || (before === "[" && after === "]")) return false;
        }
        // Reveal at construct granularity: the mark stays visible only
        // while the selection overlaps its parent construct (the whole
        // emphasis/link/heading, not just the mark itself)
        if (selectionIntersects(state, parent?.from ?? node.from, parent?.to ?? node.to)) return false;
        // Heading marks swallow the following space too — otherwise the
        // text stays indented by one space once "##" is hidden
        let to = node.to;
        if (node.name === "HeaderMark" && state.doc.sliceString(to, to + 1) === " ") to += 1;
        builder.markReplace(ranges, node.from, to, { class: "cm-md-hidden" });
        return false;
      }
      return true;
    },
  });

  // 2) Multi-line $$ math blocks — replaced as a whole until explicitly edited
  for (const ref of mathBlockRefs(state)) {
    if (ref.openLine < windowFromLine || ref.closeLine > windowToLine) continue;
    if (editRange && ref.replaceFrom <= editRange.to && ref.replaceTo >= editRange.from) continue;
    const container = containerSession(state);
    const editing = container?.kind === "math"
      && container.from <= ref.replaceFrom
      && container.to >= ref.replaceTo;
    const target = editing && container.target?.kind === "math"
      ? container.target
      : undefined;
    builder.markReplace(ranges, ref.replaceFrom, ref.replaceTo, {
      widget: new MathBlockWidget(
        ref, editing && container ? container.id : null, target, hooks.onSave,
      ),
      block: true,
    });
  }

  // 3) Frontmatter: de-emphasize the whole "--- ... ---" block at doc start
  const frontmatter = findFrontmatter(state);
  if (frontmatter && frontmatter.fromLine >= windowFromLine && frontmatter.toLine <= windowToLine) {
    for (let k = frontmatter.fromLine; k <= frontmatter.toLine; k++) {
      ranges.push(Decoration.line({ class: "cm-md-frontmatter" }).range(state.doc.line(k).from));
    }
  }

  // 4) Regex-driven decorations, line by line. Embed-only lines collapse into
  // cards until explicitly edited; mixed lines keep the source and show a
  // preview below.
  const labels = () => embedLabels;
  const embedLines: { lineNo: number; embeds: EditorEmbed[]; embedOnly: boolean; edited: boolean }[] = [];
  for (let n = windowFromLine; n <= windowToLine; n++) {
    const line = state.doc.line(n);
    if (editRange && line.from <= editRange.to && line.to >= editRange.from) {
      embedLines.push({ lineNo: n, embeds: [], embedOnly: false, edited: true });
      continue;
    }
    const embeds = collectEmbeds(state, line);
    embedLines.push({
      lineNo: n,
      embeds,
      embedOnly: embeds.length > 0 && isEmbedOnlyLine(line.text, embeds),
      edited: false,
    });
  }

  for (const info of embedLines) {
    const line = state.doc.line(info.lineNo);
    if (info.edited) {
      const classes = editRange?.kind === "code"
        ? "cm-md-block-edit cm-md-codeblock"
        : "cm-md-block-edit";
      ranges.push(Decoration.line({ class: classes }).range(line.from));
      continue;
    }
    if (info.embedOnly) {
      const replaced = builder.markReplace(ranges, line.from, line.to, {
        widget: new EmbedPreviewWidget(
          info.embeds, labels, hooks.assetCtx, hooks.onOpenEmbed,
          { from: line.from, to: line.to },
        ),
        block: true,
      });
      if (replaced) continue;
    }
    collectRegexDecorations(state, line, ranges, builder);
    if (info.embeds.length > 0) {
      ranges.push(Decoration.widget({
        widget: new EmbedPreviewWidget(info.embeds, labels, hooks.assetCtx, hooks.onOpenEmbed),
        block: true,
        side: 1,
      }).range(line.to));
    }
  }

  // Line decorations must come first in the sorted set
  return Decoration.set(ranges, true);
}

// Background parsing reaches far ahead on its own, but it may hold a completed
// parse in its context before dispatching it to the state. Push the parser
// forward for the visible viewport and dispatch, so scrolling into an unparsed
// region doesn't leave headings/blocks raw until the user clicks.
function parseViewportOnDemand() {
  return ViewPlugin.fromClass(class {
    private raf = 0;
    private view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      this.schedule();
    }

    update(update: ViewUpdate): void {
      if (update.viewportChanged) this.schedule();
    }

    private schedule(): void {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        if (!this.view.dom.isConnected) return;
        const upto = this.view.viewport.to;
        if (syntaxTreeAvailable(this.view.state, upto)) return;
        forceParsing(this.view, upto, 40);
      });
    }

    destroy(): void {
      if (this.raf) cancelAnimationFrame(this.raf);
    }
  });
}

export function livePreview(hooks: LivePreviewHooks) {
  const decorationsField = StateField.define<DecorationSet>({
    create: (state) => buildDecorations(state, hooks),
    update: (deco, tr) => {
      // The language parser feeds a transaction when its tree advances; that
      // transaction has no doc/selection change but new regions of the note
      // must get their live-preview decorations.
      const treeChanged = !tr.docChanged
        && syntaxTree(tr.startState) !== syntaxTree(tr.state);
      const actionEffects = tr.effects.some(
        (effect) => effect.is(setBlockSession) || effect.is(toggleCodeFold),
      );
      if (!tr.docChanged && !tr.selection && !treeChanged && !actionEffects) {
        return deco;
      }

      const state = tr.state;
      if (tr.docChanged && needsFullRebuild(tr.startState, tr)) {
        return buildDecorations(state, hooks);
      }
      // Folding swaps a card's body; a full rebuild keeps the path simple.
      if (tr.effects.some((effect) => effect.is(toggleCodeFold))) {
        return buildDecorations(state, hooks);
      }

      const previous = tr.docChanged ? deco.map(tr.changes) : deco;
      // Pure background-parse advances have no document or selection change:
      // rebuild only the newly parsed region. computeWindow could widen the
      // window toward the selection and tear down an open container editor.
      const parseOnly = treeChanged && !tr.docChanged && !tr.selection && !actionEffects;
      const windows: BuildWindow[] = [];
      if (!parseOnly) {
        const baseWindow = computeWindow(state, tr, previous);
        if (baseWindow) windows.push(baseWindow);
      }
      if (treeChanged) windows.push(treeAdvanceWindow(tr, previous));
      if (windows.length === 0) return previous;

      let next = previous;
      for (const window of windows) {
        if (window.fromLine <= 1 && window.toLine >= state.doc.lines) {
          return buildDecorations(state, hooks);
        }
        next = mergeDecorations(next, buildDecorations(state, hooks, window), state, window);
      }
      return next;
    },
    provide: (field) => EditorView.decorations.from(field),
  });

  // Rendered blocks are atomic: keyboard/pointer movement skips over them
  // instead of letting the caret land inside hidden source text. Source
  // editing removes the replacement, so the block stops being atomic.
  let atomicSource: DecorationSet | null = null;
  let atomicValue: RangeSet<Decoration> = RangeSet.empty;
  const atomicRanges = EditorView.atomicRanges.of((view) => {
    const deco = view.state.field(decorationsField, false);
    if (!deco) return RangeSet.empty;
    if (deco !== atomicSource) {
      const ranges: Range<Decoration>[] = [];
      deco.between(0, view.state.doc.length, (from, to, value) => {
        const spec = value.spec;
        if (from < to && spec?.block && spec.widget) {
          ranges.push(value.range(from, to));
        }
      });
      atomicValue = ranges.length > 0 ? RangeSet.of(ranges, true) : RangeSet.empty;
      atomicSource = deco;
    }
    return atomicValue;
  });

  return [
    focusedBlockField,
    blockSessionField,
    codeFoldField,
    mathBlocksField,
    decorationsField,
    parseViewportOnDemand(),
    atomicRanges,
    EditorView.domEventHandlers({
      click: (event, view) => {
        const target = event.target as HTMLElement | null;
        // Ctrl/Cmd+click follows links; plain click places the cursor so
        // the link text stays editable (Obsidian live preview behavior)
        if (!event.ctrlKey && !event.metaKey) return false;
        const wikilinkEl = target?.closest?.(".cm-md-wikilink") as HTMLElement | null;
        if (wikilinkEl) {
          const wikilink = wikilinkEl.getAttribute("data-wikilink");
          if (!wikilink) return false;
          event.preventDefault();
          hooks.onOpenWikilink(wikilink);
          void view;
          return true;
        }
        const linkEl = target?.closest?.(".cm-md-link") as HTMLElement | null;
        if (linkEl) {
          const url = linkEl.getAttribute("data-url");
          if (!url) return false;
          event.preventDefault();
          hooks.onOpenLink(url);
          return true;
        }
        return false;
      },
    }),
  ];
}
