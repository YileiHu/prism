import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { FolderOpen, TriangleAlert, Unlink } from "lucide-react";
import EmptyState from "../EmptyState";
import ItemRow from "../ItemRow";
import { SkeletonRows } from "../Skeleton";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useSettings } from "../../lib/settings";
import { useVaultLock } from "../../lib/vaultLock";
import { normalizePath } from "../../lib/paths";
import { createCanvasDoc, serializeCanvas } from "../../lib/canvas/model";
import { CANVAS_CHANGED_EVENT, notifyCanvasChanged } from "../../lib/canvas/events";
import GtdProjectLinkPickerModal from "./GtdProjectLinkPickerModal";
import type { VaultEntry } from "../../types";
import type { GtdProject } from "./types";
import type {
  GtdProjectDocsPayload,
  GtdProjectLink,
  GtdProjectLinkKind,
} from "../../shared/models";

interface Props {
  project: GtdProject;
  version: number;
  vaults: VaultEntry[];
  readOnly: boolean;
  embedded?: boolean;
  onOpenLink: (link: GtdProjectLink) => void;
  onChanged: () => void;
  onStateChange?: (state: { hasFiles: boolean; canOpenFolder: boolean }) => void;
}

export interface GtdProjectDocsHandle {
  create: (kind: GtdProjectLinkKind) => void;
  link: (kind: GtdProjectLinkKind) => void;
  openFolder: () => void;
}

const GtdProjectDocs = forwardRef<GtdProjectDocsHandle, Props>(function GtdProjectDocs({
  project,
  version,
  vaults,
  readOnly,
  embedded = false,
  onOpenLink,
  onChanged,
  onStateChange,
}, ref) {
  const { t } = useT();
  const showToast = useToast();
  const { values } = useSettings();
  const vaultLock = useVaultLock();
  const [payload, setPayload] = useState<GtdProjectDocsPayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pickerKind, setPickerKind] = useState<GtdProjectLinkKind | null>(null);
  const [busy, setBusy] = useState(false);

  const projectVaultPath = values.project_vault_path;
  const projectVaultValid = vaults.some(
    (vault) => normalizePath(vault.path) === normalizePath(projectVaultPath),
  );

  useEffect(() => {
    let cancelled = false;
    window.prism
      .getGtdProjectDocs(project.id)
      .then((next) => { if (!cancelled) setPayload(next); })
      .catch(() => { /* keep the previous snapshot */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [project.id, version, refreshKey]);

  useEffect(() => {
    const vaultsOfLinks = new Set(
      (payload?.links ?? []).map((link) => normalizePath(link.vaultPath)),
    );
    if (vaultsOfLinks.size === 0) return;
    const off = window.prism.onVaultUpdated((vaultPath) => {
      if (vaultsOfLinks.has(normalizePath(vaultPath))) setRefreshKey((key) => key + 1);
    });
    const onCanvasChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ vaultPath?: string }>).detail;
      if (detail?.vaultPath && vaultsOfLinks.has(normalizePath(detail.vaultPath))) {
        setRefreshKey((key) => key + 1);
      }
    };
    window.addEventListener(CANVAS_CHANGED_EVENT, onCanvasChanged);
    return () => {
      off();
      window.removeEventListener(CANVAS_CHANGED_EVENT, onCanvasChanged);
    };
  }, [payload]);

  const folder = payload?.folder ?? null;
  const links = payload?.links ?? [];
  const hasFiles = links.length > 0;
  const canOpenFolder = hasFiles && !!folder && !folder.missing;
  const folderVaultConfigured = !!folder && vaults.some(
    (vault) => normalizePath(vault.path) === normalizePath(folder.vaultPath),
  );
  // Follow the folder while it is healthy; when it is missing and its old vault
  // is gone, ensureGtdProjectFolder falls back to the configured project vault.
  const targetVaultPath = folder && (!folder.missing || folderVaultConfigured)
    ? folder.vaultPath
    : projectVaultValid
      ? projectVaultPath
      : folder?.vaultPath || projectVaultPath;

  const create = async (kind: GtdProjectLinkKind) => {
    if (readOnly || busy) return;
    const vaultPath = targetVaultPath;
    if (!vaultPath || (!folder && !projectVaultValid)) {
      showToast(
        t[projectVaultPath ? "gtd.projectDoc.vaultUnavailable" : "gtd.projectDoc.noVault"],
        "error",
      );
      return;
    }
    const run = async () => {
      setBusy(true);
      try {
        const template = kind === "canvas" ? serializeCanvas(createCanvasDoc()) : undefined;
        const link = await window.prism.createGtdProjectFile(project.id, kind, template);
        if (kind === "canvas") {
          notifyCanvasChanged(link.vaultPath, { created: link.filePath });
        }
        window.dispatchEvent(new Event("gtd-project-links-changed"));
        onChanged();
        onOpenLink(link);
      } catch {
        showToast(t["common.saveFailed"], "error");
      } finally {
        setBusy(false);
      }
    };
    if (vaultLock.isLocked(vaultPath)) {
      vaultLock.requestUnlock(vaultPath, () => { void run(); });
    } else {
      await run();
    }
  };

  const openFolder = async () => {
    try {
      await window.prism.openGtdProjectFolder(project.id);
    } catch {
      showToast(t["common.saveFailed"], "error");
    }
  };

  const unlink = async (link: GtdProjectLink) => {
    try {
      await window.prism.removeGtdProjectLink(link.id);
    } catch {
      showToast(t["common.deleteFailed"], "error");
      return;
    }
    showToast(t["gtd.projectDoc.unlinked"]);
    window.dispatchEvent(new Event("gtd-project-links-changed"));
    onChanged();
  };

  useEffect(() => {
    onStateChange?.({ hasFiles, canOpenFolder });
  }, [canOpenFolder, hasFiles, onStateChange]);

  useImperativeHandle(ref, () => ({
    create: (kind) => { void create(kind); },
    link: (kind) => setPickerKind(kind),
    openFolder: () => { void openFolder(); },
  }), [create, openFolder]);

  if (readOnly && !folder && links.length === 0) return null;

  return (
    <section className={embedded ? "mt-4 border-t border-line/30 pt-4" : "border-b border-line/30 px-4 py-3"}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-meta font-medium text-muted">{t["gtd.projectDocs"]}</span>
      </div>

      {!loaded && !payload ? (
        <SkeletonRows count={2} />
      ) : (
        <>
          <div className="sidebar-group mt-2">
            {links.length === 0 ? (
              <EmptyState size="card" text={t["gtd.projectDoc.empty"]} />
            ) : (
              links.map((link) => {
                const menuItems = [
                  ...(!link.missing
                    ? [{
                        label: t["menu.showInExplorer"],
                        icon: <FolderOpen size={14} />,
                        onClick: () => window.prism.showItemInFolder(link.filePath),
                      }]
                    : []),
                  ...(!readOnly
                    ? [{
                        label: t["gtd.projectDoc.unlink"],
                        icon: <Unlink size={14} />,
                        onClick: () => void unlink(link),
                      }]
                    : []),
                ];
                return (
                  <ItemRow
                    key={link.id}
                    variant="dense"
                    className="mb-0.5 last:mb-0"
                    onPrimaryClick={link.missing ? undefined : () => onOpenLink(link)}
                    tooltip={link.filePath}
                    menuItems={menuItems.length > 0 ? menuItems : undefined}
                    title={
                      link.missing
                        ? <span className="text-muted">{link.title}</span>
                        : link.title
                    }
                    meta={
                      link.missing ? (
                        <span className="flex items-center gap-1 text-caption text-danger">
                          <TriangleAlert size={11} />
                          {t["gtd.projectDoc.missing"]}
                        </span>
                      ) : undefined
                    }
                  />
                );
              })
            )}
          </div>
        </>
      )}

      <GtdProjectLinkPickerModal
        open={pickerKind !== null}
        projectId={project.id}
        kind={pickerKind ?? "note"}
        vaults={vaults}
        defaultVaultPath={folder?.vaultPath || projectVaultPath}
        linkedPaths={links.map((link) => link.filePath)}
        onClose={() => setPickerKind(null)}
        onLinked={(link) => {
          window.dispatchEvent(new Event("gtd-project-links-changed"));
          onChanged();
          onOpenLink(link);
        }}
      />
    </section>
  );
});

export default GtdProjectDocs;
