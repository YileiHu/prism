import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useT } from "../../i18n";
import { useSettings } from "../../lib/settings";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_ACTIONS,
  formatShortcut,
  isReservedShortcut,
  isValidShortcut,
  shortcutFromEvent,
  type ShortcutAction,
  type ShortcutMap,
} from "../../shared/shortcuts";
import Button from "../Button";
import { CONTROL_CLASSES } from "../Input";
import { SectionHeader, SettingRow } from "./controls";

type RecorderError = "conflict" | "reserved";

function ShortcutRecorder({
  value,
  otherValue,
  otherLabel,
  onChange,
}: {
  value: string;
  otherValue: string;
  otherLabel: string;
  onChange: (combo: string) => void;
}) {
  const { t } = useT();
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<RecorderError | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const stopRecording = () => {
    setRecording(false);
    setError(null);
    buttonRef.current?.blur();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setError(null);
          setRecording(true);
        }}
        onBlur={() => {
          if (!recording) return;
          setRecording(false);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (!recording) return;
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            stopRecording();
            return;
          }
          const combo = shortcutFromEvent(e.nativeEvent);
          if (!combo) return;
          e.preventDefault();
          e.stopPropagation();
          setError(null);
          if (isReservedShortcut(combo) || !isValidShortcut(combo)) {
            setError("reserved");
            return;
          }
          if (combo === otherValue) {
            setError("conflict");
            return;
          }
          onChange(combo);
          stopRecording();
        }}
        title={t["settings.shortcutRecording"]}
        className={`${CONTROL_CLASSES} min-w-[150px] flex items-center justify-center gap-1 ${
          recording ? "accent-ring border-[var(--accent)]" : ""
        }`}
      >
        {recording ? (
          <span className="text-caption text-muted">{t["settings.shortcutRecording"]}</span>
        ) : (
          formatShortcut(value).map((part, index) => (
            <span key={`${part}-${index}`} className="flex items-center gap-1">
              {index > 0 && <span className="text-caption text-muted">+</span>}
              <kbd className="px-1.5 py-0.5 rounded-chip border border-[var(--inset-border)] surface-raised text-caption text-secondary font-medium">
                {part}
              </kbd>
            </span>
          ))
        )}
      </button>
      {error && (
        <span className="text-caption text-danger max-w-[220px] text-right leading-snug">
          {error === "conflict"
            ? t["settings.shortcutConflict"].replace("{name}", otherLabel)
            : t["settings.shortcutReserved"]}
        </span>
      )}
    </div>
  );
}

export default function ShortcutsSection() {
  const { t } = useT();
  const { values, set } = useSettings();
  const shortcuts = values.shortcuts;

  const update = (action: ShortcutAction, combo: string) => {
    const next: ShortcutMap = action === "focusSearch"
      ? { ...shortcuts, focusSearch: combo }
      : { ...shortcuts, toggleReadEdit: combo };
    set("shortcuts", next);
  };

  const rows = [
    {
      action: "focusSearch" as const,
      label: t["settings.shortcutFocusSearch"],
      description: t["settings.shortcutFocusSearchDesc"],
    },
    {
      action: "toggleReadEdit" as const,
      label: t["settings.shortcutToggleReadEdit"],
      description: t["settings.shortcutToggleReadEditDesc"],
    },
  ];
  const otherAction = (action: ShortcutAction): ShortcutAction =>
    action === "focusSearch" ? "toggleReadEdit" : "focusSearch";
  const otherLabel = (action: ShortcutAction): string =>
    action === "focusSearch" ? t["settings.shortcutToggleReadEdit"] : t["settings.shortcutFocusSearch"];
  const allDefault = SHORTCUT_ACTIONS.every((action) => shortcuts[action] === DEFAULT_SHORTCUTS[action]);

  return (
    <section>
      <SectionHeader title={t["settings.shortcuts"]} description={t["settings.shortcutsDesc"]} />

      <div className="space-y-3">
        {rows.map(({ action, label, description }) => (
          <SettingRow key={action} label={label} description={description}>
            <div className="flex items-center gap-1">
              <ShortcutRecorder
                value={shortcuts[action]}
                otherValue={shortcuts[otherAction(action)]}
                otherLabel={otherLabel(action)}
                onChange={(combo) => update(action, combo)}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                title={t["settings.shortcutReset"]}
                disabled={shortcuts[action] === DEFAULT_SHORTCUTS[action]}
                onClick={() => update(action, DEFAULT_SHORTCUTS[action])}
              >
                <RotateCcw size={12} />
              </Button>
            </div>
          </SettingRow>
        ))}

        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            disabled={allDefault}
            onClick={() => set("shortcuts", { ...DEFAULT_SHORTCUTS })}
          >
            <RotateCcw size={14} />
            {t["settings.shortcutResetAll"]}
          </Button>
        </div>
      </div>
    </section>
  );
}
