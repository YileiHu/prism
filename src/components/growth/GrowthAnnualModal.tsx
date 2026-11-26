import { useEffect, useState } from "react";
import Modal from "../Modal";
import Button from "../Button";
import Input, { Textarea } from "../Input";
import { useElementSize } from "../useElementSize";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import type { GrowthAnnualNote } from "../../shared/models";

/** Numbers the page can show without the user typing anything. */
export interface AnnualStats {
  /** Last scored month of the year. */
  score: number | null;
  /** Change across the year's scored months. */
  delta: number | null;
  seasons: number;
  artifacts: number;
  /** Level increases recorded inside the year. */
  upgrades: number;
  /** Up to three artifact titles, newest first. */
  highlights: string[];
}

interface Props {
  open: boolean;
  /** Existing page for the opened year; null means a blank one. */
  note: GrowthAnnualNote | null;
  year: number;
  stats?: AnnualStats | null;
  onClose: () => void;
  onSaved: () => void;
}

/** One page per year: the only place where the chronicle is written. */
export default function GrowthAnnualModal({
  open,
  note,
  year,
  stats = null,
  onClose,
  onSaved,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [summary, setSummary] = useState("");
  const [kept, setKept] = useState("");
  const [dropped, setDropped] = useState("");
  const [milestones, setMilestones] = useState<string[]>(["", "", ""]);
  const [nextFocus, setNextFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [bodyRef, { width }] = useElementSize<HTMLDivElement>();
  const wide = width >= 820;
  const twoColumn = wide && stats !== null;

  useEffect(() => {
    if (!open) return;
    setSummary(note?.summary ?? "");
    setKept(note?.kept ?? "");
    setDropped(note?.dropped ?? "");
    setMilestones([0, 1, 2].map((index) => note?.milestones[index] ?? ""));
    setNextFocus(note?.nextFocus ?? "");
    setBusy(false);
  }, [open, note, year]);

  const save = async () => {
    if (busy) return;
    const empty =
      !summary.trim() &&
      !kept.trim() &&
      !dropped.trim() &&
      !nextFocus.trim() &&
      milestones.every((item) => !item.trim());
    // An untouched new page should not create an empty card or a year option.
    if (!note && empty) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await window.prism.saveGrowthAnnualNote({
        year,
        summary,
        kept,
        dropped,
        milestones,
        nextFocus,
      });
      onSaved();
      onClose();
    } catch {
      showToast(t["common.actionFailed"], "error");
    } finally {
      setBusy(false);
    }
  };

  const statsBlock = stats ? (
    <div className="flex-1 rounded-control border border-strong/40 bg-elevated/30 px-3 py-2">
      <span className="block text-caption text-faint">{t["growth.chronicle.stats"]}</span>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-caption tabular-nums text-secondary">
        <span>
          <span className="text-faint">{t["growth.chronicle.statsScore"]} </span>
          {stats.score === null ? "—" : Math.round(stats.score)}
          {stats.delta !== null && (
            <span className="ml-1 text-faint">
              ({stats.delta >= 0 ? "+" : ""}
              {stats.delta.toFixed(1)})
            </span>
          )}
        </span>
        <span>
          <span className="text-faint">{t["growth.chronicle.statsSeasons"]} </span>
          {stats.seasons}
        </span>
        <span>
          <span className="text-faint">{t["growth.chronicle.statsArtifacts"]} </span>
          {stats.artifacts}
        </span>
        <span>
          <span className="text-faint">{t["growth.chronicle.statsUpgrades"]} </span>
          {stats.upgrades}
        </span>
      </div>
      {stats.highlights.length > 0 && (
        <p className="mt-1 truncate text-caption text-faint">
          {t["growth.chronicle.statsHighlights"]} {stats.highlights.join(" · ")}
        </p>
      )}
    </div>
  ) : null;

  const fields = (
    <>
      <label className="flex min-h-0 flex-[2] flex-col space-y-1">
        <span className="block text-caption text-muted">{t["growth.chronicle.summary"]}</span>
        <Textarea
          className="w-full min-h-[22vh] flex-1"
          rows={6}
          autoFocus
          value={summary}
          placeholder={t["growth.chronicle.summaryPlaceholder"]}
          onChange={(event) => setSummary(event.target.value)}
        />
      </label>

      <div className="space-y-1">
        <span className="block text-caption text-muted">{t["growth.chronicle.milestones"]}</span>
        {[0, 1, 2].map((index) => (
          <Input
            key={index}
            className="w-full"
            value={milestones[index] ?? ""}
            placeholder={t["growth.chronicle.milestonePlaceholder"].replace(
              "{n}",
              String(index + 1),
            )}
            onChange={(event) =>
              setMilestones((previous) => {
                const next = [...previous];
                next[index] = event.target.value;
                return next;
              })
            }
          />
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
        <label className="flex min-h-0 flex-col space-y-1">
          <span className="block text-caption text-muted">{t["growth.chronicle.kept"]}</span>
          <Textarea
            className="w-full min-h-[16vh] flex-1"
            rows={4}
            value={kept}
            onChange={(event) => setKept(event.target.value)}
          />
        </label>
        <label className="flex min-h-0 flex-col space-y-1">
          <span className="block text-caption text-muted">{t["growth.chronicle.dropped"]}</span>
          <Textarea
            className="w-full min-h-[16vh] flex-1"
            rows={4}
            value={dropped}
            onChange={(event) => setDropped(event.target.value)}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="block text-caption text-muted">{t["growth.chronicle.nextFocus"]}</span>
        <Input
          className="w-full"
          value={nextFocus}
          placeholder={t["growth.chronicle.nextFocusPlaceholder"]}
          onChange={(event) => setNextFocus(event.target.value)}
        />
      </label>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${year} · ${t["growth.chronicle.annual"]}`}
      layout="document"
      position="center"
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["growth.cancel"]}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => void save()}
          >
            {t["growth.save"]}
          </Button>
        </>
      }
    >
      <div
        ref={bodyRef}
        className={`w-full ${wide ? "flex h-full min-h-0 flex-col" : ""}`}
      >
        {twoColumn ? (
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] grid-cols-[280px_minmax(0,1fr)] gap-6">
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
              {statsBlock}
            </div>
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
              {fields}
            </div>
          </div>
        ) : wide ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {statsBlock}
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
              {fields}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {statsBlock}
            {fields}
          </div>
        )}
      </div>
    </Modal>
  );
}
