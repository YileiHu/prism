import { useEffect, useMemo, useState } from "react";
import { FileText, Frame, Lock } from "lucide-react";
import Modal from "../Modal";
import Button from "../Button";
import Input from "../Input";
import SelectButton from "../SelectButton";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useVaultLock } from "../../lib/vaultLock";
import { normalizePath } from "../../lib/paths";
import { createCanvasDoc, serializeCanvas } from "../../lib/canvas/model";
import { notifyCanvasChanged } from "../../lib/canvas/events";
import type { VaultEntry } from "../../types";
import type { GtdProject } from "./types";
import type { GtdProjectLink, GtdProjectLinkKind } from "../../shared/models";

interface Props {
  open: boolean;
  kind: GtdProjectLinkKind;
  project: GtdProject;
  vaults: VaultEntry[];
  defaultVaultPath: string;
  onClose: () => void;
  onCreated: (link: GtdProjectLink) => void;
}

export default function GtdProjectDocCreateModal({
  open,
  kind,
  project,
  vaults,
  defaultVaultPath,
  onClose,
  onCreated,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const vaultLock = useVaultLock();
  const [title, setTitle] = useState("");
  const [vaultPath, setVaultPath] = useState("");
  const [busy, setBusy] = useState(false);

  const fallbackVault = useMemo(
    () => vaults.find((vault) => normalizePath(vault.path) === normalizePath(defaultVaultPath))
      ?? vaults[0],
    [defaultVaultPath, vaults],
  );
  const locked = vaultPath ? vaultLock.isLocked(vaultPath) : false;

  useEffect(() => {
    if (!open) return;
    setTitle(
      kind === "note"
        ? t["gtd.projectDoc.defaultNoteTitle"].replace("{project}", project.title)
        : t["gtd.projectDoc.defaultCanvasTitle"].replace("{project}", project.title),
    );
    setVaultPath(fallbackVault?.path ?? "");
    setBusy(false);
  }, [fallbackVault, kind, open, project.title, t]);

  const submit = async () => {
    const clean = title.trim();
    if (!clean || !vaultPath || busy || locked) return;
    setBusy(true);
    try {
      let linked: GtdProjectLink;
      if (kind === "note") {
        const note = await window.prism.createNote(vaultPath, clean);
        linked = await window.prism.setGtdProjectLink(project.id, "note", note.path, note.title);
      } else {
        const file = await window.prism.createCanvas(
          vaultPath,
          clean,
          serializeCanvas(createCanvasDoc()),
        );
        notifyCanvasChanged(vaultPath, { created: file.path });
        linked = await window.prism.setGtdProjectLink(project.id, "canvas", file.path, file.title);
      }
      window.dispatchEvent(new Event("gtd-project-links-changed"));
      onCreated(linked);
      onClose();
    } catch {
      showToast(t["common.saveFailed"], "error");
    } finally {
      setBusy(false);
    }
  };

  const vaultOptions = vaults.map((vault) => ({ value: vault.path, label: vault.name }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t[kind === "note" ? "gtd.projectDoc.newNote" : "gtd.projectDoc.newCanvas"]}
      icon={kind === "note" ? FileText : Frame}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["resources.cancel"]}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!title.trim() || !vaultPath || locked || busy}
            onClick={() => { void submit(); }}
          >
            {t["resources.save"]}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="field-label mb-1.5">{t["gtd.projectDoc.name"]}</label>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={t["gtd.projectDoc.namePlaceholder"]}
            autoFocus
            className="w-full"
          />
        </div>

        <div>
          <label className="field-label mb-1.5">{t["gtd.projectDoc.vault"]}</label>
          {vaults.length > 1 ? (
            <SelectButton
              value={vaultPath}
              options={vaultOptions}
              onChange={setVaultPath}
              className="w-full"
            />
          ) : (
            <div className="field-inset rounded-control border px-3 py-2 text-body text-secondary">
              {fallbackVault?.name ?? t["settings.projectVaultNone"]}
            </div>
          )}
        </div>

        {locked && (
          <div className="field-inset flex items-center gap-2 rounded-control border px-3 py-2">
            <Lock size={14} className="text-muted" />
            <span className="flex-1 text-body text-secondary">{t["gtd.projectDoc.locked"]}</span>
            <Button
              variant="secondary"
              size="xs"
              onClick={() => vaultLock.requestUnlock(vaultPath)}
            >
              {t["gtd.projectDoc.unlock"]}
            </Button>
          </div>
        )}

        <p className="text-caption text-muted">{t["gtd.projectDoc.createHint"]}</p>
      </div>
    </Modal>
  );
}
