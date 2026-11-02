import { useT } from "../../i18n";
import { useSettings } from "../../lib/settings";
import { useTheme } from "../../theme/ThemeProvider";
import { themes } from "../../theme/themes";
import { SectionHeader, Select, SettingRow, Slider, Toggle } from "./controls";
import NoteColors from "./NoteColors";

export default function AppearanceSection() {
  const { t } = useT();
  const { values, set } = useSettings();
  const { themeId, setTheme, mode, setMode, resolvedMode } = useTheme();

  return (
    <section>
      <SectionHeader title={t["settings.appearance"]} description={t["settings.appearanceDesc"]} />

      <div className="space-y-3 mb-6">
        <SettingRow label={t["settings.colorMode"]} description={t["settings.colorModeDesc"]}>
          <Select
            value={mode}
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
      <div className="grid grid-cols-2 gap-3 mb-6">
        {themes.map((th) => {
          const variant = resolvedMode === "dark" ? th.dark : th.light;
          const swatches = [variant.primaryHover, th.primary, variant.primaryText, variant.primaryBorder];
          return (
            <button
              key={th.id}
              onClick={() => setTheme(th.id)}
              className={`p-4 rounded-card border transition-all text-left ${
                themeId === th.id
                  ? "border-[var(--accent)] bg-[var(--accent-muted)]"
                  : "border-line bg-surface/50 hover:border-strong"
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-8 h-8 rounded-full border-2 border-strong flex-shrink-0"
                  style={{ backgroundColor: th.primary }}
                />
                <div>
                  <div className="text-body font-medium text-primary">{th.name}</div>
                  <div className="text-caption text-muted">{th.nameEn}</div>
                </div>
                {themeId === th.id && (
                  <div className="ml-auto w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: th.primary }} />
                )}
              </div>
              <div className="flex gap-1">
                {swatches.map((c, i) => (
                  <div key={i} className="flex-1 h-2 rounded-chip" style={{ backgroundColor: c }} />
                ))}
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
