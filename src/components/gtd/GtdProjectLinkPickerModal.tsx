import { useEffect, useMemo, useState } from "react";
import { FileText, Frame, Lock } from "lucide-react";
import Modal from "../Modal";
import Button from "../Button";
import Badge from "../Badge";
import EmptyState from "../EmptyState";
import ItemRow from "../ItemRow";
import { SkeletonRows } from "../Skeleton";
import SearchInput from "../SearchInput";
import SelectButton from "../SelectButton";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useVaultLock } from "../../lib/vaultLock";
import { normalizePath } from "../../lib/paths";
import type { VaultEntry } from "../../types";
import type { GtdProjectLink, GtdProjectLinkKind } from "../../shared/models";

interface Props {
  open: boolean;
  projectId: number;
  kind: GtdProjectLinkKind;
  vaults: VaultEntry[];
  defaultVaultPath: string;
  linkedPaths: string[];
  onClose: () => void;
  onLinked: (link: GtdProjectLink) => void;
}

interface Item {
  path: string;
  title: string;
  meta?: string;
}

export default function GtdProjectLinkPickerModal({
  open,
  projectId,
  kind,
  vaults,
  defaultVaultPath,
  linkedPaths,
  onClose,
  onLinked,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const vaultLock = useVaultLock();
  const [vaultPath, setVaultPath] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const preferred =
      vaults.find((vault) => normalizePath(vault.path) === normalizePath(defaultVaultPath)) ??
      vaults[0];
    setVaultPath(preferred?.path ?? "");
  }, [open, vaults, defaultVaultPath]);

  const locked = vaultPath ? vaultLock.isLocked(vaultPath) : false;

  useEffect(() => {
    if (!open || !vaultPath) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (locked) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const relative = (filePath: string) =>
      filePath.slice(vaultPath.length).replace(/^[\\/]+/, "").replace(/\\/g, "/");
    const request = kind === "note"
      ? window.prism.getNoteList(vaultPath).then((notes) =>
          notes.map((note) => ({ path: note.path, title: note.title, meta: relative(note.path) })))
      : window.prism.listCanvases(vaultPath).then((files) =>
          files.map((file) => ({
            path: file.path,
            title: file.title,
            meta: relative(file.path),
          })));
    void request
      .then((next) => { if (!cancelled) setItems(next); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, kind, vaultPath, locked, reloadKey]);

  const linked = useMemo(
    () => new Set(linkedPaths.map((path) => normalizePath(path))),
    [linkedPaths],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(needle) ||
        item.path.toLowerCase().includes(needle),
    );
  }, [items, query]);

  const link = async (item: Item) => {
    if (linking) return;
    setLinking(true);
    try {
      const next = await window.prism.setGtdProjectLink(projectId, kind, item.path, item.title);
      onLinked(next);
      onClose();
    } catch {
      showToast(t["common.saveFailed"], "error");
    } finally {
      setLinking(false);
    }
  };

  const vaultOptions = vaults.map((vault) => ({ value: vault.path, label: vault.name }));
  const readOnlyPicker = vaults.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t[kind === "note" ? "gtd.projectDoc.chooseNote" : "gtd.projectDoc.chooseCanvas"]}
      icon={kind === "note" ? FileText : Frame}
      size="lg"
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          {t["resources.cancel"]}
        </Button>
      }
    >
      {readOnlyPicker ? (
        <EmptyState size="card" text={t["gtd.projectDoc.noVault"]} />
      ) : (
        <div className="flex min-h-0 flex-col gap-3">
          {vaults.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="flex-shrink-0 text-caption text-muted">
                {t["gtd.projectDoc.vault"]}
              </span>
              <SelectButton
                value={vaultPath}
                options={vaultOptions}
                onChange={setVaultPath}
                className="w-52"
              />
            </div>
          )}

          {locked ? (
            <div className="field-inset flex items-center gap-2 rounded-control border px-3 py-2">
              <Lock size={14} className="text-muted" />
              <span className="flex-1 text-body text-secondary">{t["gtd.projectDoc.locked"]}</span>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => vaultLock.requestUnlock(vaultPath, () => setReloadKey((key) => key + 1))}
              >
                {t["gtd.projectDoc.unlock"]}
              </Button>
            </div>
          ) : (
            <>
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder={t["gtd.projectDoc.search"]}
              />
              <div className="max-h-[45vh] min-h-[140px] overflow-y-auto">
                {loading && filtered.length === 0 ? (
                  <SkeletonRows count={4} />
                ) : filtered.length === 0 ? (
                  <EmptyState
                    size="card"
                    text={t[kind === "note" ? "gtd.projectDoc.emptyNotes" : "gtd.projectDoc.emptyCanvases"]}
                  />
                ) : (
                  filtered.map((item) => {
                    const isLinked = linked.has(normalizePath(item.path));
                    return (
                      <ItemRow
                        key={item.path}
                        variant="dense"
                        onPrimaryClick={
                          !linking && !isLinked ? () => { void link(item); } : undefined
                        }
                        tooltip={item.path}
                        className={linking || isLinked ? "opacity-60" : ""}
                        leading={
                          kind === "note"
                            ? <FileText size={14} className="flex-shrink-0 text-muted" />
                            : <Frame size={14} className="flex-shrink-0 text-muted" />
                        }
                        title={item.title}
                        meta={item.meta && (
                          <span className="max-w-[45%] truncate text-meta text-faint">{item.meta}</span>
                        )}
                        trailing={
                          isLinked ? (
                            <Badge variant="accent">{t["gtd.projectDoc.linked"]}</Badge>
                          ) : undefined
                        }
                      />
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
