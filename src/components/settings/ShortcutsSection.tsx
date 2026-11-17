import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useT } from "../../i18n";
import { useSettings } from "../../lib/settings";
import {
  DEFAULT_SHORTCUTS,
  GLOBAL_SHORTCUT_ACTIONS,
  SHORTCUT_ACTIONS,
  formatShortcut,
  isReservedShortcut,
  isValidShortcut,
  shortcutFromEvent,
  type ShortcutAction,
} from "../../shared/shortcuts";
import Button from "../Button";
import { CONTROL_CLASSES } from "../Input";
import { SectionHeader, SettingRow } from "./controls";
import type { GlobalShortcutStatus } from "../../shared/models";

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
        data-prism-shortcut-recorder=""
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
  const [globalStatus, setGlobalStatus] = useState<GlobalShortcutStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.prism
      .getGlobalShortcutStatus()
      .then((status) => { if (!cancelled) setGlobalStatus(status); })
      .catch(() => { /* the warning is optional */ });
    return () => { cancelled = true; };
  }, [shortcuts.quickCapture, shortcuts.showMain]);

  const update = (action: ShortcutAction, combo: string) => {
    set("shortcuts", { ...shortcuts, [action]: combo });
  };

  const labelFor = (action: ShortcutAction): string => {
    if (action === "focusSearch") return t["settings.shortcutFocusSearch"];
    if (action === "toggleReadEdit") return t["settings.shortcutToggleReadEdit"];
    if (action === "showMain") return t["settings.shortcutShowMain"];
    return t["settings.shortcutQuickCapture"];
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
    {
      action: "quickCapture" as const,
      label: t["settings.shortcutQuickCapture"],
      description: t["settings.shortcutQuickCaptureDesc"],
    },
    {
      action: "showMain" as const,
      label: t["settings.shortcutShowMain"],
      description: t["settings.shortcutShowMainDesc"],
    },
  ];

  const conflictFor = (action: ShortcutAction): ShortcutAction | undefined =>
    SHORTCUT_ACTIONS.find((candidate) => candidate !== action && shortcuts[candidate] === shortcuts[action]);

  const allDefault = SHORTCUT_ACTIONS.every((action) => shortcuts[action] === DEFAULT_SHORTCUTS[action]);
  // Only warn about an OS registration that failed for the combo currently
  // stored (a stale status after editing would be misleading).
  const failedGlobalActions = GLOBAL_SHORTCUT_ACTIONS.filter((action) => {
    const state = globalStatus?.[action];
    return state !== undefined && !state.registered && state.shortcut === shortcuts[action];
  });

  return (
    <section>
      <SectionHeader title={t["settings.shortcuts"]} description={t["settings.shortcutsDesc"]} />

      <div className="space-y-3">
        {rows.map(({ action, label, description }) => {
          const conflict = conflictFor(action);
          return (
            <SettingRow key={action} label={label} description={description}>
              <div className="flex items-center gap-1">
                <ShortcutRecorder
                  value={shortcuts[action]}
                  otherValue={conflict ? shortcuts[conflict] : ""}
                  otherLabel={conflict ? labelFor(conflict) : ""}
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
          );
        })}

        {failedGlobalActions.map((action) => (
          <p key={action} className="px-1 text-caption leading-snug text-danger">
            {t["settings.shortcutGlobalFailed"]
              .replace("{name}", labelFor(action))
              .replace("{shortcut}", formatShortcut(shortcuts[action]).join("+"))}
          </p>
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
