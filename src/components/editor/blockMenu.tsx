import type { EditorView } from "@codemirror/view";
import {
  ArrowDownToLine, ArrowUpToLine, Check, Code2, SquarePen, Trash2, type LucideIcon,
} from "lucide-react";
import type { Translation } from "../../i18n/zh";
import type { MenuItem } from "../ContextMenu";
import { type BlockRef } from "./blockModel";
import { containerSession, isBlockSourceEditing } from "./blockState";
import { commitActiveBlock } from "./blockSession";
import {
  deleteBlockSource, enterBlockContainer, enterBlockSource, exitBlockEdit,
  insertParagraphAbove, insertParagraphBelow,
} from "./blockActions";
import { containerEntry, containerSpec } from "./containers/registry";

type ShowToast = (
  message: string,
  type?: "default" | "success" | "error" | "info",
) => void;

const icon = (Icon: LucideIcon) => <Icon size={14} />;
const separator: MenuItem = { label: "", separator: true };

function intersects(
  session: { from: number; to: number } | null,
  from: number,
  to: number,
): boolean {
  return session != null && session.from <= to && session.to >= from;
}

function insertParagraphItems(view: EditorView, from: number, to: number, t: Translation): MenuItem[] {
  return [
    { label: t["menu.insertParagraphAbove"], icon: icon(ArrowUpToLine), onClick: () => insertParagraphAbove(view, from) },
    { label: t["menu.insertParagraphBelow"], icon: icon(ArrowDownToLine), onClick: () => insertParagraphBelow(view, to) },
  ];
}

function containerDoneItem(view: EditorView, t: Translation): MenuItem {
  return {
    label: t["menu.finishBlockEdit"],
    icon: icon(Check),
    onClick: () => commitActiveBlock(view, true),
  };
}

function sourceDoneItem(view: EditorView, t: Translation): MenuItem {
  return {
    label: t["menu.finishBlockEdit"],
    icon: icon(Check),
    onClick: () => exitBlockEdit(view),
  };
}

function editBlockItem(
  view: EditorView,
  block: BlockRef,
  target: HTMLElement | null,
  t: Translation,
): MenuItem {
  const entry = containerEntry(block, target);
  return {
    label: t["menu.editBlock"],
    icon: icon(SquarePen),
    onClick: () => enterBlockContainer(view, {
      kind: block.kind,
      from: block.replaceFrom,
      to: block.replaceTo,
      anchor: entry.anchor,
      target: entry.target,
    }),
  };
}

function editSourceItem(view: EditorView, block: BlockRef, anchor: number, t: Translation): MenuItem {
  return {
    label: t["menu.editSource"],
    icon: icon(Code2),
    onClick: () => enterBlockSource(
      view,
      { kind: block.kind, from: block.replaceFrom, to: block.replaceTo, anchor },
      anchor,
    ),
  };
}

export function blockMenuItems(
  view: EditorView,
  block: BlockRef,
  target: HTMLElement | null,
  t: Translation,
  showToast: ShowToast,
): MenuItem[] {
  const container = containerSession(view.state);
  if (intersects(container, block.replaceFrom, block.replaceTo)) {
    return [containerDoneItem(view, t)];
  }

  const source = isBlockSourceEditing(view.state, block.replaceFrom, block.replaceTo);
  const spec = containerSpec(block.kind);
  const items: MenuItem[] = [];
  if (source) {
    items.push(sourceDoneItem(view, t));
  } else {
    if (spec.container) items.push(editBlockItem(view, block, target, t));
    items.push(editSourceItem(view, block, spec.sourceAnchor(block), t));
  }

  const section = spec.menu?.({ view, ref: block, t, target, source, showToast }) ?? [];
  if (section.length > 0) {
    items.push(separator, ...section);
  }

  if (!source) {
    items.push(separator, ...insertParagraphItems(view, block.replaceFrom, block.replaceTo, t));
  }

  items.push(separator, {
    label: spec.deleteLabel(t),
    icon: icon(Trash2),
    danger: true,
    onClick: () => deleteBlockSource(view, block),
  });
  return items;
}
