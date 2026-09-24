import { EditorSelection, EditorState, Extension, Prec } from "@codemirror/state";
import { EditorView, drawSelection, dropCursor, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, bracketMatching, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { markdown } from "@codemirror/lang-markdown";
import { tags as t } from "@lezer/highlight";
import { livePreview, type LivePreviewHooks } from "./livePreview";

// All colors come from the app's theme CSS variables (index.css) so the
// editor follows the active accent/surface scheme automatically
const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "14.5px",
    color: "rgb(var(--c-primary))",
    backgroundColor: "transparent",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    overflowY: "auto",
    overflowX: "hidden",
    fontFamily: "inherit",
    lineHeight: "1.7",
  },
  ".cm-content": {
    maxWidth: "750px",
    margin: "0 auto",
    padding: "20px 28px 45vh",
    caretColor: "rgb(var(--accent))",
  },
  ".cm-line": { padding: "0" },
  // No line numbers (Obsidian default) — keep gutter chrome invisible anyway
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "rgb(var(--c-faint))",
  },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "transparent" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "rgb(var(--accent))" },
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
  { tag: t.strong, color: "var(--md-bold)" },
  { tag: [t.heading, t.strong], fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "rgb(var(--c-muted))" },
  { tag: t.link, color: "rgb(var(--accent-text))" },
  { tag: t.url, color: "rgb(var(--accent-text))", textDecoration: "underline" },
  { tag: t.monospace, fontFamily: "Consolas, 'Cascadia Code', SFMono-Regular, Menlo, monospace", fontSize: "0.9em", backgroundColor: "rgb(var(--c-tint) / 0.08)", borderRadius: "4px" },
  { tag: t.quote, color: "rgb(var(--c-tertiary))", fontStyle: "italic" },
  { tag: t.list, color: "rgb(var(--accent-text))" },
  { tag: t.contentSeparator, color: "rgb(var(--c-faint))" },
  { tag: t.processingInstruction, color: "rgb(var(--c-muted))" },
  { tag: t.meta, color: "rgb(var(--c-muted))" },
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

export function buildExtensions(hooks: LivePreviewHooks & { onSave: () => void }): Extension[] {
  return [
    // Tell CM6 the editor sits on a dark surface so every base-theme default
    // (gutters, panels, selection fallbacks) resolves to dark variants
    EditorView.darkTheme.of(true),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    bracketMatching(),
    indentUnit.of("    "),
    EditorView.lineWrapping,
    search({ top: true }),
    highlightSelectionMatches(),
    markdown(),
    syntaxHighlighting(highlightStyle),
    editorTheme,
    livePreview(hooks),
    Prec.highest(keymap.of([
      { key: "Mod-s", preventDefault: true, run: () => { hooks.onSave(); return true; } },
      { key: "Mod-b", preventDefault: true, run: wrapInMarkers("**") },
      { key: "Mod-i", preventDefault: true, run: wrapInMarkers("*") },
    ])),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
  ];
}
