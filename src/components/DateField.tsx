import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";
import DateCalendar from "./DateCalendar";
import { CONTROL_CLASSES } from "./Input";
import { useT } from "../i18n";
import { addDays, dateKey } from "../lib/dates";

interface Props {
  /** `YYYY-MM-DD`, or "" when unset. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  allowClear?: boolean;
}

/**
 * Date input that uses the app's own calendar instead of the native picker, so
 * it matches the control styling everywhere (growth forms, modals, settings).
 */
export default function DateField({
  value,
  onChange,
  placeholder,
  className = "",
  allowClear = true,
}: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const today = new Date();
  const presets = [
    { label: t["date.today"], value: dateKey(today) },
    { label: t["date.tomorrow"], value: dateKey(addDays(today, 1)) },
    { label: t["date.nextWeek"], value: dateKey(addDays(today, 7)) },
  ];
  if (allowClear) presets.push({ label: t["date.clear"], value: "" });

  const commit = () => {
    onChange(draft);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${CONTROL_CLASSES} flex w-full items-center gap-2 text-left ${className}`}
      >
        <CalendarDays size={14} className="flex-shrink-0 text-faint" />
        <span className={`min-w-0 flex-1 truncate ${value ? "text-primary" : "text-muted"}`}>
          {value || placeholder || t["date.placeholder"]}
        </span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t["date.pick"]}
        icon={CalendarDays}
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              {t["resources.cancel"]}
            </Button>
            <Button variant="primary" size="sm" onClick={commit}>
              {t["resources.save"]}
            </Button>
          </>
        }
      >
        <DateCalendar value={draft || null} onChange={setDraft} />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              variant="secondary"
              size="xs"
              onClick={() => setDraft(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </Modal>
    </>
  );
}
