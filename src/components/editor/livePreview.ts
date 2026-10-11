import { EditorState, Range, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { renderToString } from "katex";
import { IMAGE_EXTS, prismFileUrl, type AssetContext } from "./markdown";

export interface LivePreviewHooks {
  onOpenWikilink: (target: string) => void;
  onOpenLink: (url: string) => void;
  // Resolves vault-relative image refs to prism-file:// URLs for the
  // edit-mode image preview widgets
  assetCtx: AssetContext;
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

// Non-editable image preview rendered as a block widget below the line that
// holds the raw ![]()/![[ ]] syntax (edit mode keeps the link visible)
class ImagePreviewWidget extends WidgetType {
  constructor(readonly images: { src: string; alt: string }[]) { super(); }

  override eq(other: this): boolean {
    return other.images.length === this.images.length &&
      other.images.every((im, i) => im.src === this.images[i].src && im.alt === this.images[i].alt);
  }

  override toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-md-image-preview";
    for (const { src, alt } of this.images) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = alt;
      img.draggable = false;
      img.loading = "lazy";
      img.addEventListener("error", () => {
        const missing = document.createElement("span");
        missing.className = "cm-md-image-missing";
        missing.textContent = alt || src;
        img.replaceWith(missing);
      });
      wrap.appendChild(img);
    }
    return wrap;
  }
}

function imageSrc(ref: string, assetCtx: AssetContext): string {
  if (/^(https?:|data:)/i.test(ref)) return ref;
  return prismFileUrl(assetCtx.vaultPath, ref.replace(/^[\\/]+/, ""), assetCtx.noteDir);
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
  assetCtx: AssetContext,
  images: { src: string; alt: string }[],
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

  // ![[embeds]] — image embeds stay raw and get a preview below the line;
  // anything else (note transcludes) degrades to a plain wikilink
  tryAdd(/!\[\[([^\[\]\n]+)\]\]/g, (m, from, to) => {
    const { target, hiddenHead } = wikilinkParts(m[1]);
    if (IMAGE_EXTS.test(target)) return;
    const headTo = from + 3 + hiddenHead;
    if (!builder.markReplace(ranges, from, headTo, { class: "cm-md-hidden" })) return;
    builder.markReplace(ranges, to - 2, to, { class: "cm-md-hidden" });
    ranges.push(Decoration.mark({ class: "cm-md-wikilink", attributes: { "data-wikilink": target } }).range(headTo, to - 2));
  });

  // Image embeds are collected WITHOUT the tryAdd selection check: the
  // preview stays rendered even while the cursor sits on the link
  {
    const re = /!\[\[([^\[\]\n]+)\]\]/g;
    for (let m = re.exec(line.text); m; m = re.exec(line.text)) {
      if (isInCode(state, line.from + m.index)) continue;
      const { target } = wikilinkParts(m[1]);
      if (!IMAGE_EXTS.test(target)) continue;
      images.push({ src: imageSrc(target, assetCtx), alt: target });
    }
  }

  // ![alt](url) — standard image syntax, local ref or remote URL
  {
    const re = /!\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^\s)]+))[^)]*\)/g;
    for (let m = re.exec(line.text); m; m = re.exec(line.text)) {
      if (isInCode(state, line.from + m.index)) continue;
      images.push({ src: imageSrc(m[2] ?? m[3], assetCtx), alt: m[1] });
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

// Whole-document build. Block decorations ($$ math blocks) may NOT come from
// a ViewPlugin's dynamic decorations — CM6 throws "Block decorations may not
// be specified via plugins" — so this lives in a StateField provided through
// EditorView.decorations.from. Notes are small enough that whole-doc
// decoration per transaction is fine, and it removes any viewport tracking.
function buildDecorations(state: EditorState, assetCtx: AssetContext): DecorationSet {
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
    enter: (node) => {
      if (node.name === "ListMark") {
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
        for (let n = lineFrom; n <= lineTo; n++) {
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
        for (let n = firstLine; n <= lastLine; n++) {
          ranges.push(Decoration.line({ class: "cm-md-codeblock" }).range(state.doc.line(n).from));
        }
        return false;
      }

      if (HIDDEN_MARK_NODES.has(node.name)) {
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
  {
    const lines: { from: number; to: number; text: string }[] = [];
    for (let n = 1; n <= state.doc.lines; n++) {
      const line = state.doc.line(n);
      lines.push({ from: line.from, to: line.to, text: line.text });
    }
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].text.trim() !== "$$") continue;
      if (isInCode(state, lines[i].from)) continue;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].text.trim() === "$$") {
          const blockFrom = lines[i].from;
          const blockTo = lines[j].to;
          if (!selectionIntersects(state, blockFrom, blockTo)) {
            const tex = lines.slice(i + 1, j).map((l) => l.text).join("\n").trim();
            builder.markReplace(ranges, blockFrom, blockTo, {
              widget: new MathWidget(tex, true),
              block: true,
            });
          }
          i = j;
          break;
        }
      }
    }
  }

  // 3) Frontmatter: de-emphasize the whole "--- ... ---" block at doc start
  if (state.doc.line(1).text.trim() === "---") {
    for (let n = 2; n <= state.doc.lines; n++) {
      if (state.doc.line(n).text.trim() !== "---") continue;
      for (let k = 1; k <= n; k++) {
        ranges.push(Decoration.line({ class: "cm-md-frontmatter" }).range(state.doc.line(k).from));
      }
      break;
    }
  }

  // 4) Regex-driven decorations, line by line; lines that hold image syntax
  // also get a non-editable preview widget directly below them
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    const images: { src: string; alt: string }[] = [];
    collectRegexDecorations(state, line, ranges, builder, assetCtx, images);
    if (images.length > 0) {
      ranges.push(Decoration.widget({
        widget: new ImagePreviewWidget(images),
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
    create: (state) => buildDecorations(state, hooks.assetCtx),
    update: (deco, tr) => {
      if (!tr.docChanged && !tr.selection) return deco;
      return buildDecorations(tr.state, hooks.assetCtx);
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
