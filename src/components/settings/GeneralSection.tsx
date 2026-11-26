import { useEffect, useState } from "react";
import { useT, langOptions } from "../../i18n";
import { useSettings } from "../../lib/settings";
import { useToast } from "../../lib/toast";
import Button from "../Button";
import Modal from "../Modal";
import type {
  AppLaunchState,
  GrowthBackupPreview,
} from "../../shared/models";
import type { CloseBehavior } from "../../shared/settings";
import { SectionHeader, Select, SettingRow, Toggle } from "./controls";

export default function GeneralSection() {
  const { t, lang, setLang } = useT();
  const { values, set } = useSettings();
  const showToast = useToast();
  // Capabilities of the running build: login items are only written by packaged
  // builds, and hidden login startup is Windows-only. Unknown → keep the rows
  // enabled (the hints are optional polish).
  const [launch, setLaunch] = useState<AppLaunchState | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<GrowthBackupPreview | null>(null);

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

  const exportGrowth = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await window.prism.exportGrowthData(t["settings.growthExport"]);
      if (!result.canceled) {
        showToast(t["settings.growthExportDone"].replace("{name}", result.fileName ?? ""), "success");
      }
    } catch {
      showToast(t["settings.growthExportFailed"], "error");
    } finally {
      setExporting(false);
    }
  };

  const pickGrowthImport = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const next = await window.prism.previewGrowthImport(t["settings.growthImport"]);
      if (next) setPreview(next);
    } catch {
      showToast(t["settings.growthImportFailed"], "error");
    } finally {
      setImporting(false);
    }
  };

  const confirmGrowthImport = async () => {
    if (!preview || importing) return;
    setImporting(true);
    try {
      const result = await window.prism.commitGrowthImport(preview.token);
      const total = Object.values(result.counts).reduce((sum, value) => sum + value, 0);
      window.dispatchEvent(new CustomEvent("growth-changed"));
      showToast(t["settings.growthImportDone"].replace("{count}", String(total)), "success");
      setPreview(null);
    } catch {
      showToast(t["settings.growthImportFailed"], "error");
    } finally {
      setImporting(false);
    }
  };

  const previewCounts: Array<[string, string]> = preview
    ? [
        [t["settings.growthCountDomains"], String(preview.counts.domains)],
        [t["settings.growthCountCapabilities"], String(preview.counts.capabilities)],
        [t["settings.growthCountEvidence"], String(preview.counts.evidence)],
        [t["settings.growthCountSnapshots"], String(preview.counts.snapshots)],
        [t["settings.growthCountSeasons"], String(preview.counts.seasons)],
        [t["settings.growthCountChallenges"], String(preview.counts.challenges)],
        [t["settings.growthCountArtifacts"], String(preview.counts.artifacts)],
        [t["settings.growthCountTasks"], String(preview.counts.tasks)],
        [t["settings.growthCountPredictions"], String(preview.counts.predictions)],
        [t["settings.growthCountSelfModel"], String(preview.counts.selfModel)],
        [t["settings.growthCountFeedback"], String(preview.counts.feedback)],
        [t["settings.growthCountAnnual"], String(preview.counts.annualNotes)],
        [t["settings.growthCountCovers"], String(preview.counts.covers)],
      ]
    : [];

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

      <div className="mt-8 pt-6 border-t border-line/50">
        <SectionHeader
          title={t["settings.growthData"]}
          description={t["settings.growthDataDesc"]}
        />

        <div className="space-y-3">
          <SettingRow
            label={t["settings.growthExport"]}
            description={t["settings.growthExportDesc"]}
          >
            <Button
              variant="secondary"
              size="sm"
              disabled={exporting}
              onClick={() => void exportGrowth()}
            >
              {t["settings.growthExportAction"]}
            </Button>
          </SettingRow>

          <SettingRow
            label={t["settings.growthImport"]}
            description={t["settings.growthImportDesc"]}
          >
            <Button
              variant="secondary"
              size="sm"
              disabled={importing}
              onClick={() => void pickGrowthImport()}
            >
              {t["settings.growthImportAction"]}
            </Button>
          </SettingRow>
        </div>
        <p className="px-4 pt-2 text-caption text-faint">{t["settings.growthDataHint"]}</p>
      </div>

      <Modal
        open={preview !== null}
        onClose={() => { if (!importing) setPreview(null); }}
        position="center"
        title={t["settings.growthImportTitle"]}
        closeOnBackdrop={!importing}
        closeOnEscape={!importing}
        footer={
          <>
            <Button variant="secondary" size="sm" disabled={importing} onClick={() => setPreview(null)}>
              {t["resources.cancel"]}
            </Button>
            <Button
              variant={preview?.hasExistingData ? "danger" : "primary"}
              size="sm"
              disabled={importing}
              onClick={() => void confirmGrowthImport()}
            >
              {preview?.hasExistingData
                ? t["settings.growthImportConfirm"]
                : t["settings.growthImportAction"]}
            </Button>
          </>
        }
      >
        {preview && (
          <div className="space-y-3">
            <p className="text-control text-primary">{preview.fileName}</p>
            <p className="text-caption text-faint">
              {preview.exportedAt.slice(0, 10)}
              {preview.appVersion ? ` · v${preview.appVersion}` : ""}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-control bg-elevated/40 p-3 text-caption">
              {previewCounts.map(([label, value]) => (
                <span key={label} className="flex items-baseline justify-between gap-2">
                  <span className="text-faint">{label}</span>
                  <span className="tabular-nums text-secondary">{value}</span>
                </span>
              ))}
            </div>
            {preview.hasExistingData && (
              <p className="text-caption text-danger">{t["settings.growthImportWarning"]}</p>
            )}
            <p className="text-caption text-faint">{t["settings.growthImportBackup"]}</p>
            <p className="text-caption text-faint">{t["settings.growthImportHint"]}</p>
          </div>
        )}
      </Modal>
    </section>
  );
}
