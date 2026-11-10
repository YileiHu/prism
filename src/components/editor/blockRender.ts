import { WidgetType, EditorView } from "@codemirror/view";
import { bindContainerField, commitContainerOnFocusOut } from "./containers/bind";
import type { AssetContext } from "./assetUrl";
import { blockSession, toggleCodeFold, type BlockTarget } from "./blockState";
import {
  blockAt, codeBlockAt, tableBlockAt, calloutBlockAt,
  type CalloutBlockRef, type CodeBlockRef,
} from "./blockModel";
import { tableColumnCount, type TableModel } from "./tableModel";
import type { EmbedLabels } from "../embeds/EmbedCard";
import type { EmbedOpenTarget } from "../embeds/model";
import { hydrateMarkdown, type MarkdownHydrationOptions } from "./markdownHydration";
import {
  activateBlockFromDom, calloutBodyInitial, codeBodyInitial, commitActiveBlock, endBlockSession,
  nextTableCell, outsideCaretAfterChanges, registerBlockEditor,
  writeCallout, writeCodeBody, writeTableCell,
} from "./blockSession";
import { CALLOUT_DEFAULT_TITLES } from "./callouts";

export interface BlockWidgetLabels {
  codeLines: (count: number) => string;
}

type MarkdownModule = typeof import("./markdown");
let markdownModule: MarkdownModule | null = null;

// Cached so card re-renders (e.g. leaving container editing) can paint
// synchronously instead of flashing an empty card while import() resolves.
function loadMarkdown(): Promise<MarkdownModule> {
  if (markdownModule) return Promise.resolve(markdownModule);
  return import("./markdown").then((mod) => (markdownModule = mod));
}

export interface SubEditorOptions {
  // Nested document or geometry changed — the outer view must remeasure
  onChange?: () => void;
  // Esc / Mod+Enter with no nested block focused or editing
  onCommit: (focusOuter: boolean) => void;
  // Mod+S: commit the callout first, then save the note
  onSave: () => void;
}

export interface SubEditorHandle {
  readonly view: EditorView;
  // Flush transient widget inputs and any open nested block session
  flushActiveBlock(): void;
  focusLine(line: number): void;
  focusEnd(): void;
  destroy(): void;
}

export type CreateSubEditor = (
  host: HTMLElement,
  doc: string,
  opts: SubEditorOptions,
) => SubEditorHandle;

export interface BlockPreviewContext {
  assetContext: AssetContext;
  embedLabels: EmbedLabels;
  onOpenWikilink: (target: string) => void;
  onOpenLink: (url: string) => void;
  onOpenEmbed: (target: EmbedOpenTarget) => void;
  onToggleTask?: (taskIndex: number) => void;
  createSubEditor: CreateSubEditor;
}

const widgetCleanups = new WeakMap<HTMLElement, () => void>();

const TASK_LINE = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/;

function hydrationOptions(
  view: EditorView,
  root: HTMLElement,
  preview: BlockPreviewContext,
): MarkdownHydrationOptions {
  return {
    assetContext: preview.assetContext,
    embedLabels: preview.embedLabels,
    onOpenWikilink: preview.onOpenWikilink,
    onOpenLink: preview.onOpenLink,
    onOpenEmbed: preview.onOpenEmbed,
    onToggleTask: preview.onToggleTask
      ? (localIndex) => {
        try {
          const ref = blockAt(view.state, view.posAtDOM(root, 0));
          if (!ref) return;
          let prefix = 0;
          for (const line of view.state.sliceDoc(0, ref.replaceFrom).split("\n")) {
            if (TASK_LINE.test(line)) prefix++;
          }
          preview.onToggleTask?.(prefix + localIndex);
        } catch {
          /* the widget is being rebuilt */
        }
      }
      : undefined,
  };
}

function escapePlainText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function autoGrowTextarea(
  el: HTMLTextAreaElement,
  maxHeight = Math.max(120, window.innerHeight * 0.6),
): void {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
}

export function scheduleAutoGrow(el: HTMLTextAreaElement): void {
  requestAnimationFrame(() => {
    if (el.isConnected) autoGrowTextarea(el);
  });
}

function caretNodeAtPoint(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = doc.caretRangeFromPoint?.(x, y);
  if (range) return { node: range.startContainer, offset: range.startOffset };
  return null;
}

// Map a click inside rendered callout content to a line in the stripped source
// body by locating the clicked top-level rendered block's text. Falls back to
// the caller's ratio estimate when the text can't be matched.
function calloutBodyLineAtPoint(
  view: EditorView,
  ref: CalloutBlockRef,
  contentEl: HTMLElement,
  x: number,
  y: number,
): number | null {
  const hit = caretNodeAtPoint(x, y);
  if (!hit || !contentEl.contains(hit.node)) return null;
  let el: Element | null = hit.node instanceof Element ? hit.node : hit.node.parentElement;
  while (el && el.parentElement && el.parentElement !== contentEl) el = el.parentElement;
  if (!el || !contentEl.contains(el)) return null;
  const snippet = (el.textContent ?? "").trim().slice(0, 24);
  if (!snippet) return null;
  const body = calloutBodyInitial(view, ref);
  const index = body.indexOf(snippet);
  if (index < 0) return null;
  return body.slice(0, index).split("\n").length - 1;
}

function sameTableContent(a: TableModel, b: TableModel): boolean {
  if (a.rows.length !== b.rows.length || a.alignments.length !== b.alignments.length) return false;
  for (let row = 0; row < a.rows.length; row++) {
    const left = a.rows[row];
    const right = b.rows[row];
    if (left.kind !== right.kind || left.cells.length !== right.cells.length) return false;
    for (let col = 0; col < left.cells.length; col++) {
      if (left.cells[col].text !== right.cells[col].text) return false;
    }
  }
  return a.alignments.every((value, index) => value === b.alignments[index]);
}

function isActionTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && target.closest("button, a, input, textarea, select, [data-prism-block-action]") != null;
}

function textOffsetAtPoint(container: HTMLElement, x: number, y: number): number | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = doc.caretPositionFromPoint?.(x, y);
  let node: Node | null = position?.offsetNode ?? null;
  let offset = position?.offset ?? 0;
  if (!node) {
    const range = doc.caretRangeFromPoint?.(x, y);
    if (range) {
      node = range.startContainer;
      offset = range.startOffset;
    }
  }
  if (!node || !container.contains(node)) return null;
  const range = document.createRange();
  range.selectNodeContents(container);
  try {
    range.setEnd(node, offset);
  } catch {
    return null;
  }
  return range.toString().length;
}

function codeTargetOffset(target: Extract<BlockTarget, { kind: "code" }> | undefined, text: string): number {
  if (!target) return text.length;
  let offset = 0;
  for (let line = 0; line < target.line; line++) {
    const next = text.indexOf("\n", offset);
    if (next < 0) return text.length;
    offset = next + 1;
  }
  return Math.min(text.length, offset + target.offset);
}

function sourceLineOffset(text: string, line: number): number {
  let offset = 0;
  for (let index = 0; index < line; index++) {
    const next = text.indexOf("\n", offset);
    if (next < 0) return text.length;
    offset = next + 1;
  }
  return offset;
}

function activeSession(view: EditorView, sessionId: number, root: HTMLElement): boolean {
  return root.isConnected && blockSession(view.state)?.id === sessionId;
}

export function focusAt(el: HTMLInputElement | HTMLTextAreaElement, offset: number): void {
  el.focus();
  const position = Math.max(0, Math.min(offset, el.value.length));
  el.setSelectionRange(position, position);
}

export class CodeBlockWidget extends WidgetType {
  constructor(
    readonly block: CodeBlockRef,
    readonly folded: boolean,
    readonly labels: BlockWidgetLabels,
    readonly sessionId: number | null = null,
    readonly target?: Extract<BlockTarget, { kind: "code" }>,
    readonly onSave?: () => void,
  ) { super(); }

  override eq(other: this): boolean {
    return other.block.lang === this.block.lang
      && other.block.code === this.block.code
      && other.block.closed === this.block.closed
      && other.folded === this.folded
      && other.sessionId === this.sessionId
      && other.target?.line === this.target?.line
      && other.target?.offset === this.target?.offset;
  }

  override toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("div");
    root.className = `cm-md-block-widget cm-md-code-card${this.folded ? " cm-md-code-card-folded" : ""}`;
    if (this.sessionId != null) root.classList.add("cm-md-block-active");
    root.dataset.blockKind = "code";
    root.dataset.blockFrom = String(this.block.from);
    root.dataset.blockTo = String(this.block.to);

    const header = document.createElement("div");
    header.className = "cm-md-code-header";

    const lang = document.createElement("span");
    lang.className = "cm-md-code-lang";
    lang.textContent = this.block.lang || "text";
    header.appendChild(lang);

    const count = document.createElement("span");
    count.className = "cm-md-code-count";
    count.textContent = this.labels.codeLines(this.block.lineCount);
    header.appendChild(count);

    const currentBlock = (): CodeBlockRef | null => {
      try {
        return codeBlockAt(view.state, view.posAtDOM(root, 0));
      } catch {
        return null;
      }
    };

    if (this.folded && this.sessionId == null) {
      const hint = document.createElement("span");
      hint.className = "cm-md-code-fold-hint";
      hint.textContent = "▸";
      header.prepend(hint);
      root.appendChild(header);
      root.addEventListener("mousedown", (event) => {
        event.preventDefault();
        if (blockSession(view.state)?.mode === "container") commitActiveBlock(view, false);
        const ref = currentBlock();
        if (!ref) return;
        view.dispatch({ effects: toggleCodeFold.of(ref.from) });
        view.focus();
      });
      return root;
    }

    if (this.sessionId != null) {
      let destroyed = false;
      let committing = false;
      const sessionId = this.sessionId;
      root.dataset.prismContainerEdit = "true";
      root.dataset.prismBlockEditor = String(sessionId);

      const textarea = document.createElement("textarea");
      textarea.className = "cm-md-code-editor";
      textarea.spellcheck = false;
      textarea.dataset.prismSubeditor = "true";
      textarea.value = codeBodyInitial(this.block);

      const commit = (focusView: boolean, preserveSelection = false): boolean => {
        if (committing || destroyed) return false;
        committing = true;
        return writeCodeBody(view, root, textarea.value, focusView, preserveSelection);
      };

      root.appendChild(header);
      root.appendChild(textarea);

      bindContainerField(
        view, sessionId, root,
        { id: "body", el: textarea, enter: "newline", tab: "indent" },
        { commit, onSave: this.onSave },
      );
      commitContainerOnFocusOut(view, sessionId, root, commit, () => !destroyed);

      const unregister = registerBlockEditor(view, sessionId, root, commit);
      widgetCleanups.set(root, () => {
        destroyed = true;
        unregister();
      });

      requestAnimationFrame(() => {
        if (destroyed || !activeSession(view, sessionId, root)) return;
        focusAt(textarea, codeTargetOffset(this.target, textarea.value));
        autoGrowTextarea(textarea);
      });
      return root;
    }

    root.appendChild(header);

    const pre = document.createElement("pre");
    pre.className = "md-code";
    pre.dataset.lang = this.block.lang;
    const codeEl = document.createElement("code");
    codeEl.innerHTML = escapePlainText(this.block.code);
    pre.appendChild(codeEl);
    root.appendChild(pre);

    root.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || isActionTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      const localOffset = textOffsetAtPoint(pre, event.clientX, event.clientY);
      const text = codeBodyInitial(this.block);
      const offset = localOffset == null ? 0 : Math.min(localOffset, text.length);
      const before = text.slice(0, offset);
      const line = before.split("\n").length - 1;
      const lineOffset = offset - (before.lastIndexOf("\n") + 1);
      activateBlockFromDom(view, root, (state, pos) => {
        const ref = codeBlockAt(state, pos);
        if (!ref) return null;
        const body = codeBodyInitial(ref);
        const boundedLine = Math.min(line, Math.max(0, body.split("\n").length - 1));
        const local = sourceLineOffset(body, boundedLine) + lineOffset;
        return {
          init: {
            kind: "code",
            mode: "container",
            from: ref.replaceFrom,
            to: ref.replaceTo,
            anchor: ref.bodyFrom + local,
            target: { kind: "code", part: "body", line: boundedLine, offset: lineOffset },
          },
          anchor: ref.bodyFrom + local,
        };
      });
    });

    let cancelled = false;
    widgetCleanups.set(root, () => { cancelled = true; });
    void import("./codeHighlight").then(({ highlightCode }) => {
      if (cancelled || !root.isConnected) return;
      const result = highlightCode(this.block.code, this.block.lang);
      codeEl.innerHTML = result.html;
      codeEl.classList.toggle("hljs", result.highlighted);
      pre.dataset.lang = result.lang;
    });

    return root;
  }

  override destroy(dom: HTMLElement): void {
    widgetCleanups.get(dom)?.();
    widgetCleanups.delete(dom);
  }

  override ignoreEvent(): boolean { return true; }
}

export class TableWidget extends WidgetType {
  constructor(
    readonly model: TableModel,
    readonly assetCtx: AssetContext,
    readonly sessionId: number | null = null,
    readonly activeCell?: Extract<BlockTarget, { kind: "table" }>,
    readonly preview?: BlockPreviewContext,
    readonly onSave?: () => void,
  ) { super(); }

  override eq(other: this): boolean {
    return other.assetCtx === this.assetCtx
      && other.sessionId === this.sessionId
      && other.activeCell?.row === this.activeCell?.row
      && other.activeCell?.col === this.activeCell?.col
      && other.activeCell?.offset === this.activeCell?.offset
      && sameTableContent(other.model, this.model);
  }

  override toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("div");
    root.className = "cm-md-block-widget cm-md-table-render markdown-preview";
    if (this.sessionId != null) root.classList.add("cm-md-block-active");
    root.dataset.blockKind = "table";
    root.dataset.blockFrom = String(this.model.from);
    root.dataset.blockTo = String(this.model.to);
    const editing = this.sessionId != null;
    if (editing) {
      root.dataset.prismContainerEdit = "true";
      root.dataset.prismBlockEditor = String(this.sessionId);
    }

    const wrap = document.createElement("div");
    wrap.className = "md-table-wrap";
    wrap.dataset.blockAnchor = "true";
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");
    const colCount = tableColumnCount(this.model);
    let destroyed = false;
    let committing = false;
    const sessionId = this.sessionId;

    const resolveModel = (): TableModel | null => {
      try {
        return tableBlockAt(view.state, view.posAtDOM(root, 0))?.model ?? null;
      } catch {
        return null;
      }
    };

    const commitCell = (
      active: { row: number; col: number },
      text: string,
      next: { row: number; col: number } | null,
      focusView: boolean,
      preserveSelection = false,
      appendRow = false,
    ): boolean => {
      if (committing || destroyed) return false;
      committing = true;
      return writeTableCell(view, root, active, text, next, focusView, 0, preserveSelection, appendRow);
    };

    const isActiveCell = (rowIndex: number, col: number): boolean =>
      this.activeCell != null
      && this.activeCell.row === rowIndex
      && this.activeCell.col === col;

    const makeCell = (rowIndex: number, col: number, tag: "th" | "td"): HTMLElement => {
      const row = this.model.rows[rowIndex];
      const cell = row?.cells[col];
      const el = document.createElement(tag);
      el.dataset.cellRow = String(rowIndex);
      el.dataset.cellCol = String(col);
      el.dataset.cellFrom = String(cell?.from ?? row?.lineFrom ?? this.model.replaceFrom);
      const align = this.model.alignments[col] ?? "default";
      if (align !== "default") el.style.textAlign = align;

      if (isActiveCell(rowIndex, col) && sessionId != null) {
        el.dataset.cellEditing = "1";
        const input = document.createElement("textarea");
        input.className = "cm-md-cell-editor";
        input.rows = 1;
        input.spellcheck = false;
        input.dataset.prismSubeditor = "true";
        input.value = cell?.text ?? "";
        if (align !== "default") input.style.textAlign = align;
        el.appendChild(input);

        const active = { row: rowIndex, col };
        const move = (step: -1 | 1) => {
          const model = resolveModel();
          if (!model) return;
          const next = nextTableCell(model, active, step);
          if (next || step < 0) {
            commitCell(active, input.value, next, next == null);
            return;
          }
          // Tab past the last cell appends a body row and stays in the grid
          commitCell(active, input.value, { row: model.rows.length, col: 0 }, false, false, true);
        };

        bindContainerField(
          view, sessionId, root,
          { id: "cell", el: input, enter: "commit", tab: "cells" },
          {
            commit: (focusView) => { commitCell(active, input.value, null, focusView); },
            onTab: (_id, backwards) => move(backwards ? -1 : 1),
            onSave: this.onSave,
          },
        );
        input.addEventListener("input", () => {
          const flat = input.value.replace(/\n/g, " ");
          if (flat !== input.value) input.value = flat;
          scheduleAutoGrow(input);
        });
        requestAnimationFrame(() => {
          if (destroyed || !activeSession(view, sessionId, root)) return;
          focusAt(input, this.activeCell?.offset ?? 0);
          autoGrowTextarea(input, Math.max(100, window.innerHeight * 0.35));
        });
      } else {
        el.textContent = cell?.text.trim() ? cell.text : " ";
      }
      return el;
    };

    const headerTr = document.createElement("tr");
    for (let col = 0; col < colCount; col++) headerTr.appendChild(makeCell(0, col, "th"));
    thead.appendChild(headerTr);
    table.appendChild(thead);

    for (let rowIndex = 0; rowIndex < this.model.rows.length; rowIndex++) {
      if (this.model.rows[rowIndex].kind !== "body") continue;
      const tr = document.createElement("tr");
      for (let col = 0; col < colCount; col++) tr.appendChild(makeCell(rowIndex, col, "td"));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    root.appendChild(wrap);

    let cancelled = false;
    let hydrationCleanup: (() => void) | null = null;
    if (this.preview) {
      hydrationCleanup = hydrateMarkdown(root, hydrationOptions(view, root, this.preview));
    }
    const commitActiveCell = (focusView: boolean, preserveSelection = false): boolean => {
      const input = root.querySelector<HTMLTextAreaElement>(".cm-md-cell-editor");
      if (!this.activeCell || !input) {
        endBlockSession(view, focusView);
        return false;
      }
      return commitCell(this.activeCell, input.value, null, focusView, preserveSelection);
    };
    let unregister = () => {};
    if (editing && sessionId != null) {
      unregister = registerBlockEditor(view, sessionId, root, commitActiveCell);
      commitContainerOnFocusOut(view, sessionId, root, commitActiveCell, () => !destroyed);
    }
    widgetCleanups.set(root, () => {
      destroyed = true;
      cancelled = true;
      unregister();
      hydrationCleanup?.();
    });

    if (!editing) {
      root.addEventListener("mousedown", (event) => {
        if (event.button !== 0 || isActionTarget(event.target)) return;
        const cellEl = (event.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-cell-row]");
        if (!cellEl) return;
        const row = Number(cellEl.dataset.cellRow);
        const col = Number(cellEl.dataset.cellCol);
        if (!Number.isFinite(row) || !Number.isFinite(col)) return;
        event.preventDefault();
        event.stopPropagation();
        const renderedOffset = textOffsetAtPoint(cellEl, event.clientX, event.clientY) ?? 0;
        activateBlockFromDom(view, root, (state, pos) => {
          const ref = tableBlockAt(state, pos);
          const cell = ref?.model.rows[row]?.cells[col];
          if (!ref || !cell) return null;
          const offset = Math.min(renderedOffset, cell.text.length);
          return {
            init: {
              kind: "table",
              mode: "container",
              from: ref.replaceFrom,
              to: ref.replaceTo,
              anchor: cell.from + offset,
              target: { kind: "table", row, col, offset },
            },
            anchor: cell.from + offset,
          };
        });
      });
    }

    const cellEls = Array.from(root.querySelectorAll<HTMLElement>("[data-cell-row]"));
    void loadMarkdown().then(({ renderInlineMarkdown }) => {
      if (cancelled || !root.isConnected) return;
      for (const el of cellEls) {
        if (el.dataset.cellEditing) continue;
        const rowIndex = Number(el.dataset.cellRow);
        const col = Number(el.dataset.cellCol);
        const cell = this.model.rows[rowIndex]?.cells[col];
        if (!cell || !cell.text.trim()) continue;
        el.innerHTML = renderInlineMarkdown(cell.text, this.assetCtx);
      }
    });

    if (editing && sessionId != null) {
      root.addEventListener("mousedown", (event) => {
        if (event.button !== 0) return;
        const target = (event.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-cell-row]");
        if (!target) return;
        const row = Number(target.dataset.cellRow);
        const col = Number(target.dataset.cellCol);
        if (!Number.isFinite(row) || !Number.isFinite(col)) return;
        if (row === this.activeCell?.row && col === this.activeCell?.col) return;
        const input = root.querySelector<HTMLTextAreaElement>(".cm-md-cell-editor");
        if (!input) return;
        event.preventDefault();
        const offset = textOffsetAtPoint(target, event.clientX, event.clientY) ?? 0;
        committing = true;
        const active = this.activeCell;
        if (!active) return;
        writeTableCell(view, root, active, input.value, { row, col }, false, offset);
      });
    }

    return root;
  }

  override destroy(dom: HTMLElement): void {
    widgetCleanups.get(dom)?.();
    widgetCleanups.delete(dom);
  }

  override ignoreEvent(): boolean { return true; }
}

export class CalloutWidget extends WidgetType {
  constructor(
    readonly block: CalloutBlockRef,
    readonly source: string,
    readonly assetCtx: AssetContext,
    readonly sessionId: number | null = null,
    readonly target: Extract<BlockTarget, { kind: "callout" }> | undefined,
    readonly preview: BlockPreviewContext,
    readonly onSave?: () => void,
  ) { super(); }

  override eq(other: this): boolean {
    return other.block.rawType === this.block.rawType
      && other.source === this.source
      && other.assetCtx === this.assetCtx
      && other.sessionId === this.sessionId
      && other.target?.part === this.target?.part
      && other.target?.line === this.target?.line;
  }

  override toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("div");
    root.className = "cm-md-block-widget cm-md-callout-render";
    if (this.sessionId != null) root.classList.add("cm-md-block-active");
    root.dataset.blockKind = "callout";
    root.dataset.blockFrom = String(this.block.from);
    root.dataset.blockTo = String(this.block.to);

    const inner = document.createElement("div");
    inner.className = "markdown-preview";
    root.appendChild(inner);

    if (this.sessionId != null) {
      let destroyed = false;
      let committing = false;
      const sessionId = this.sessionId;
      root.dataset.prismContainerEdit = "true";
      root.dataset.prismBlockEditor = String(sessionId);

      const callout = document.createElement("div");
      callout.className = "callout";
      callout.dataset.callout = this.block.calloutType;

      const title = document.createElement("div");
      title.className = "callout-title";
      const titleInput = document.createElement("input");
      titleInput.type = "text";
      titleInput.className = "cm-md-callout-title-editor";
      titleInput.spellcheck = false;
      titleInput.dataset.prismSubeditor = "true";
      titleInput.value = this.block.title;
      titleInput.placeholder = CALLOUT_DEFAULT_TITLES[this.block.rawType] || this.block.rawType;
      title.appendChild(titleInput);

      callout.appendChild(title);

      const content = document.createElement("div");
      content.className = "callout-content";
      callout.appendChild(content);
      inner.appendChild(callout);

      const bodyHost = document.createElement("div");
      bodyHost.className = "cm-md-callout-subeditor";
      bodyHost.dataset.prismSubeditor = "true";
      content.appendChild(bodyHost);

      // The body is a miniature live-preview editor: nested tables, code
      // blocks, math blocks and embeds behave exactly like top-level ones.
      const initialBody = calloutBodyInitial(view, this.block);
      const nested = this.preview.createSubEditor(bodyHost, initialBody, {
        onChange: () => {
          if (!destroyed) view.requestMeasure();
        },
        // Deferred: committing destroys this editor from inside its own key
        // handler, which must finish running first
        onCommit: (focusOuter) => {
          queueMicrotask(() => { if (!destroyed) commit(focusOuter); });
        },
        onSave: () => {
          queueMicrotask(() => {
            if (destroyed) return;
            commit(true);
            this.onSave?.();
          });
        },
      });

      const commit = (focusView: boolean, preserveSelection = false): boolean => {
        if (committing || destroyed) return false;
        committing = true;
        // Write any open nested block editor's draft into the nested document
        // before it becomes the callout body
        nested.flushActiveBlock();
        return writeCallout(
          view, root, titleInput.value, nested.view.state.doc.toString(),
          focusView, preserveSelection,
        );
      };

      bindContainerField(
        view, sessionId, root,
        { id: "title", el: titleInput, enter: "focus", tab: "focus" },
        {
          commit,
          onSave: this.onSave,
          nextField: () => {
            nested.focusEnd();
            return true;
          },
        },
      );
      commitContainerOnFocusOut(view, sessionId, root, commit, () => !destroyed);

      const unregister = registerBlockEditor(view, sessionId, root, commit);
      widgetCleanups.set(root, () => {
        destroyed = true;
        nested.destroy();
        unregister();
      });

      requestAnimationFrame(() => {
        if (destroyed || !activeSession(view, sessionId, root)) return;
        // The nested editor laid out only after the widget was attached —
        // remeasure so the outer height map reflects the card's real height
        view.requestMeasure();
        if (this.target?.part === "title") {
          focusAt(titleInput, titleInput.value.length);
        } else {
          const line = this.target?.kind === "callout" ? this.target.line : 0;
          nested.focusLine(line);
        }
      });

      return root;
    }

    let cancelled = false;
    let hydrationCleanup: (() => void) | null = null;
    widgetCleanups.set(root, () => {
      cancelled = true;
      hydrationCleanup?.();
    });
    const renderCard = (mod: MarkdownModule) => {
      if (cancelled) return;
      const { html } = mod.renderMarkdown(this.source, this.assetCtx);
      inner.innerHTML = html;
      hydrationCleanup = hydrateMarkdown(inner, hydrationOptions(view, root, this.preview));
    };
    // Synchronous once the module is cached — leaving container editing
    // rebuilds this card and must not paint an empty frame first. The root is
    // still detached here, so no isConnected check on this path.
    if (markdownModule) renderCard(markdownModule);
    else void loadMarkdown().then((mod) => {
      if (cancelled || !root.isConnected) return;
      renderCard(mod);
    });

    root.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || isActionTarget(event.target)) return;
      const targetEl = event.target as HTMLElement | null;
      if (!targetEl) return;
      const isTitle = targetEl.closest(".callout-title, .callout-title-icon") != null;
      const contentEl = targetEl.closest<HTMLElement>(".callout-content");
      if (!isTitle && !contentEl) return;
      event.preventDefault();
      event.stopPropagation();
      let bodyLine = 0;
      if (contentEl) {
        const mapped = calloutBodyLineAtPoint(
          view, this.block, contentEl, event.clientX, event.clientY,
        );
        if (mapped != null) {
          bodyLine = mapped;
        } else {
          // Fallback: distribute the click across the source line count
          const bodyText = calloutBodyInitial(view, this.block);
          const lineCount = Math.max(1, bodyText.split("\n").length);
          const rect = contentEl.getBoundingClientRect();
          const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
          bodyLine = Math.max(0, Math.min(lineCount - 1, Math.floor(ratio * lineCount)));
        }
      }
      activateBlockFromDom(view, root, (state, pos) => {
        const ref = calloutBlockAt(state, pos);
        if (!ref) return null;
        if (isTitle) {
          return {
            init: {
              kind: "callout",
              mode: "container",
              from: ref.replaceFrom,
              to: ref.replaceTo,
              anchor: ref.titleFrom,
              target: { kind: "callout", part: "title", line: 0 },
            },
            anchor: ref.titleFrom,
          };
        }
        const firstLine = state.doc.lineAt(ref.from);
        const sourceBody = ref.replaceTo > firstLine.to
          ? state.sliceDoc(firstLine.to + 1, ref.replaceTo)
          : "";
        const stripped = calloutBodyInitial(view, ref);
        const line = Math.min(bodyLine, Math.max(0, stripped.split("\n").length - 1));
        let relative = 0;
        for (let index = 0; index < line; index++) {
          const newline = sourceBody.indexOf("\n", relative);
          if (newline < 0) {
            relative = sourceBody.length;
            break;
          }
          relative = newline + 1;
        }
        const anchor = Math.min(ref.replaceTo, firstLine.to + 1 + relative);
        return {
          init: {
            kind: "callout",
            mode: "container",
            from: ref.replaceFrom,
            to: ref.replaceTo,
            anchor,
            target: { kind: "callout", part: "body", line },
          },
          anchor,
        };
      });
    });

    return root;
  }

  override destroy(dom: HTMLElement): void {
    widgetCleanups.get(dom)?.();
    widgetCleanups.delete(dom);
  }

  override ignoreEvent(): boolean { return true; }
}
