import { useT } from "../../i18n";
import { useSettings } from "../../lib/settings";
import { SectionHeader, SettingRow } from "./controls";
import NumberInput from "../NumberInput";

export default function SearchSection() {
  const { t } = useT();
  const { values, set } = useSettings();

  return (
    <section>
      <SectionHeader title={t["settings.catSearch"]} description={t["settings.searchDesc"]} />

      <div className="space-y-3">
        <SettingRow label={t["settings.searchLimit"]} description={t["settings.searchLimitDesc"]}>
          <NumberInput
            className="w-24 text-primary"
            value={values.search_result_limit}
            min={50}
            max={1000}
            step={50}
            onChange={(v) => v !== null && set("search_result_limit", v)}
          />
        </SettingRow>
      </div>
    </section>
  );
}
