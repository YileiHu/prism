import { useEffect, useState } from "react";
import Modal from "../Modal";
import Button from "../Button";
import ConfirmDialog from "../ConfirmDialog";
import Input, { Textarea } from "../Input";
import DateField from "../DateField";
import GrowthImageField from "./GrowthImageField";
import GrowthThemeSwatches from "./GrowthThemeSwatches";
import useGrowthCoverDraft from "./useGrowthCoverDraft";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { addDays, dateKey } from "../../lib/dates";
import { type TagColorKey } from "../../lib/colors";
import type { GrowthCoverTransform, GrowthSeason } from "../../shared/models";

interface Props {
  open: boolean;
  /** null = create */
  season: GrowthSeason | null;
  onClose: () => void;
  onSaved: () => void;
}

/** 12 weeks by default — shorter than a year, longer than a week. */
const SEASON_DAYS = 83;

/**
 * One dialog for both creating and editing a season (`season === null` means
 * create). Settlement is a separate action in `GrowthSeasonCloseModal`.
 */
export default function GrowthSeasonModal({ open, season, onClose, onSaved }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [title, setTitle] = useState("");
  const [focus, setFocus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [theme, setTheme] = useState<TagColorKey>("violet");
  const [coverTransform, setCoverTransform] = useState<GrowthCoverTransform | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const {
    cover,
    setCover,
    pick,
    commitAfterSave,
    discardOnCancel,
  } = useGrowthCoverDraft({
    open,
    initialCover: season?.cover ?? "",
    pickTitle: t["growth.coverDialogTitle"],
  });

  useEffect(() => {
    if (!open) return;
    setCoverTransform(season?.coverTransform ?? null);
    setConfirmDelete(false);
    setDeleting(false);
    if (season) {
      setTitle(season.title);
      setFocus(season.focus);
      setStartDate(season.startDate);
      setEndDate(season.endDate);
      setTheme((season.theme as TagColorKey) ?? "violet");
    } else {
      setTitle("");
      setFocus("");
      setStartDate(dateKey(new Date()));
      setEndDate(dateKey(addDays(new Date(), SEASON_DAYS)));
      setTheme("violet");
    }
  }, [open, season]);

  const close = () => {
    discardOnCancel();
    onClose();
  };

  const save = async () => {
    if (busy) return;
    const clean = title.trim();
    if (!clean) return;
    setBusy(true);
    try {
      if (season) {
        await window.prism.updateGrowthSeason(season.id, {
          title: clean,
          focus,
          startDate,
          endDate,
          theme,
          cover,
          coverTransform: cover ? coverTransform : null,
        });
      } else {
        await window.prism.createGrowthSeason({
          title: clean,
          focus,
          startDate,
          endDate,
          theme,
          cover,
          coverTransform: cover ? coverTransform : null,
        });
      }
      // The row now points at `cover`: drop every file this session replaced.
      commitAfterSave(cover);
      onSaved();
      onClose();
    } catch {
      showToast(t["common.actionFailed"], "error");
    } finally {
      setBusy(false);
    }
  };

  const deleteSeason = async () => {
    if (!season || deleting) return;
    setDeleting(true);
    try {
      await window.prism.deleteGrowthSeason(season.id);
      setConfirmDelete(false);
      onSaved();
      close();
    } catch {
      showToast(t["common.deleteFailed"], "error");
      throw new Error("delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
    <Modal
      open={open}
      onClose={close}
      title={season ? t["growth.editSeason"] : t["growth.newSeason"]}
      size="lg"
      position="center"
      footer={
        <>
          {season && (
            <Button
              variant="ghost-danger"
              size="sm"
              className="mr-auto"
              disabled={busy || deleting}
              onClick={() => setConfirmDelete(true)}
            >
              {t["growth.deleteSeason"]}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={close}>
            {t["growth.cancel"]}
          </Button>
          <Button variant="primary" size="sm" disabled={busy || !title.trim()} onClick={() => void save()}>
            {t["growth.save"]}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.seasonTitle"]}</span>
          <Input
            className="w-full"
            autoFocus
            value={title}
            placeholder={t["growth.seasonTitlePlaceholder"]}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0 space-y-1">
            <span className="block text-caption text-muted">{t["growth.seasonStart"]}</span>
            <DateField className="w-full" value={startDate} onChange={setStartDate} />
          </label>
          <label className="block min-w-0 space-y-1">
            <span className="block text-caption text-muted">{t["growth.seasonEnd"]}</span>
            <DateField className="w-full" value={endDate} onChange={setEndDate} />
          </label>
        </div>

        <div className="space-y-1">
          <span className="block text-caption text-muted">{t["growth.seasonTheme"]}</span>
          <GrowthThemeSwatches value={theme} onChange={setTheme} />
        </div>

        <div className="space-y-1">
          <span className="block text-caption text-muted">{t["growth.seasonCover"]}</span>
          <GrowthImageField
            value={cover}
            onChange={setCover}
            pick={pick}
            dialogTitle={t["growth.coverDialogTitle"]}
            pickLabel={t["growth.seasonCoverPick"]}
            changeLabel={t["growth.seasonCoverChange"]}
            removeLabel={t["growth.seasonCoverRemove"]}
            ratio="poster"
            crop
            transform={coverTransform}
            onTransformChange={setCoverTransform}
          />
        </div>

        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.seasonFocus"]}</span>
          <Textarea
            className="w-full"
            rows={2}
            value={focus}
            placeholder={t["growth.seasonFocusPlaceholder"]}
            onChange={(event) => setFocus(event.target.value)}
          />
        </label>
      </div>
    </Modal>
    <ConfirmDialog
      open={confirmDelete}
      message={t["growth.deleteSeasonConfirm"]}
      confirmLabel={t["growth.delete"]}
      onConfirm={deleteSeason}
      onClose={() => setConfirmDelete(false)}
    />
    </>
  );
}

