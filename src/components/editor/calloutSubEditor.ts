import { EditorState, Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { buildExtensions, type EditorOptions } from "./cmExtensions";
import type { LivePreviewHooks } from "./livePreview";
import { blockSession, focusedBlock } from "./blockState";
import { commitActiveBlock } from "./blockSession";
import type {
  CreateSubEditor, SubEditorOptions,
} from "./blockRender";

export interface SubEditorDeps {
  hooks: () => Omit<LivePreviewHooks, "createSubEditor">;
  options: () => EditorOptions;
  onPasteImage: (file: File) => Promise<string | null>;
}

// Esc / Mod+Enter close the callout only when nothing inside the draft is
// focused or being edited — nested blocks handle those keys themselves.
function escapePolicy(opts: SubEditorOptions) {
  return Prec.highest(EditorView.domEventHandlers({
    keydown: (event, view) => {
      if (event.isComposing) return false;
      if (blockSession(view.state) || focusedBlock(view.state)) return false;
      const mod = event.ctrlKey || event.metaKey;
      if (event.key === "Escape" || (mod && event.key === "Enter")) {
        event.preventDefault();
        opts.onCommit(true);
        return true;
      }
      return false;
    },
  }));
}

// Commit whatever transient widget editor is open inside the draft (table
// cell, code body, embed caption) so the callout write-back sees it.
function flushActiveBlock(view: EditorView): void {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    if (view.dom.contains(active)) active.blur();
  }
  commitActiveBlock(view, false, true);
}

// Builds the miniature live-preview editor hosted by a callout body. It uses
// the exact same extension stack as the outer note editor, so every container
// kind works inside the callout without a separate nested-block model.
export function createCalloutSubEditor(deps: SubEditorDeps): CreateSubEditor {
  const factory: CreateSubEditor = (host, doc, opts) => {
    const state = EditorState.create({
      doc,
      extensions: [
        escapePolicy(opts),
        // Must go through the facet — CodeMirror rewrites the root's class
        // attribute on focus changes and would drop a manual classList.add
        EditorView.editorAttributes.of({ class: "prism-callout-cm" }),
        ...buildExtensions({
          ...deps.hooks(),
          onToggleTask: undefined,
          createSubEditor: factory,
          onSave: opts.onSave,
          onPasteImage: deps.onPasteImage,
        }, deps.options()),
        EditorView.updateListener.of((update) => {
          if (update.docChanged || update.geometryChanged) opts.onChange?.();
        }),
      ],
    });
    const view = new EditorView({ state, parent: host });

    let measureFrame = 0;
    const observer = new ResizeObserver(() => {
      if (measureFrame) return;
      measureFrame = requestAnimationFrame(() => {
        measureFrame = 0;
        opts.onChange?.();
      });
    });
    observer.observe(view.dom);

    return {
      view,
      flushActiveBlock: () => flushActiveBlock(view),
      focusLine(line: number) {
        const doc = view.state.doc;
        const target = Math.max(0, Math.min(line, doc.lines - 1));
        view.dispatch({
          selection: { anchor: doc.line(target + 1).from },
          scrollIntoView: true,
        });
        view.focus();
      },
      focusEnd() {
        view.dispatch({
          selection: { anchor: view.state.doc.length },
          scrollIntoView: true,
        });
        view.focus();
      },
      destroy() {
        if (measureFrame) cancelAnimationFrame(measureFrame);
        observer.disconnect();
        view.destroy();
      },
    };
  };
  return factory;
}
