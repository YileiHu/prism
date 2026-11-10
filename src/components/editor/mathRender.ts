import { WidgetType, type EditorView } from "@codemirror/view";
import { renderToString } from "katex";
import type { MathBlockRef } from "./mathModel";
import { mathBlockRefAt } from "./blockModel";
import { blockSession, type BlockTarget } from "./blockState";
import {
  activateBlockFromDom, mathBodyInitial,
  registerBlockEditor, writeMathBody,
} from "./blockSession";
import { focusAt, scheduleAutoGrow } from "./blockRender";
import { bindContainerField, commitContainerOnFocusOut } from "./containers/bind";

function renderMath(tex: string, displayMode: boolean): string {
  return renderToString(tex, { throwOnError: false, displayMode });
}

const mathCleanups = new WeakMap<HTMLElement, () => void>();

export class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly displayMode: boolean,
    readonly anchor: number | null = null,
  ) { super(); }

  override eq(other: this): boolean {
    return other.tex === this.tex
      && other.displayMode === this.displayMode
      && other.anchor === this.anchor;
  }

  override toDOM(view: EditorView): HTMLElement {
    const span = document.createElement(this.displayMode ? "div" : "span");
    span.className = this.displayMode ? "cm-md-math cm-md-math-display" : "cm-md-math";
    span.innerHTML = renderMath(this.tex, this.displayMode);
    if (this.anchor != null) {
      span.classList.add("cm-md-math-clickable");
      span.addEventListener("mousedown", (event) => {
        event.preventDefault();
        view.dispatch({ selection: { anchor: this.anchor! }, scrollIntoView: true });
        view.focus();
      });
    }
    return span;
  }
}

export class MathBlockWidget extends WidgetType {
  constructor(
    readonly block: MathBlockRef,
    readonly sessionId: number | null = null,
    readonly target?: Extract<BlockTarget, { kind: "math" }>,
    readonly onSave?: () => void,
  ) { super(); }

  override eq(other: this): boolean {
    return other.block.tex === this.block.tex
      && other.sessionId === this.sessionId
      && other.target?.part === this.target?.part;
  }

  override toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("div");
    root.className = "cm-md-block-widget cm-md-math-block";
    if (this.sessionId != null) root.classList.add("cm-md-block-active");
    root.dataset.blockKind = "math";
    root.dataset.blockFrom = String(this.block.replaceFrom);
    root.dataset.blockTo = String(this.block.replaceTo);

    if (this.sessionId != null) {
      let destroyed = false;
      let committing = false;
      let previewFrame = 0;
      const sessionId = this.sessionId;
      root.dataset.prismContainerEdit = "true";
      root.dataset.prismBlockEditor = String(sessionId);

      const header = document.createElement("div");
      header.className = "cm-md-code-header";
      const label = document.createElement("span");
      label.className = "cm-md-code-lang";
      label.textContent = "math";
      header.appendChild(label);

      const preview = document.createElement("div");
      preview.className = "cm-md-math-preview";
      preview.innerHTML = renderMath(mathBodyInitial(this.block), true);

      const textarea = document.createElement("textarea");
      textarea.className = "cm-md-math-editor";
      textarea.spellcheck = false;
      textarea.dataset.prismSubeditor = "true";
      textarea.value = mathBodyInitial(this.block);

      const refreshPreview = () => {
        if (previewFrame) return;
        previewFrame = requestAnimationFrame(() => {
          previewFrame = 0;
          if (destroyed) return;
          preview.innerHTML = renderMath(textarea.value.trim(), true);
          scheduleAutoGrow(textarea);
        });
      };

      const commit = (focusView: boolean, preserveSelection = false): boolean => {
        if (committing || destroyed) return false;
        committing = true;
        return writeMathBody(view, root, textarea.value, focusView, preserveSelection);
      };

      preview.addEventListener("mousedown", (event) => {
        event.preventDefault();
        textarea.focus();
      });
      root.appendChild(header);
      root.appendChild(preview);
      root.appendChild(textarea);

      bindContainerField(
        view, sessionId, root,
        { id: "body", el: textarea, enter: "newline", tab: "indent" },
        { commit, onSave: this.onSave },
      );
      textarea.addEventListener("input", refreshPreview);
      commitContainerOnFocusOut(view, sessionId, root, commit, () => !destroyed);

      const unregister = registerBlockEditor(view, sessionId, root, commit);
      const cleanup = () => {
        destroyed = true;
        if (previewFrame) cancelAnimationFrame(previewFrame);
        unregister();
      };
      mathCleanups.set(root, cleanup);

      requestAnimationFrame(() => {
        if (destroyed || blockSession(view.state)?.id !== sessionId) return;
        focusAt(textarea, textarea.value.length);
        scheduleAutoGrow(textarea);
      });
      return root;
    }

    const formula = document.createElement("div");
    formula.className = "cm-md-math cm-md-math-display cm-md-math-block-body";
    formula.innerHTML = renderMath(this.block.tex, true);
    root.appendChild(formula);
    root.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a, input, textarea")) return;
      event.preventDefault();
      event.stopPropagation();
      activateBlockFromDom(view, root, (state, pos) => {
        const ref = mathBlockRefAt(state, pos);
        if (!ref) return null;
        return {
          init: {
            kind: "math",
            mode: "container",
            from: ref.replaceFrom,
            to: ref.replaceTo,
            anchor: ref.bodyFrom + 1,
            target: { kind: "math", part: "body" },
          },
          anchor: ref.bodyFrom + 1,
        };
      });
    });
    return root;
  }

  override destroy(dom: HTMLElement): void {
    mathCleanups.get(dom)?.();
    mathCleanups.delete(dom);
  }
}
