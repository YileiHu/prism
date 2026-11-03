import { useEffect, useState } from "react";
import { FolderOpen, RefreshCw } from "lucide-react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useSettings } from "../../lib/settings";
import type { AppSettings } from "../../shared/settings";
import Button from "../Button";
import { SectionHeader, Select, SettingBlock, Slider } from "./controls";

export default function PdfSection() {
  const { t } = useT();
  const showToast = useToast();
  const { values, set } = useSettings();
  const [count, setCount] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const repoPath = values.pdf_repo_path;

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      window.prism.pdfGetState()
        .then((state) => { if (!cancelled) setCount(state.count); })
        .catch(() => { /* ignore */ });
    };
    refresh();
    const off = window.prism.onPdfUpdated(refresh);
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  const handleChoose = async () => {
    const dir = await window.prism.pdfChooseRepo();
    if (!dir) return;
    set("pdf_repo_path", dir);
    setTimeout(() => {
      window.prism.pdfGetState().then((state) => setCount(state.count)).catch(() => { /* ignore */ });
    }, 1200);
  };

  const handleOpen = async () => {
    if (!repoPath) return;
    try {
      await window.prism.pdfOpenRepo(repoPath);
    } catch {
      showToast(t["pdf.openRepoFailed"], "error");
    }
  };

  const handleRescan = async () => {
    if (!repoPath || scanning) return;
    setScanning(true);
    try {
      const result = await window.prism.pdfRescan();
      showToast(
        t["settings.pdfScanResult"]
          .replace("{total}", String(result.total))
          .replace("{changed}", String(result.changed)),
      );
    } catch {
      showToast(t["pdf.rescanFailed"], "error");
    } finally {
      setScanning(false);
    }
  };

  return (
    <section>
      <SectionHeader title={t["settings.catPdf"]} description={t["settings.pdfDesc"]} />

      <SettingBlock label={t["settings.pdfRepo"]} description={t["settings.pdfRepoDesc"]}>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 px-3 py-1.5 rounded-control border border-line/50 bg-base/50 text-body font-mono truncate text-secondary">
            {repoPath || <span className="text-faint">{t["settings.pdfNoRepo"]}</span>}
          </div>
          <Button variant="secondary" size="sm" onClick={handleChoose}>
            <FolderOpen size={14} />
            {t["settings.pdfChooseRepo"]}
          </Button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Button variant="ghost" size="sm" onClick={handleOpen} disabled={!repoPath}>
            <FolderOpen size={14} />
            {t["settings.pdfOpenRepo"]}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleRescan} disabled={!repoPath || scanning}>
            <RefreshCw size={14} className={scanning ? "animate-spin" : ""} />
            {t["settings.pdfRescan"]}
          </Button>
          <span className="text-caption text-muted ml-auto">
            {scanning
              ? t["settings.pdfScanning"]
              : count !== null
                ? t["settings.pdfIndexed"].replace("{count}", String(count))
                : ""}
          </span>
        </div>
      </SettingBlock>

      <div className="mt-3">
        <SettingBlock label={t["settings.pdfDefaultSort"]} description={t["settings.pdfDefaultSortDesc"]}>
          <Select
            value={values.pdf_default_sort}
            options={[
              { value: "title", label: t["pdf.sortTitle"] },
              { value: "added", label: t["pdf.sortAdded"] },
              { value: "modified", label: t["pdf.sortModified"] },
              { value: "pages", label: t["pdf.sortPages"] },
            ]}
            onChange={(v) => set("pdf_default_sort", v as AppSettings["pdf_default_sort"])}
            className="w-48"
          />
        </SettingBlock>
      </div>

      <div className="mt-3">
        <SettingBlock label={t["settings.pdfDefaultZoom"]} description={t["settings.pdfDefaultZoomDesc"]}>
          <Slider
            value={values.pdf_default_zoom}
            min={10}
            max={200}
            step={10}
            format={(v) => `${v}%`}
            onChange={(v) => set("pdf_default_zoom", v)}
          />
        </SettingBlock>
      </div>
    </section>
  );
}
