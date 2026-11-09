import { EditorState, Range, StateField, type Transaction } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { renderToString } from "katex";
import type { AssetContext } from "./assetUrl";
import { withSizeInAlt } from "./imageSize";
import { mountEmbedCard } from "../embeds/embedMount";
import {
  parseEmbedSpec,
  parseMarkdownImage,
  serializeEmbedSpec,
  type EmbedOpenTarget,
  type EmbedSpec,
} from "../embeds/model";
import { DEFAULT_EMBED_LABELS, type EmbedLabels } from "../embeds/EmbedCard";

export type { EmbedLabels };

export interface LivePreviewHooks {
  onOpenWikilink: (target: string) => void;
  onOpenLink: (url: string) => void;
  onOpenEmbed: (target: EmbedOpenTarget) => void;
  // Resolves vault-relative image refs to prism-file:// URLs for the
  // edit-mode embed widgets
  assetCtx: AssetContext;
  embedLabels?: () => EmbedLabels;
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

class MathWidget extends WidgetType {
  constructor(readonly tex: string, readonly displayMode: boolean) { super(); }

  override eq(other: this): boolean { return other.tex === this.tex && other.displayMode === this.displayMode; }

  override toDOM(): HTMLElement {
    const span = document.createElement(this.displayMode ? "div" : "span");
    span.className = this.displayMode ? "cm-md-math cm-md-math-display" : "cm-md-math";
    span.innerHTML = renderToString(this.tex, { throwOnError: false, displayMode: this.displayMode });
    return span;
  }
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
interface PreviewEmbed {
  spec: EmbedSpec;
  syntax: "embed" | "md";
  from: number;
  to: number;
  raw: string;
}

function sameEmbed(a: PreviewEmbed, b: PreviewEmbed): boolean {
  return a.syntax === b.syntax
    && a.from === b.from
    && a.to === b.to
    && a.raw === b.raw
    && a.spec.kind === b.spec.kind
    && a.spec.target === b.spec.target
    && (a.spec.label ?? "") === (b.spec.label ?? "")
    && a.spec.size?.width === b.spec.size?.width
    && a.spec.size?.height === b.spec.size?.height;
}

// Rewrite the markdown source for one embed, preserving everything outside the
// alt/inner span. Autosave picks the change up through the normal doc-change
// listener.
function commitEmbedChange(
  view: EditorView,
  embed: PreviewEmbed,
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

// Editable embed cards rendered as a block widget below the line that holds
// the raw ![]()/![[ ]] syntax (the syntax itself stays visible and editable).
class EmbedPreviewWidget extends WidgetType {
  constructor(
    readonly embeds: PreviewEmbed[],
    readonly labels: () => EmbedLabels,
    readonly assetCtx: AssetContext,
    readonly onOpen: (target: EmbedOpenTarget) => void,
  ) { super(); }

  override eq(other: this): boolean {
    return other.embeds.length === this.embeds.length &&
      other.embeds.every((embed, i) => sameEmbed(embed, this.embeds[i]));
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-md-embed-preview";
    const labels = this.labels();
    const cleanups: (() => void)[] = [];
    for (const embed of this.embeds) {
      const host = document.createElement("div");
      host.className = "cm-md-embed-host";
      wrap.appendChild(host);
      cleanups.push(mountEmbedCard(host, {
        spec: embed.spec,
        ctx: this.assetCtx,
        editable: true,
        labels,
        onOpen: this.onOpen,
        onSizeCommit: (size) => commitEmbedChange(view, embed, { size }),
        onLabelCommit: (label) => commitEmbedChange(view, embed, { label }),
      }));
    }
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

interface MathBlock {
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

function findMathBlocks(state: EditorState): MathBlock[] {
  const blocks: MathBlock[] = [];
  let open = -1;
  let lineNo = 1;
  for (const text of state.doc.iterLines()) {
    if (text.trim() === "$$") {
      // A "$$" inside fenced/indented code is not a delimiter, but once a
      // block is open the first closing "$$" wins (mirrors the old scan).
      if (open >= 0) {
        blocks.push({ fromLine: open, toLine: lineNo });
        open = -1;
      } else if (!isInCode(state, state.doc.line(lineNo).from)) {
        open = lineNo;
      }
    }
    lineNo += 1;
  }
  return blocks;
}

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

// A full rebuild is required when an edit can change decorations far beyond
// its own range: fenced code may swallow or release the rest of the document,
// frontmatter/$$ blocks re-pair, or the edit is simply too large to window.
function needsFullRebuild(startState: EditorState, tr: Transaction): boolean {
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
  const mathBlocks = findMathBlocks(state);
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

  if (fromLine === Number.POSITIVE_INFINITY) return null;

  for (let pass = 0; pass < 6; pass++) {
    const previousFrom = fromLine;
    const previousTo = toLine;

    for (const pos of selectionPositions) expandInlineAt(state, pos, include);
    for (const pos of changedPositions) expandBlockAt(state, pos, include);

    for (const block of mathBlocks) {
      if (block.fromLine <= toLine && block.toLine >= fromLine) {
        grow(block.fromLine, block.toLine);
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

  canReplace(from: number, to: number): boolean {
    return !this.replaceRanges.some(([f, t]) => from < t && to > f);
  }

  markReplace(ranges: Range<Decoration>[], from: number, to: number, spec: Parameters<typeof Decoration.replace>[0]): boolean {
    if (!this.canReplace(from, to)) return false;
    this.replaceRanges.push([from, to]);
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
// (wikilinks, ==highlight==, #tags, $math$, ![[embeds]]). Also COLLECTS the
// line's images (![](url) and image ![[embeds]]) into `images` — the caller
// renders them in a block widget below the line; their syntax stays raw.
function collectRegexDecorations(
  state: EditorState,
  line: { from: number; text: string },
  ranges: Range<Decoration>[],
  builder: DecorationsBuilder,
  embeds: PreviewEmbed[],
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

  // ![[embeds]] — collected WITHOUT the tryAdd selection check: the preview
  // stays rendered even while the cursor sits on the syntax
  {
    const re = /!\[\[([^\[\]\n]+)\]\]/g;
    for (let m = re.exec(line.text); m; m = re.exec(line.text)) {
      if (isInCode(state, line.from + m.index)) continue;
      const inner = m[1];
      const spec = parseEmbedSpec(inner);
      if (!spec.target) continue;
      const from = line.from + m.index + 3;
      embeds.push({
        spec,
        syntax: "embed",
        from,
        to: from + inner.length,
        raw: inner,
      });
    }
  }

  // ![alt|size](url) — standard image syntax, local ref or remote URL
  {
    const re = /!\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^\s)]+))[^)]*\)/g;
    for (let m = re.exec(line.text); m; m = re.exec(line.text)) {
      if (isInCode(state, line.from + m.index)) continue;
      const rawAlt = m[1];
      const from = line.from + m.index + 2;
      embeds.push({
        spec: parseMarkdownImage(rawAlt, (m[2] ?? m[3]).replace(/^<|>$/g, "")),
        syntax: "md",
        from,
        to: from + rawAlt.length,
        raw: rawAlt,
      });
    }
  }

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
      widget: new MathWidget(m[0].slice(2, -2), true),
      block: false,
    });
  });
  tryAdd(/(?<![$\\])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)(?![$])/g, (m, from, to) => {
    builder.markReplace(ranges, from, to, {
      widget: new MathWidget(m[1], false),
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
        const lineFrom = state.doc.lineAt(node.from).number;
        const lineTo = state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
        for (let n = Math.max(lineFrom, windowFromLine); n <= Math.min(lineTo, windowToLine); n++) {
          if (!activeLines.has(n)) {
            ranges.push(Decoration.line({ class: "cm-md-blockquote" }).range(state.doc.line(n).from));
          }
        }
        return true;
      }

      // Fenced/indented code: block background + monospace; the ``` fences
      // stay visible (children skipped so their CodeMarks aren't hidden)
      if (node.name === "FencedCode" || node.name === "CodeBlock") {
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

  // 2) Multi-line $$ math blocks — replace the whole block with display
  // KaTeX unless the selection is inside it
  for (const block of findMathBlocks(state)) {
    if (block.fromLine < windowFromLine || block.toLine > windowToLine) continue;
    const openLine = state.doc.line(block.fromLine);
    if (isInCode(state, openLine.from)) continue;
    const closeLine = state.doc.line(block.toLine);
    if (!selectionIntersects(state, openLine.from, closeLine.to)) {
      const tex = state.doc.sliceString(openLine.to, closeLine.from).trim();
      builder.markReplace(ranges, openLine.from, closeLine.to, {
        widget: new MathWidget(tex, true),
        block: true,
      });
    }
  }

  // 3) Frontmatter: de-emphasize the whole "--- ... ---" block at doc start
  const frontmatter = findFrontmatter(state);
  if (frontmatter && frontmatter.fromLine >= windowFromLine && frontmatter.toLine <= windowToLine) {
    for (let k = frontmatter.fromLine; k <= frontmatter.toLine; k++) {
      ranges.push(Decoration.line({ class: "cm-md-frontmatter" }).range(state.doc.line(k).from));
    }
  }

  // 4) Regex-driven decorations, line by line; lines that hold embed syntax
  // also get an embed card widget directly below them
  const labels = hooks.embedLabels ?? (() => DEFAULT_EMBED_LABELS);
  for (let n = windowFromLine; n <= windowToLine; n++) {
    const line = state.doc.line(n);
    const embeds: PreviewEmbed[] = [];
    collectRegexDecorations(state, line, ranges, builder, embeds);
    if (embeds.length > 0) {
      ranges.push(Decoration.widget({
        widget: new EmbedPreviewWidget(embeds, labels, hooks.assetCtx, hooks.onOpenEmbed),
        block: true,
        side: 1,
      }).range(line.to));
    }
  }

  // Line decorations must come first in the sorted set
  return Decoration.set(ranges, true);
}

export function livePreview(hooks: LivePreviewHooks) {
  const decorationsField = StateField.define<DecorationSet>({
    create: (state) => buildDecorations(state, hooks),
    update: (deco, tr) => {
      if (!tr.docChanged && !tr.selection) return deco;

      const state = tr.state;
      if (tr.docChanged && needsFullRebuild(tr.startState, tr)) {
        return buildDecorations(state, hooks);
      }

      const previous = tr.docChanged ? deco.map(tr.changes) : deco;
      const window = computeWindow(state, tr, previous);
      if (!window) return previous;
      if (window.fromLine <= 1 && window.toLine >= state.doc.lines) {
        return buildDecorations(state, hooks);
      }
      return mergeDecorations(previous, buildDecorations(state, hooks, window), state, window);
    },
    provide: (field) => EditorView.decorations.from(field),
  });

  return [
    decorationsField,
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
