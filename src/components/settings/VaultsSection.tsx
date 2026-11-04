import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, FolderOpen } from "lucide-react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useSettings } from "../../lib/settings";
import Button from "../Button";
import ConfirmDialog from "../ConfirmDialog";
import Input from "../Input";
import EmptyState from "../EmptyState";
import { SkeletonRows } from "../Skeleton";
import { type VaultEntry } from "../../types";
import { VaultIcon } from "../../lib/vaultIcons";
import { Select, SettingBlock, TextField } from "./controls";

interface Props {
  onSaved: () => void;
}

export default function VaultsSection({ onSaved }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const { values, set } = useSettings();
  const [vaults, setVaults] = useState<VaultEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [addError, setAddError] = useState("");
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);
  const [defaultNotesDir, setDefaultNotesDir] = useState("");
  const [imagePathStyle, setImagePathStyle] = useState("note");

  useEffect(() => {
    void (async () => {
      const rawVaults = await window.prism.getSetting("vault_paths");
      if (rawVaults) {
        try { setVaults(JSON.parse(rawVaults)); } catch { setVaults([]); }
      }
      setDefaultNotesDir((await window.prism.getSetting("default_notes_dir")) ?? "");
      const style = await window.prism.getSetting("image_path_style");
      if (style) setImagePathStyle(style);
    })().finally(() => setLoaded(true));
  }, []);

  // The sidebar can change a vault's icon; re-read so saving here never
  // writes back a stale list.
  useEffect(() => {
    const reload = () => {
      void (async () => {
        const raw = await window.prism.getSetting("vault_paths");
        try { setVaults(raw ? JSON.parse(raw) as VaultEntry[] : []); } catch { /* ignore */ }
      })();
    };
    window.addEventListener("vaults-changed", reload);
    return () => window.removeEventListener("vaults-changed", reload);
  }, []);

  const saveVaults = useCallback(async (updated: VaultEntry[]) => {
    await window.prism.setSetting("vault_paths", JSON.stringify(updated));
    setVaults(updated);
    window.dispatchEvent(new CustomEvent("vaults-changed"));
    onSaved();
  }, [onSaved]);

  const normalizePath = (p: string) => p.trim().replace(/[\\/]+$/, "");

  const handleAddVault = async () => {
    const name = newName.trim();
    const normalizedPath = normalizePath(newPath);
    if (!name || !normalizedPath) return;
    if (vaults.some((v) => normalizePath(v.path).toLowerCase() === normalizedPath.toLowerCase())) {
      setAddError(t["settings.vaultExists"]);
      return;
    }
    setAddError("");
    try {
      await saveVaults([...vaults, { name, path: normalizedPath }]);
    } catch {
      showToast(t["settings.vaultAddFailed"], "error");
      return;
    }
    setNewName("");
    setNewPath("");
  };

  const handleRemoveVault = async (index: number) => {
    const removed = vaults[index];
    try {
      await saveVaults(vaults.filter((_, i) => i !== index));
      if (removed) {
        const last = await window.prism.getSetting("last_vault_path");
        if (last === removed.path) await window.prism.setSetting("last_vault_path", "");
      }
    } catch {
      showToast(t["settings.vaultRemoveFailed"], "error");
    }
  };

  const handleSelectDir = async () => {
    const dir = await window.prism.selectDirectory();
    if (dir) setNewPath(dir);
  };

  const saveRaw = async (key: string, value: string) => {
    await window.prism.setSetting(key, value);
    onSaved();
  };

  return (
    <section>
      <div className="space-y-2 mb-4">
        {!loaded && <SkeletonRows count={2} />}
        {loaded && vaults.length === 0 && <EmptyState size="card" text={t["settings.noVaults"]} />}
        {vaults.map((v, i) => (
          <div key={v.path} className="flex items-center gap-3 p-3 bg-surface rounded-control border border-line/50">
            <VaultIcon name={v.icon} size={16} className="text-warning flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-body text-primary font-medium truncate">{v.name}</div>
              <div className="text-caption text-muted truncate">{v.path}</div>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setRemovingIndex(i)} className="hover:text-danger">
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
      </div>

      <div className="p-4 bg-surface rounded-control border border-line/50 mb-4 space-y-3">
        <p className="text-caption text-tertiary font-medium">{t["settings.addVault"]}</p>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t["settings.vaultNamePlaceholder"]}
            className="w-44"
          />
          <div className="flex-1 flex gap-2">
            <Input
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder={t["settings.vaultPath"]}
              className="flex-1"
            />
            <Button variant="ghost" size="icon-md" onClick={handleSelectDir}>
              <FolderOpen size={16} />
            </Button>
          </div>
          <Button variant="primary" size="sm" onClick={handleAddVault} disabled={!newName.trim() || !newPath.trim()}>
            <Plus size={16} />
            {t["settings.addVault"]}
          </Button>
        </div>
        {addError && <p className="text-caption text-danger">{addError}</p>}
      </div>

      <div className="space-y-3">
        <SettingBlock label={t["settings.defaultNotesDir"]} description={t["settings.defaultNotesDirDesc"]}>
          <TextField
            value={defaultNotesDir}
            onCommit={(v) => { setDefaultNotesDir(v); void saveRaw("default_notes_dir", v); }}
            placeholder={t["settings.defaultNotesDirPlaceholder"]}
          />
        </SettingBlock>

        <SettingBlock label={t["settings.imagePathStyle"]} description={t["settings.imagePathStyleDesc"]}>
          <Select
            value={imagePathStyle}
            options={[
              { value: "note", label: t["settings.imagePathStyleNote"] },
              { value: "vault", label: t["settings.imagePathStyleVault"] },
              { value: "name", label: t["settings.imagePathStyleName"] },
            ]}
            onChange={(v) => { setImagePathStyle(v); void saveRaw("image_path_style", v); }}
            className="w-64"
          />
        </SettingBlock>

        <SettingBlock label={t["settings.attachmentsDir"]} description={t["settings.attachmentsDirDesc"]}>
          <TextField
            value={values.attachments_dir}
            onCommit={(v) => set("attachments_dir", v.trim() || "attachments")}
            placeholder={t["settings.attachmentsDirPlaceholder"]}
            mono
          />
        </SettingBlock>
      </div>

      <ConfirmDialog
        open={removingIndex !== null}
        message={t["settings.removeVaultConfirm"].replace(
          "{name}",
          vaults[removingIndex ?? -1]?.name ?? "",
        )}
        confirmLabel={t["settings.removeVault"]}
        onConfirm={async () => {
          if (removingIndex !== null) await handleRemoveVault(removingIndex);
        }}
        onClose={() => setRemovingIndex(null)}
      />
    </section>
  );
}
