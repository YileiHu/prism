import { createElement } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, Columns3, Minus, Rows3, Trash2, type LucideIcon,
} from "lucide-react";
import type { MenuItem } from "../../ContextMenu";
import type { BlockRef } from "../blockModel";
import { tableCellAt, tableColumnCount, type TableBlockRef } from "../tableModel";
import {
  tableDeleteColumn, tableDeleteRow, tableInsertColumn, tableInsertRow, tableSetAlignment,
} from "../blockActions";
import type { ContainerSpec } from "./types";

const icon = (Icon: LucideIcon) => createElement(Icon, { size: 14 });

function cellAt(
  block: TableBlockRef,
  target: HTMLElement | null | undefined,
): { row: number; col: number } {
  const cellEl = target?.closest?.<HTMLElement>("[data-cell-row]") ?? null;
  let row = cellEl ? Number(cellEl.dataset.cellRow) : Number.NaN;
  let col = cellEl ? Number(cellEl.dataset.cellCol) : Number.NaN;
  if (!Number.isFinite(row) || !Number.isFinite(col)) {
    const hit = tableCellAt(block.model, block.replaceFrom);
    row = hit?.row ?? 0;
    col = hit?.col ?? 0;
  }
  return { row, col };
}

export const tableContainer: ContainerSpec = {
  kind: "table",
  container: true,
  entry(ref: BlockRef, target?: HTMLElement | null) {
    const block = ref as TableBlockRef;
    const { row, col } = cellAt(block, target);
    const cell = block.model.rows[row]?.cells[col];
    return {
      target: { kind: "table", row, col, offset: 0 },
      anchor: cell?.from ?? block.replaceFrom,
    };
  },
  sourceAnchor(ref: BlockRef) {
    return (ref as TableBlockRef).replaceFrom;
  },
  menu(ctx) {
    const block = ctx.ref as TableBlockRef;
    const { row: cellRow, col: cellCol } = cellAt(block, ctx.target);
    const isBody = block.model.rows[cellRow]?.kind === "body";
    const colCount = tableColumnCount(block.model);
    const currentAlign = block.model.alignments[cellCol] ?? "default";
    const t = ctx.t;
    const items: MenuItem[] = [
      {
        label: t["blockTable.insertAbove"],
        icon: icon(Rows3),
        onClick: () => tableInsertRow(ctx.view, block.model, cellRow, "above"),
      },
      {
        label: t["blockTable.insertBelow"],
        icon: icon(Rows3),
        onClick: () => tableInsertRow(ctx.view, block.model, cellRow, "below"),
      },
    ];
    if (isBody) {
      items.push({
        label: t["blockTable.deleteRow"],
        icon: icon(Trash2),
        danger: true,
        onClick: () => tableDeleteRow(ctx.view, block.model, cellRow),
      });
    }
    items.push(
      {
        label: t["blockTable.insertLeft"],
        icon: icon(Columns3),
        onClick: () => tableInsertColumn(ctx.view, block.model, cellRow, cellCol, "left"),
      },
      {
        label: t["blockTable.insertRight"],
        icon: icon(Columns3),
        onClick: () => tableInsertColumn(ctx.view, block.model, cellRow, cellCol, "right"),
      },
    );
    if (colCount > 1) {
      items.push({
        label: t["blockTable.deleteColumn"],
        icon: icon(Trash2),
        danger: true,
        onClick: () => tableDeleteColumn(ctx.view, block.model, cellRow, cellCol),
      });
    }
    items.push({
      label: t["blockTable.align"],
      icon: icon(AlignCenter),
      children: [
        { label: t["blockTable.alignDefault"], icon: icon(Minus), checked: currentAlign === "default", onClick: () => tableSetAlignment(ctx.view, block.model, cellCol, "default") },
        { label: t["blockTable.alignLeft"], icon: icon(AlignLeft), checked: currentAlign === "left", onClick: () => tableSetAlignment(ctx.view, block.model, cellCol, "left") },
        { label: t["blockTable.alignCenter"], icon: icon(AlignCenter), checked: currentAlign === "center", onClick: () => tableSetAlignment(ctx.view, block.model, cellCol, "center") },
        { label: t["blockTable.alignRight"], icon: icon(AlignRight), checked: currentAlign === "right", onClick: () => tableSetAlignment(ctx.view, block.model, cellCol, "right") },
      ],
    });
    return items;
  },
  deleteLabel: (t) => t["blockTable.deleteTable"],
};
