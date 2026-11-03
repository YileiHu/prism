export type GtdStatus = "inbox" | "someday" | "waiting" | "project" | "done";

export interface GtdItem {
  id: number;
  title: string;
  status: GtdStatus;
  is_next: number;
  description: string;
  color: string;
  created_at: string;
  done_at: string | null;
  action_count: number;
  done_action_count: number;
}

export interface GtdAction {
  id: number;
  project_id: number;
  title: string;
  is_done: number;
  is_next: number;
  sort_order: number;
  created_at: string;
  done_at: string | null;
}

export interface GtdNextList {
  waiting: GtdItem[];
  projects: { project: GtdItem; action: GtdAction }[];
}

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
