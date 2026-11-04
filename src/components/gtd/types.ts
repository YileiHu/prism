import type { GtdAction, GtdItem, GtdNextList, GtdStatus } from "../../shared/models";

export type { GtdAction, GtdItem, GtdNextList, GtdStatus };

export type GtdListKey = GtdStatus;

export interface GtdFocusRequest {
  list: "waiting" | "project";
  itemId?: number;
  projectId?: number;
  actionId?: number;
}

export interface GtdFocus extends GtdFocusRequest {
  seq: number;
}

export function formatGtdDate(value: string): string {
  return new Date(value + "Z").toLocaleDateString();
}
