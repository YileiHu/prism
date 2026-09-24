import { EditorState, Range, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { renderToString } from "katex";
import { IMAGE_EXTS, prismFileUrl, type AssetContext } from "./markdown";
import { FoldKeyCounter } from "./folds";

export interface LivePreviewHooks {
  onOpenWikilink: (target: string) => void;
  getAssetContext: () => AssetContext | null;
  getFolds: () => Set<string>;
  onFoldChange: (key: string, folded: boolean) => void;
  getFoldedLabel: (lineCount: number) => string;
}

// Nodes whose text gets hidden when their line is not the cursor line
// (note: heading marks are "HeaderMark" in @lezer/markdown; ListMark is
// handled separately — unordered markers become bullets, ordered stay visible)
const HIDDEN_MARK_NODES = new Set([
  "HeaderMark", "EmphasisMark", "StrongEmphasisMark", "StrikethroughMark",
  "CodeMark", "QuoteMark", "LinkMark", "ImageMark",
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

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) { super(); }

  override eq(other: this): boolean { return other.src === this.src; }

  override toDOM(): HTMLElement {
    const img = document.createElement("img");
    img.className = "cm-md-image";
    img.src = this.src;
    img.alt = this.alt;
    img.loading = "lazy";
    return img;
  }

  override ignoreEvent(): boolean { return false; }
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

// ---- Heading fold widgets ----

const setFoldedEffect = StateEffect.define<{ key: string; folded: boolean }>();

class FoldChevronWidget extends WidgetType {
  constructor(readonly key: string, readonly folded: boolean) { super(); }

  override eq(other: this): boolean { return other.key === this.key && other.folded === this.folded; }

  override toDOM(view: EditorView): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-fold-chevron";
    span.textContent = this.folded ? "▸" : "▾";
    span.addEventListener("mousedown", (e) => e.preventDefault());
    span.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const folded = !this.folded;
      view.dispatch({ effects: setFoldedEffect.of({ key: this.key, folded }) });
      hooksRef.onFoldChange(this.key, folded);
    });
    return span;
  }

  override ignoreEvent(): boolean { return true; }
}

class FoldedSectionWidget extends WidgetType {
  constructor(readonly key: string, readonly label: string) { super(); }

  override eq(other: this): boolean { return other.key === this.key && other.label === this.label; }

  override toDOM(view: EditorView): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-fold-placeholder";
    span.textContent = this.label;
    span.addEventListener("mousedown", (e) => e.preventDefault());
    span.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.dispatch({ effects: setFoldedEffect.of({ key: this.key, folded: false }) });
      hooksRef.onFoldChange(this.key, false);
    });
    return span;
  }

  override ignoreEvent(): boolean { return true; }
}

// Set from livePreview() so widget click handlers can reach the hooks
let hooksRef: LivePreviewHooks = {
  onOpenWikilink: () => {},
  getAssetContext: () => null,
  getFolds: () => new Set(),
  onFoldChange: () => {},
  getFoldedLabel: (n) => `⋯ ${n}`,
};

// Section end for a heading = last line before the next heading of the same
// or higher level (blank lines in between belong to the section)
function headingSectionEnd(state: EditorState, headingLine: number, level: number): number {
  let end = headingLine;
  for (let n = headingLine + 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    if (line.text.trim().length === 0) {
      end = n;
      continue;
    }
    const m = /^(#{1,6})\s/.exec(line.text);
    if (m && m[1].length <= level) break;
    end = n;
  }
  return end;
}

// Renders a static GFM table; clicking puts the cursor inside, which makes
// the lines active and drops back to editable source (Obsidian-style)
class TableWidget extends WidgetType {
  constructor(readonly text: string) { super(); }

  override eq(other: this): boolean { return other.text === this.text; }

  override toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-md-table";
    const table = document.createElement("table");
    const lines = this.text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

    const parseRow = (l: string) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    const delimiterRe = /^\|?[\s:|-]+\|?$/;

    let aligns: string[] = [];
    let headerDone = false;
    for (const line of lines) {
      if (headerDone === false && delimiterRe.test(line) && line.includes("-")) {
        aligns = parseRow(line).map((c) => {
          if (c.startsWith(":") && c.endsWith(":")) return "center";
          if (c.endsWith(":")) return "right";
          return "left";
        });
        continue;
      }
      const cells = parseRow(line);
      const tr = document.createElement("tr");
      cells.forEach((cell, i) => {
        const td = document.createElement(headerDone ? "td" : "th");
        td.textContent = cell;
        if (aligns[i] && aligns[i] !== "left") td.style.textAlign = aligns[i];
        tr.appendChild(td);
      });
      table.appendChild(tr);
      headerDone = true;
    }
    wrap.appendChild(table);
    return wrap;
  }
}

// ---- Helpers ----

function isActiveLine(activeLines: Set<number>, state: EditorState, pos: number): boolean {
  return activeLines.has(state.doc.lineAt(pos).number);
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

function resolveAssetUrl(hooks: LivePreviewHooks, url: string): string | null {
  if (/^(https?:|data:)/i.test(url)) return url;
  const ctx = hooks.getAssetContext();
  if (!ctx) return null;
  return prismFileUrl(ctx.vaultPath, url.replace(/^[\\/]+/, ""), ctx.noteDir);
}

// Regex-based inline decorations for syntax the lezer grammar doesn't model
// (wikilinks, ==highlight==, #tags, $math$, ![[embeds]])
function collectRegexDecorations(
  state: EditorState,
  line: { from: number; text: string },
  activeLines: Set<number>,
  hooks: LivePreviewHooks,
  ranges: Range<Decoration>[],
  builder: DecorationsBuilder,
): void {
  if (activeLines.has(state.doc.lineAt(line.from).number)) return;

  const tryAdd = (re: RegExp, apply: (m: RegExpExecArray) => void): void => {
    re.lastIndex = 0;
    for (let m = re.exec(line.text); m; m = re.exec(line.text)) {
      if (isInCode(state, line.from + m.index)) continue;
      apply(m);
    }
  };

  // ![[image]] embeds — images become widgets, other targets stay clickable
  tryAdd(/!\[\[([^\[\]\n]+)\]\]/g, (m) => {
    const target = m[1].split("|")[0].trim();
    const from = line.from + m.index;
    const to = from + m[0].length;
    if (IMAGE_EXTS.test(target)) {
      const src = resolveAssetUrl(hooks, target);
      if (src) builder.markReplace(ranges, from, to, { widget: new ImageWidget(src, m[1]), block: false });
    } else {
      builder.markReplace(ranges, from, to, { class: "cm-md-wikilink", attributes: { "data-wikilink": target } });
    }
  });

  // [[wikilinks]] — hide brackets, style the text, make it clickable
  tryAdd(/\[\[([^\[\]\n]+)\]\]/g, (m) => {
    const target = m[1].split("|")[0].trim();
    const from = line.from + m.index;
    const to = from + m[0].length;
    if (!builder.markReplace(ranges, from, from + 2, { class: "cm-md-hidden" })) return;
    builder.markReplace(ranges, to - 2, to, { class: "cm-md-hidden" });
    ranges.push(Decoration.mark({ class: "cm-md-wikilink", attributes: { "data-wikilink": target } }).range(from + 2, to - 2));
  });

  // ==highlight==
  tryAdd(/==[^=\n]+==/g, (m) => {
    const from = line.from + m.index;
    const to = from + m[0].length;
    if (!builder.markReplace(ranges, from, from + 2, { class: "cm-md-hidden" })) return;
    builder.markReplace(ranges, to - 2, to, { class: "cm-md-hidden" });
    ranges.push(Decoration.mark({ class: "cm-md-highlight" }).range(from + 2, to - 2));
  });

  // $$display$$ then $inline$ (longest delimiters first)
  tryAdd(/\$\$[^$\n]+\$\$/g, (m) => {
    const from = line.from + m.index;
    builder.markReplace(ranges, from, from + m[0].length, {
      widget: new MathWidget(m[0].slice(2, -2), true),
      block: false,
    });
  });
  tryAdd(/(?<![$\\])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)(?![$])/g, (m) => {
    const from = line.from + m.index;
    builder.markReplace(ranges, from, from + m[0].length, {
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

// ---- Plugin ----

export function livePreview(hooks: LivePreviewHooks) {
  hooksRef = hooks;

  const foldedField = StateField.define<Map<string, boolean>>({
    create: () => new Map(Array.from(hooks.getFolds()).map((key) => [key, true])),
    update(value, tr) {
      let next: Map<string, boolean> | null = null;
      for (const effect of tr.effects) {
        if (effect.is(setFoldedEffect)) {
          if (!next) next = new Map(value);
          next.set(effect.value.key, effect.value.folded);
        }
      }
      return next ?? value;
    },
  });

  class LivePreviewPlugin {
    decorations: DecorationSet = Decoration.none;

    constructor(readonly view: EditorView) {
      this.build(view);
    }

    update(update: ViewUpdate): void {
      const foldChanged = update.transactions.some((tr) =>
        tr.effects.some((effect) => effect.is(setFoldedEffect)),
      );
      if (update.docChanged || update.selectionSet || update.viewportChanged || foldChanged) {
        this.build(update.view);
      }
    }

    private build(view: EditorView): void {
    const { state } = view;
    const activeLines = new Set<number>();
    for (const range of state.selection.ranges) {
      const from = state.doc.lineAt(range.from).number;
      const to = state.doc.lineAt(range.to).number;
      for (let n = from; n <= to; n++) activeLines.add(n);
    }

    const ranges: Range<Decoration>[] = [];
    const builder = new DecorationsBuilder();
    const foldKeys = new FoldKeyCounter();
    const foldedMap = state.field(foldedField);

    // 1) Grammar-driven decorations within the visible viewport
    const tree = syntaxTree(state);
    for (const { from, to } of view.visibleRanges) {
      tree.iterate({
        from,
        to,
        enter: (node) => {
          if (isActiveLine(activeLines, state, node.from)) return true;

          const headingMatch = /^ATXHeading([1-6])$/.exec(node.name);
          if (headingMatch) {
            const level = Number(headingMatch[1]);
            const headingLine = state.doc.lineAt(node.from);
            const endLineNumber = headingSectionEnd(state, headingLine.number, level);
            if (endLineNumber > headingLine.number) {
              const text = state.doc.sliceString(node.from, node.to).replace(/^#+\s*/, "").trim();
              const key = foldKeys.next(level, text);
              const folded = foldedMap.get(key) ?? false;
              ranges.push(Decoration.widget({
                widget: new FoldChevronWidget(key, folded),
                side: 1,
              }).range(headingLine.to));
              if (folded) {
                const lineCount = endLineNumber - headingLine.number;
                // Block replaces must start and end at line boundaries — the
                // heading line itself stays visible, so fold from the start
                // of the next line
                const from = state.doc.line(headingLine.number + 1).from;
                const to = state.doc.line(endLineNumber).to;
                builder.markReplace(ranges, from, to, {
                  widget: new FoldedSectionWidget(key, hooks.getFoldedLabel(lineCount)),
                  block: true,
                });
              }
            }
            return true;
          }

          if (node.name === "ListMark") {
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
            const ch = state.doc.sliceString(node.from + 1, node.from + 2);
            builder.markReplace(ranges, node.from, node.to, {
              widget: new CheckboxWidget(ch === "x" || ch === "X", node.from),
              block: false,
            });
            return false;
          }

          if (node.name === "Image") {
            const text = state.doc.sliceString(node.from, node.to);
            const m = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(text);
            const srcRaw = m?.[2].trim();
            const src = srcRaw ? resolveAssetUrl(hooks, srcRaw) : null;
            if (m && src) {
              builder.markReplace(ranges, node.from, node.to, {
                widget: new ImageWidget(src, m[1]),
                block: false,
              });
            }
            return true;
          }

          if (node.name === "Table") {
            const text = state.doc.sliceString(node.from, node.to);
            builder.markReplace(ranges, node.from, node.to, {
              widget: new TableWidget(text),
              block: true,
            });
            return false;
          }

          if (node.name === "Blockquote") {
            const lineFrom = state.doc.lineAt(node.from).number;
            const lineTo = state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
            for (let n = lineFrom; n <= lineTo; n++) {
              if (!activeLines.has(n)) {
                ranges.push(Decoration.line({ class: "cm-md-blockquote" }).range(state.doc.line(n).from));
              }
            }
            return true;
          }

          if (HIDDEN_MARK_NODES.has(node.name)) {
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
    }

    // 2) Regex-driven decorations, line by line
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = state.doc.lineAt(pos);
        collectRegexDecorations(state, line, activeLines, hooks, ranges, builder);
        pos = line.to + 1;
      }
    }

      // Line decorations must come first in the sorted set
      this.decorations = Decoration.set(ranges, true);
    }
  }

  return [
    foldedField,
    ViewPlugin.fromClass(LivePreviewPlugin, {
      decorations: (plugin) => plugin.decorations,
      provide: () => EditorView.domEventHandlers({
        click: (event, view) => {
          const target = event.target as HTMLElement | null;
          const link = target?.closest?.(".cm-md-wikilink") as HTMLElement | null;
          if (!link) return false;
          const wikilink = link.getAttribute("data-wikilink");
          if (!wikilink) return false;
          event.preventDefault();
          hooks.onOpenWikilink(wikilink);
          void view;
          return true;
        },
      }),
    }),
  ];
}
