import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import Modal from "../Modal";
import Button from "../Button";
import DueDateCalendar from "./DueDateCalendar";
import { useT } from "../../i18n";
import { addDays, dateKey } from "../../lib/dates";

interface Props {
  open: boolean;
  title: string;
  value: string | null;
  onClose: () => void;
  onSave: (date: string | null) => void;
}

export default function GtdDueDateModal({ open, title, value, onClose, onSave }: Props) {
  const { t } = useT();
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open) setDraft(value ?? "");
  }, [open, value]);

  const today = new Date();
  const presets = [
    { label: t["gtd.dueDate.today"], value: dateKey(today) },
    { label: t["gtd.dueDate.tomorrow"], value: dateKey(addDays(today, 1)) },
    { label: t["gtd.dueDate.nextWeek"], value: dateKey(addDays(today, 7)) },
    { label: t["gtd.dueDate.clear"], value: "" },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t["gtd.dueDate.title"]}
      icon={CalendarDays}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["resources.cancel"]}
          </Button>
          <Button variant="primary" size="sm" onClick={() => onSave(draft.trim() ? draft : null)}>
            {t["resources.save"]}
          </Button>
        </>
      }
    >
      <p className="mb-4 whitespace-pre-wrap break-words rounded-control border border-line/50 bg-elevated px-3 py-2 text-body font-medium text-primary">
        {title}
      </p>
      <DueDateCalendar value={draft || null} onChange={setDraft} />
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
  );
}
