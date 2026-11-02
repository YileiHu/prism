import { useT, langOptions } from "../../i18n";
import { useSettings } from "../../lib/settings";
import { NumberInput, SectionHeader, Select, SettingRow, Toggle } from "./controls";

export default function GeneralSection() {
  const { t, lang, setLang } = useT();
  const { values, set } = useSettings();

  return (
    <section>
      <SectionHeader title={t["settings.general"]} description={t["settings.generalDesc"]} />

      <div className="space-y-3">
        <SettingRow label={t["settings.language"]} description={t["settings.languageDesc"]}>
          <Select
            value={lang}
            options={langOptions.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => setLang(v as typeof lang)}
          />
        </SettingRow>

        <SettingRow label={t["settings.clockFormat"]} description={t["settings.clockFormatDesc"]}>
          <Select
            value={values.clock_format}
            options={[
              { value: "24", label: t["settings.clock24"] },
              { value: "12", label: t["settings.clock12"] },
            ]}
            onChange={(v) => set("clock_format", v as "24" | "12")}
          />
        </SettingRow>

        <SettingRow label={t["settings.homeRecents"]} description={t["settings.homeRecentsDesc"]}>
          <NumberInput
            value={values.home_recents_count}
            min={5}
            max={30}
            step={1}
            onChange={(v) => set("home_recents_count", v)}
          />
        </SettingRow>

        <SettingRow label={t["settings.restoreTabs"]} description={t["settings.restoreTabsDesc"]}>
          <Toggle checked={values.restore_note_tabs} onChange={(v) => set("restore_note_tabs", v)} />
        </SettingRow>
      </div>
    </section>
  );
}
