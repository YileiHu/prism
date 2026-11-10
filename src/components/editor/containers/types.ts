import type { EditorView } from "@codemirror/view";
import type { Translation } from "../../../i18n/zh";
import type { MenuItem } from "../../ContextMenu";
import type { BlockRef } from "../blockModel";
import type { BlockTarget } from "../blockState";

export interface ContainerEntry {
  target: BlockTarget;
  anchor: number;
}

export interface ContainerMenuContext {
  view: EditorView;
  ref: BlockRef;
  t: Translation;
  target: HTMLElement | null;
  // True while the block is shown as raw source instead of a card
  source: boolean;
  showToast: (message: string, type?: "default" | "success" | "error" | "info") => void;
}

// Per-kind metadata and behavior. Everything that used to be an if/else on
// block.kind in the editor core should live in one of these.
export interface ContainerSpec {
  kind: BlockRef["kind"];
  // False for kinds that have no in-card editing mode (embeds edit as source)
  container: boolean;
  // Target + caret anchor for keyboard/menu entry into the container;
  // `target` is the DOM element the menu was opened on, when available
  entry(ref: BlockRef, target?: HTMLElement | null): ContainerEntry;
  // Caret anchor for explicit "edit source"
  sourceAnchor(ref: BlockRef): number;
  // Kind-specific menu section; the shared edit/source/paragraph/delete items
  // are composed by blockMenu
  menu?(ctx: ContainerMenuContext): MenuItem[];
  deleteLabel(t: Translation): string;
}
