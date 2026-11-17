const pad2 = (n: number) => String(n).padStart(2, "0");

/** Local calendar date key. Never derive this from toISOString (UTC shift). */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export interface MonthGridCell {
  date: Date;
  key: string;
  day: number;
  inMonth: boolean;
}

/**
 * Fixed 6×7 month grid. `month` is 0-based. Keeping all 42 cells gives the
 * calendar a stable height and lets adjacent-month days show their tasks too.
 */
export function buildMonthGrid(year: number, month: number, weekStart: 0 | 1 = 0): MonthGridCell[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() - weekStart + 7) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(start, i);
    return {
      date,
      key: dateKey(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month && date.getFullYear() === year,
    };
  });
}

/** Whole days from today to the target local date, DST-safe. */
export function daysUntil(key: string, today = new Date()): number | null {
  const target = parseDateKey(key);
  if (!target) return null;
  const targetUtc = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((targetUtc - todayUtc) / 86_400_000);
}

/**
 * The earlier of two optional YYYY-MM-DD keys. Both year-first keys compare
 * correctly as plain strings, so no Date parsing is needed here.
 */
export function minDateKey(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}
