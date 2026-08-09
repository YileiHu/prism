export interface ScheduleBlock {
  id: number;
  label: string;
  start: string;
  end: string;
  color: string;
  sort_order: number;
}

export interface FavoriteNote {
  path: string;
  title: string;
  created_at: string;
  missing?: boolean;
}

export interface RecentNote {
  path: string;
  title: string;
  opened_at: string;
  missing?: boolean;
}

// opened_at is stored as localtime "YYYY-MM-DD HH:MM:SS"; parse as local (no "Z")
export function formatRecentTime(value: string): string {
  const d = new Date(value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "numeric", day: "numeric" });
}
