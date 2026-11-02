import { useT } from "../../i18n";
import { useSettings } from "../../lib/settings";
import { SectionHeader, Select, SettingRow, Slider, Toggle } from "./controls";

export default function EditorSection() {
  const { t } = useT();
  const { values, set } = useSettings();

  return (
    <section>
      <SectionHeader title={t["settings.catEditor"]} description={t["settings.editorDesc"]} />

      <div className="space-y-3">
        <SettingRow label={t["settings.autosaveDelay"]} description={t["settings.autosaveDelayDesc"]}>
          <Slider
            value={values.autosave_delay}
            min={300}
            max={3000}
            step={100}
            format={(v) => `${v} ms`}
            onChange={(v) => set("autosave_delay", v)}
          />
        </SettingRow>

        <SettingRow label={t["settings.defaultView"]} description={t["settings.defaultViewDesc"]}>
          <Select
            value={values.default_view}
            options={[
              { value: "read", label: t["settings.viewRead"] },
              { value: "edit", label: t["settings.viewEdit"] },
            ]}
            onChange={(v) => set("default_view", v as "read" | "edit")}
          />
        </SettingRow>

        <SettingRow label={t["settings.indentWidth"]} description={t["settings.indentWidthDesc"]}>
          <Select
            value={String(values.indent_width)}
            options={[
              { value: "2", label: t["settings.indent2"] },
              { value: "4", label: t["settings.indent4"] },
            ]}
            onChange={(v) => set("indent_width", Number(v))}
          />
        </SettingRow>

        <SettingRow label={t["settings.lineWrapping"]} description={t["settings.lineWrappingDesc"]}>
          <Toggle checked={values.line_wrapping} onChange={(v) => set("line_wrapping", v)} />
        </SettingRow>
      </div>
    </section>
  );
}
