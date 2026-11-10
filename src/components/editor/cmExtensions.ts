import { Compartment, EditorSelection, EditorState, Extension, Prec } from "@codemirror/state";
import { EditorView, dropCursor, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, bracketMatching, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { tags as t } from "@lezer/highlight";
import { livePreview, type LivePreviewHooks } from "./livePreview";
import { tableTab } from "./blockActions";
import {
  blockBoundaryKeydown, focusAdjacentBlock, focusedBlockHighlighter, focusedBlockKeydown,
  sourceSessionEscape,
} from "./blockFocus";

// All colors come from the app's theme CSS variables (index.css) so the
// editor follows the active accent/surface scheme automatically
const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "var(--content-font-size)",
    color: "rgb(var(--c-primary))",
    backgroundColor: "transparent",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    overflowY: "auto",
    overflowX: "hidden",
    fontFamily: "inherit",
    lineHeight: "var(--content-line-height)",
    // The reading view's scroller reserves the same gutter, so the text
    // measure doesn't change when a scrollbar appears or disappears.
    scrollbarGutter: "stable",
  },
  ".cm-content": {
    maxWidth: "var(--content-width)",
    margin: "0 auto",
    // Horizontal padding must match MarkdownPreview's px-8 so both modes wrap
    // at the same text width.
    padding: "20px 32px 45vh",
    caretColor: "var(--accent)",
  },
  // Match the reading view's wrapping rules instead of CM's default
  // overflow-wrap: anywhere / word-break: break-word.
  ".cm-lineWrapping": {
    whiteSpace: "pre-wrap",
    wordBreak: "normal",
    overflowWrap: "break-word",
  },
  ".cm-line": { padding: "0" },
  // Heading lines mirror the reading view (.markdown-preview h1..h6):
  // line-height 1.3 and 1.2em/0.45em vertical margins relative to each
  // level's own font size. Padding instead of margin so CodeMirror's line
  // height measurement (getBoundingClientRect) includes the spacing.
  ".cm-line.cm-md-heading": { lineHeight: "1.3" },
  ".cm-line.cm-md-heading-1": { paddingTop: "1.92em", paddingBottom: "0.72em" },
  ".cm-line.cm-md-heading-2": { paddingTop: "1.68em", paddingBottom: "0.63em" },
  ".cm-line.cm-md-heading-3": { paddingTop: "1.464em", paddingBottom: "0.549em" },
  ".cm-line.cm-md-heading-4": { paddingTop: "1.32em", paddingBottom: "0.495em" },
  ".cm-line.cm-md-heading-5": { paddingTop: "1.2em", paddingBottom: "0.45em" },
  ".cm-line.cm-md-heading-6": { paddingTop: "1.2em", paddingBottom: "0.45em" },
  // The reading view drops the first element's top margin; do the same here.
  ".cm-content > .cm-line:first-child": { paddingTop: "0" },
  // Adjacent headings: the reading view's margins collapse so the gap equals
  // the next heading's top margin only — don't add the previous bottom padding.
  ".cm-line.cm-md-heading:has(+ .cm-line.cm-md-heading)": { paddingBottom: "0" },
  // No line numbers (Obsidian default) — keep gutter chrome invisible anyway
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "rgb(var(--c-faint))",
  },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "transparent" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "rgb(var(--accent-rgb) / 0.18)",
  },
  ".cm-searchMatch": {
    backgroundColor: "rgb(var(--accent-rgb) / 0.22)",
    outline: "1px solid rgb(var(--accent-rgb) / 0.45)",
  },
  ".cm-searchMatch-selected": {
    backgroundColor: "rgb(var(--accent-rgb) / 0.4)",
  },
  // Search panel (Ctrl+F)
  ".cm-panels": {
    backgroundColor: "rgb(var(--c-surface))",
    color: "rgb(var(--c-primary))",
    borderColor: "rgb(var(--c-line))",
  },
  ".cm-panel input, .cm-panel button": {
    backgroundColor: "rgb(var(--c-base))",
    color: "rgb(var(--c-primary))",
    border: "1px solid rgb(var(--c-line))",
    borderRadius: "6px",
    padding: "2px 6px",
  },
  ".cm-panel button:hover": { backgroundColor: "rgb(var(--c-hover))" },
  ".cm-panel.cm-search label": { color: "rgb(var(--c-tertiary))" },
  ".cm-panel.cm-search input[type=checkbox]": { accentColor: "rgb(var(--accent))" },
});

// Heading/bold colors follow the Obsidian extended palette (see --md-* vars
// in index.css) so the editor matches the reading view
const highlightStyle = HighlightStyle.define([
  { tag: t.heading1, fontSize: "1.6em", fontWeight: "700", color: "var(--md-h1)" },
  { tag: t.heading2, fontSize: "1.4em", fontWeight: "700", color: "var(--md-h2)" },
  { tag: t.heading3, fontSize: "1.22em", fontWeight: "600", color: "var(--md-h3)" },
  { tag: t.heading4, fontSize: "1.1em", fontWeight: "600", color: "var(--md-h4)" },
  { tag: t.heading5, fontWeight: "600", color: "var(--md-h5)" },
  { tag: t.heading6, fontWeight: "600", color: "var(--md-h6)" },
  // One rule per construct — a later matching rule REPLACES an earlier one
  // entirely (no per-property merge), so splitting color/weight across two
  // rules drops the color
  { tag: t.strong, color: "var(--md-bold)", fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "rgb(var(--c-muted))" },
  { tag: t.link, color: "rgb(var(--accent-text))" },
  { tag: t.url, color: "rgb(var(--accent-text))", textDecoration: "underline" },
  { tag: t.monospace, fontFamily: "Consolas, 'Cascadia Code', SFMono-Regular, Menlo, monospace", fontSize: "0.9em", backgroundColor: "rgb(var(--c-tint) / 0.08)", borderRadius: "4px" },
  { tag: t.quote, color: "rgb(var(--c-tertiary))", fontStyle: "italic" },
  // No t.list rule — list text inherits the line color (gray inside quotes);
  // the bullet widget has its own muted style
  { tag: t.contentSeparator, color: "rgb(var(--c-faint))" },
  { tag: t.processingInstruction, color: "rgb(var(--c-muted))" },
  { tag: t.meta, color: "rgb(var(--c-muted))" },
  // Fenced-code syntax tokens (codeLanguages parses block contents)
  { tag: t.keyword, color: "var(--md-code-keyword)" },
  { tag: [t.string, t.special(t.string)], color: "var(--md-code-string)" },
  { tag: t.comment, color: "var(--md-code-comment)", fontStyle: "italic" },
  { tag: [t.number, t.bool, t.atom], color: "var(--md-code-number)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--md-code-function)" },
  { tag: t.typeName, color: "var(--md-code-function)" },
  { tag: t.propertyName, color: "var(--md-code-property)" },
  { tag: t.operator, color: "rgb(var(--c-tertiary))" },
]);

// Toggle wrap selection in emphasis markers; plain Ctrl+B/Ctrl+I would only
// ever add layers, Obsidian toggles them off when already wrapped
function wrapInMarkers(marker: string) {
  return (view: EditorView): boolean => {
    const tr = view.state.changeByRange((range) => {
      const before = view.state.sliceDoc(Math.max(0, range.from - marker.length), range.from);
      const after = view.state.sliceDoc(range.to, Math.min(view.state.doc.length, range.to + marker.length));
      if (before === marker && after === marker) {
        return {
          changes: [
            { from: range.from - marker.length, to: range.from, insert: "" },
            { from: range.to, to: range.to + marker.length, insert: "" },
          ],
          range: EditorSelection.range(range.from - marker.length, range.to - marker.length),
        };
      }
      const inner = view.state.sliceDoc(range.from, range.to);
      const insert = marker + inner + marker;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(range.from + marker.length, range.from + marker.length + inner.length),
      };
    });
    view.dispatch(tr, { scrollIntoView: true });
    return true;
  };
}

// Reconfigurable at runtime from the Editor settings section
export const schemeCompartment = new Compartment();
export const indentCompartment = new Compartment();
export const wrapCompartment = new Compartment();

export interface EditorOptions {
  dark: boolean;
  indentWidth: number;
  lineWrapping: boolean;
}

export function buildExtensions(hooks: LivePreviewHooks & {
  onSave: () => void;
  // Saves the attachment and returns the markdown snippet to insert, or null on failure
  onPasteImage: (file: File) => Promise<string | null>;
}, options: EditorOptions): Extension[] {
  return [
    // Tell CM6 which surface the editor sits on so every base-theme default
    // (gutters, panels, selection fallbacks) resolves to the right variants
    schemeCompartment.of(EditorView.darkTheme.of(options.dark)),
    history(),
    // No drawSelection() — native ::selection only covers rendered glyphs, so
    // multi-line highlights align strictly with visible text instead of
    // extending over the hidden line-start syntax ("- ", "> ", "## ")
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    bracketMatching(),
    indentCompartment.of(indentUnit.of(" ".repeat(options.indentWidth))),
    wrapCompartment.of(options.lineWrapping ? EditorView.lineWrapping : []),
    search({ top: true }),
    // markdownLanguage (not the markdown() default commonmarkLanguage!) —
    // GFM gives us Table/TaskMarker/StrikethroughMark/Autolink nodes.
    // addKeymap defaults to true: Enter continues lists/quotes/tasks.
    // pasteURLAsLink defaults to true: URL pasted over a selection wraps it.
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(highlightStyle),
    editorTheme,
    livePreview(hooks),
    // Paste an image from the clipboard: onPasteImage saves it and returns
    // the ready-to-insert markdown snippet (e.g. a standard ![](path) link)
    EditorView.domEventHandlers({
      paste: (event, view) => {
        const images = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (images.length > 0) {
          event.preventDefault();
          void (async () => {
            for (const file of images) {
              const insert = await hooks.onPasteImage(file);
              if (!insert) continue;
              const range = view.state.selection.main;
              view.dispatch({
                changes: { from: range.from, to: range.to, insert },
                selection: { anchor: range.from + insert.length },
                userEvent: "input.paste",
              });
            }
          })();
          return true;
        }
        // (URL pasted over a selection → link is built into markdown() as
        // pasteURLAsLink; non-image pastes fall through to it)
        return false;
      },
      // Dropping image files into the editor works like pasting them
      drop: (event, view) => {
        const images = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (images.length === 0) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
        void (async () => {
          for (const file of images) {
            const insert = await hooks.onPasteImage(file);
            if (!insert) continue;
            view.dispatch({
              changes: { from: pos, insert },
              selection: { anchor: pos + insert.length },
              userEvent: "input.drop",
            });
          }
        })();
        return true;
      },
    }),
    // Outline the block focused with the arrow keys (see blockFocus.ts)
    focusedBlockHighlighter,
    // Arrow keys / Enter / Delete on a focused block; returns false when no
    // block is focused so normal editing is unaffected
    Prec.highest(EditorView.domEventHandlers({
      keydown: (event, view) =>
        focusedBlockKeydown(event, view)
        || blockBoundaryKeydown(event, view)
        || sourceSessionEscape(event, view),
    })),
    // Tab moves between table cells; outside a table it falls through to
    // indentWithTab below.
    Prec.high(keymap.of([
      { key: "Tab", run: (view) => tableTab(view, false) },
      { key: "Shift-Tab", run: (view) => tableTab(view, true) },
      { key: "ArrowRight", run: (view) => focusAdjacentBlock(view, 1) },
      { key: "ArrowLeft", run: (view) => focusAdjacentBlock(view, -1) },
      { key: "ArrowDown", run: (view) => focusAdjacentBlock(view, 1) },
      { key: "ArrowUp", run: (view) => focusAdjacentBlock(view, -1) },
    ])),
    Prec.highest(keymap.of([
      { key: "Mod-s", preventDefault: true, run: () => { hooks.onSave(); return true; } },
      { key: "Mod-b", preventDefault: true, run: wrapInMarkers("**") },
      { key: "Mod-i", preventDefault: true, run: wrapInMarkers("*") },
    ])),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
  ];
}
