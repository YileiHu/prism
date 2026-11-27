import { useT } from "../../i18n";
import { useSettings } from "../../lib/settings";
import { useTheme } from "../../theme/ThemeProvider";
import { themes } from "../../shared/themes";
import { themeAccentFill } from "../../lib/themePreview";
import { SectionHeader, Select, SettingRow, Slider, Toggle } from "./controls";
import NoteColors from "./NoteColors";
import { Check } from "lucide-react";

export default function AppearanceSection() {
  const { t } = useT();
  const { values, set } = useSettings();
  const { themeId, setTheme, mode, setMode, resolvedMode, pinned } = useTheme();

  const pinnedHint = t[resolvedMode === "dark" ? "settings.themeLockedDark" : "settings.themeLockedLight"];

  return (
    <section>
      <SectionHeader title={t["settings.appearance"]} description={t["settings.appearanceDesc"]} />

      <div className="space-y-3 mb-6">
        <SettingRow
          label={t["settings.colorMode"]}
          description={pinned ? pinnedHint : t["settings.colorModeDesc"]}
        >
          <Select
            value={pinned ? resolvedMode : mode}
            disabled={pinned}
            options={[
              { value: "dark", label: t["settings.modeDark"] },
              { value: "light", label: t["settings.modeLight"] },
              { value: "system", label: t["settings.modeSystem"] },
            ]}
            onChange={(v) => setMode(v as "dark" | "light" | "system")}
          />
        </SettingRow>
      </div>

      <p className="text-caption text-tertiary font-medium mb-2">{t["settings.themeGrid"]}</p>
      <div className="mb-6 grid grid-cols-3 gap-2">
        {themes.map((th) => {
          const onlyMode = th.modes.length === 1 ? th.modes[0] : null;
          const active = themeId === th.id;
          const hint = onlyMode
            ? ` · ${t[onlyMode === "dark" ? "settings.themeDarkOnly" : "settings.themeLightOnly"]}`
            : "";
          return (
            <button
              key={th.id}
              onClick={() => setTheme(th.id)}
              title={`${th.name} · ${th.nameEn}${hint}`}
              aria-label={`${th.name} · ${th.nameEn}${hint}`}
              className={`rounded-card border p-2 text-left transition-all ${
                active
                  ? "accent-ring border-[var(--accent)] bg-[var(--accent-muted)]"
                  : "border-line bg-surface hover:border-strong"
              }`}
            >
              <div
                className="h-6 w-full rounded-chip border border-strong/50"
                style={{ background: themeAccentFill(th) }}
              />
              <div className="mt-1.5 flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate text-caption font-medium text-primary">
                  {th.name}
                </span>
                {active && <Check size={12} className="flex-shrink-0 text-[var(--accent-text)]" />}
              </div>
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        <SettingRow label={t["settings.fontSize"]} description={t["settings.fontSizeDesc"]}>
          <Slider
            value={values.content_font_size}
            min={12}
            max={20}
            step={0.5}
            format={(v) => `${v}px`}
            onChange={(v) => set("content_font_size", v)}
          />
        </SettingRow>

        <SettingRow label={t["settings.lineHeight"]} description={t["settings.lineHeightDesc"]}>
          <Slider
            value={values.content_line_height}
            min={1.4}
            max={2}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => set("content_line_height", v)}
          />
        </SettingRow>

        <SettingRow label={t["settings.contentWidth"]} description={t["settings.contentWidthDesc"]}>
          <Slider
            value={values.content_width}
            min={560}
            max={1000}
            step={20}
            format={(v) => `${v}px`}
            onChange={(v) => set("content_width", v)}
          />
        </SettingRow>

        <SettingRow label={t["settings.showFrontmatter"]} description={t["settings.showFrontmatterDesc"]}>
          <Toggle checked={values.show_frontmatter} onChange={(v) => set("show_frontmatter", v)} />
        </SettingRow>

        <NoteColors />
      </div>
    </section>
  );
}
