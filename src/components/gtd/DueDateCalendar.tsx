import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "../../i18n";
import Button from "../Button";
import { dateKey, parseDateKey } from "../../lib/dates";

interface Props {
  value: string | null;
  onChange: (key: string) => void;
}

export default function DueDateCalendar({ value, onChange }: Props) {
  const { t, lang } = useT();
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  const weekStart = lang === "zh" ? 1 : 0;
  const today = new Date();
  const todayKey = dateKey(today);

  const [cursor, setCursor] = useState(() => {
    const base = (value ? parseDateKey(value) : null) ?? today;
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  // Follow external changes (quick presets) to the month they land in.
  useEffect(() => {
    const date = value ? parseDateKey(value) : null;
    if (!date) return;
    setCursor((current) =>
      current.year === date.getFullYear() && current.month === date.getMonth()
        ? current
        : { year: date.getFullYear(), month: date.getMonth() },
    );
  }, [value]);

  const weekdays = useMemo(() => {
    const sunday = new Date(2024, 0, 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + ((weekStart + i) % 7));
      return d.toLocaleDateString(locale, { weekday: "short" });
    });
  }, [locale, weekStart]);

  const cells = useMemo(() => {
    const offset = (new Date(cursor.year, cursor.month, 1).getDay() - weekStart + 7) % 7;
    const days = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const list: (number | null)[] = Array<number | null>(offset).fill(null);
    for (let d = 1; d <= days; d += 1) list.push(d);
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [cursor, weekStart]);

  const label = new Date(cursor.year, cursor.month, 1).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
  });

  const shift = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  return (
    <div className="select-none rounded-card border border-line/50 bg-elevated/40 p-2">
      <div className="mb-1 flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          className="h-6 w-6 rounded-full"
          aria-label={t["gtd.dueDate.prevMonth"]}
          onClick={() => shift(-1)}
        >
          <ChevronLeft size={15} />
        </Button>
        <div className="flex-1 text-center text-control font-medium text-secondary">{label}</div>
        <Button
          variant="ghost"
          size="icon-xs"
          className="h-6 w-6 rounded-full"
          aria-label={t["gtd.dueDate.nextMonth"]}
          onClick={() => shift(1)}
        >
          <ChevronRight size={15} />
        </Button>
      </div>

      <div className="grid grid-cols-7">
        {weekdays.map((name, i) => (
          <div key={`w${i}`} className="flex h-6 items-center justify-center text-meta text-faint">
            {name}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} className="h-8" />;
          const key = dateKey(new Date(cursor.year, cursor.month, day));
          const isSelected = key === value;
          const isToday = key === todayKey;
          return (
            <div key={key} className="flex h-8 items-center justify-center">
              <button
                type="button"
                onClick={() => onChange(key)}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-control tabular-nums transition-colors ${
                  isSelected
                    ? "bg-[var(--accent)] font-medium text-[var(--on-accent)]"
                    : isToday
                      ? "bg-[var(--accent-muted)] text-[var(--accent-text)] hover:bg-[var(--accent)] hover:text-[var(--on-accent)]"
                      : "text-secondary hover:bg-[var(--accent-muted)] hover:text-primary"
                }`}
              >
                {day}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
