import { CalendarDays } from "lucide-react";
import { useT } from "../../i18n";
import { daysUntil, parseDateKey } from "../../lib/dates";

interface Props {
  dueDate: string | null;
  onClick?: () => void;
  className?: string;
}

export default function DueDateChip({ dueDate, onClick, className = "" }: Props) {
  const { t, lang } = useT();
  if (!dueDate) return null;

  const diff = daysUntil(dueDate);
  const date = parseDateKey(dueDate);
  if (diff === null || !date) return null;

  let label: string;
  let tone: string;
  if (diff < 0) {
    label = t["gtd.dueDate.overdue"].replace("{count}", String(-diff));
    tone = "text-danger";
  } else if (diff === 0) {
    label = t["gtd.dueDate.today"];
    tone = "text-[var(--accent-text)]";
  } else if (diff === 1) {
    label = t["gtd.dueDate.tomorrow"];
    tone = "text-secondary";
  } else {
    label = date.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
    });
    tone = "text-faint";
  }

  const className2 = `inline-flex flex-shrink-0 items-center gap-1 text-caption ${tone} ${className}`;
  const content = (
    <>
      <CalendarDays size={11} />
      <span className="truncate">{label}</span>
    </>
  );

  if (!onClick) return <span className={className2}>{content}</span>;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`${className2} rounded-chip hover:underline`}
    >
      {content}
    </button>
  );
}
