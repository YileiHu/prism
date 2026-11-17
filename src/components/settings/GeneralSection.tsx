import { useEffect, useState } from "react";
import { useT, langOptions } from "../../i18n";
import { useSettings } from "../../lib/settings";
import type { AppLaunchState } from "../../shared/models";
import type { CloseBehavior } from "../../shared/settings";
import { SectionHeader, Select, SettingRow, Toggle } from "./controls";

export default function GeneralSection() {
  const { t, lang, setLang } = useT();
  const { values, set } = useSettings();
  // Capabilities of the running build: login items are only written by packaged
  // builds, and hidden login startup is Windows-only. Unknown → keep the rows
  // enabled (the hints are optional polish).
  const [launch, setLaunch] = useState<AppLaunchState | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.prism
      .getLaunchState()
      .then((state) => { if (!cancelled) setLaunch(state); })
      .catch(() => { /* hints are optional */ });
    return () => { cancelled = true; };
  }, []);

  const loginItemSupported = launch?.loginItemSupported ?? true;
  const hiddenStartSupported = launch?.hiddenStartSupported ?? true;
  const packaged = launch?.packaged ?? true;

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

        <SettingRow label={t["settings.restoreTabs"]} description={t["settings.restoreTabsDesc"]}>
          <Toggle checked={values.restore_note_tabs} onChange={(v) => set("restore_note_tabs", v)} />
        </SettingRow>
      </div>

      <div className="mt-8 pt-6 border-t border-line/50">
        <SectionHeader
          title={t["settings.windowStartup"]}
          description={t["settings.windowStartupDesc"]}
        />

        <div className="space-y-3">
          <SettingRow
            label={t["settings.closeBehavior"]}
            description={t["settings.closeBehaviorDesc"]}
          >
            <Select
              value={values.close_behavior}
              options={[
                { value: "quit", label: t["settings.closeQuit"] },
                { value: "tray", label: t["settings.closeTray"] },
              ]}
              onChange={(v) => set("close_behavior", v as CloseBehavior)}
            />
          </SettingRow>

          <SettingRow label={t["settings.autoLaunch"]} description={t["settings.autoLaunchDesc"]}>
            <Toggle
              checked={values.auto_launch}
              disabled={!loginItemSupported}
              onChange={(v) => set("auto_launch", v)}
            />
          </SettingRow>
          {launch && !loginItemSupported && (
            <p className="px-4 text-caption text-muted">{t["settings.autoLaunchUnsupported"]}</p>
          )}
          {launch && loginItemSupported && !packaged && (
            <p className="px-4 text-caption text-muted">{t["settings.autoLaunchDevHint"]}</p>
          )}

          <SettingRow
            label={t["settings.autoLaunchHidden"]}
            description={t["settings.autoLaunchHiddenDesc"]}
          >
            <Toggle
              checked={values.auto_launch_hidden}
              disabled={!hiddenStartSupported}
              onChange={(v) => set("auto_launch_hidden", v)}
            />
          </SettingRow>
          {launch && !hiddenStartSupported && (
            <p className="px-4 text-caption text-muted">
              {t["settings.autoLaunchHiddenUnsupported"]}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
