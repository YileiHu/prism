import { useRef, useState } from "react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { Textarea } from "../Input";

interface Props {
  className?: string;
  autoFocus?: boolean;
  rows?: number;
  /** Stretch to the container instead of growing with the content. */
  fill?: boolean;
  /** When set, new tasks are added straight into this project. */
  projectId?: number | null;
  /** When set, the new task is created on this date in one IPC call. */
  scheduledDate?: string | null;
  placeholder?: string;
  onSaved?: () => void;
}

export default function InboxCapture({
  className = "",
  autoFocus,
  rows = 1,
  fill = false,
  projectId = null,
  scheduledDate = null,
  placeholder,
  onSaved,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Grow with the content up to ~4 lines, then scroll internally
  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  };

  const submit = async () => {
    const title = draft.trim();
    if (!title) return;
    try {
      await window.prism.addGtdTask(title, projectId, scheduledDate);
    } catch {
      showToast(t["common.saveFailed"], "error");
      return;
    }
    setDraft("");
    if (inputRef.current) {
      inputRef.current.style.height = "";
      inputRef.current.focus();
    }
    onSaved?.();
    window.dispatchEvent(new Event("gtd-changed"));
  };

  return (
    <Textarea
      ref={inputRef}
      rows={rows}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (!fill) autoGrow(e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          submit();
        }
      }}
      placeholder={placeholder ?? t["gtd.quickAdd"]}
      autoFocus={autoFocus}
      className={`w-full resize-none overflow-y-auto ${fill ? "" : "max-h-24"} ${className}`}
    />
  );
}
