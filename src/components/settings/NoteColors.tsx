import { useT } from "../../i18n";
import { useSettings } from "../../lib/settings";
import type { SettingKey } from "../../shared/settings";

type ColorKey =
  | "md_h1_dark" | "md_h1_light"
  | "md_h2_dark" | "md_h2_light"
  | "md_h3_dark" | "md_h3_light"
  | "md_h4_dark" | "md_h4_light"
  | "md_h5_dark" | "md_h5_light"
  | "md_h6_dark" | "md_h6_light"
  | "md_bold_dark" | "md_bold_light";

function ColorInput({ value, onCommit, label }: { value: string; onCommit: (value: string) => void; label: string }) {
  return (
    <label
      className="relative block h-6 rounded-control border border-strong cursor-pointer overflow-hidden transition-transform hover:scale-105"
      style={{ backgroundColor: value }}
      title={`${label} ${value}`}
    >
      <input
        type="color"
        value={value}
        aria-label={label}
        onChange={(e) => onCommit(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
    </label>
  );
}

export default function NoteColors() {
  const { t } = useT();
  const { values, set } = useSettings();

  const rows: { label: string; dark: ColorKey; light: ColorKey }[] = [
    { label: t["settings.heading1"], dark: "md_h1_dark", light: "md_h1_light" },
    { label: t["settings.heading2"], dark: "md_h2_dark", light: "md_h2_light" },
    { label: t["settings.heading3"], dark: "md_h3_dark", light: "md_h3_light" },
    { label: t["settings.heading4"], dark: "md_h4_dark", light: "md_h4_light" },
    { label: t["settings.heading5"], dark: "md_h5_dark", light: "md_h5_light" },
    { label: t["settings.heading6"], dark: "md_h6_dark", light: "md_h6_light" },
    { label: t["settings.boldText"], dark: "md_bold_dark", light: "md_bold_light" },
  ];

  return (
    <div className="px-4 py-3 bg-surface/50 rounded-control border border-line/50">
      <div className="text-body font-medium text-secondary">{t["settings.noteTextColors"]}</div>
      <p className="text-caption text-muted mt-0.5 mb-3">{t["settings.noteTextColorsDesc"]}</p>

      <div className="grid grid-cols-[1fr_56px_56px] items-center gap-x-3 gap-y-2">
        <span />
        <span className="text-meta text-muted text-center">{t["settings.modeDark"]}</span>
        <span className="text-meta text-muted text-center">{t["settings.modeLight"]}</span>

        {rows.map((row) => (
          <div key={row.dark} className="contents">
            <span className="text-caption text-tertiary">{row.label}</span>
            <ColorInput
              value={String(values[row.dark])}
              label={`${row.label} ${t["settings.modeDark"]}`}
              onCommit={(v) => set(row.dark as SettingKey, v)}
            />
            <ColorInput
              value={String(values[row.light])}
              label={`${row.label} ${t["settings.modeLight"]}`}
              onCommit={(v) => set(row.light as SettingKey, v)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
