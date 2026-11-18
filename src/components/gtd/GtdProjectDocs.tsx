import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { FolderOpen, TriangleAlert, Unlink } from "lucide-react";
import EmptyState from "../EmptyState";
import ItemRow from "../ItemRow";
import { SkeletonRows } from "../Skeleton";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { useSettings } from "../../lib/settings";
import { normalizePath } from "../../lib/paths";
import { CANVAS_CHANGED_EVENT } from "../../lib/canvas/events";
import GtdProjectDocCreateModal from "./GtdProjectDocCreateModal";
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
}

export interface GtdProjectDocsHandle {
  create: (kind: GtdProjectLinkKind) => void;
  link: (kind: GtdProjectLinkKind) => void;
}

const GtdProjectDocs = forwardRef<GtdProjectDocsHandle, Props>(function GtdProjectDocs({
  project,
  version,
  vaults,
  readOnly,
  embedded = false,
  onOpenLink,
  onChanged,
}, ref) {
  const { t } = useT();
  const showToast = useToast();
  const { values } = useSettings();
  const [payload, setPayload] = useState<GtdProjectDocsPayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pickerKind, setPickerKind] = useState<GtdProjectLinkKind | null>(null);
  const [createKind, setCreateKind] = useState<GtdProjectLinkKind | null>(null);

  const links = payload?.links ?? [];
  // Prefer the vault of the first linked file, then the configured default.
  const defaultVaultPath =
    links[0]?.vaultPath || values.project_vault_path || vaults[0]?.path || "";

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
      links.map((item) => normalizePath(item.vaultPath)),
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
  }, [links]);

  const create = (kind: GtdProjectLinkKind) => {
    if (readOnly) return;
    if (vaults.length === 0) {
      showToast(t["gtd.projectDoc.noVault"], "error");
      return;
    }
    setCreateKind(kind);
  };

  const link = (kind: GtdProjectLinkKind) => {
    if (readOnly) return;
    if (vaults.length === 0) {
      showToast(t["gtd.projectDoc.noVault"], "error");
      return;
    }
    setPickerKind(kind);
  };

  const unlink = async (item: GtdProjectLink) => {
    try {
      await window.prism.removeGtdProjectLink(item.id);
    } catch {
      showToast(t["common.deleteFailed"], "error");
      return;
    }
    showToast(t["gtd.projectDoc.unlinked"]);
    window.dispatchEvent(new Event("gtd-project-links-changed"));
    onChanged();
  };

  useImperativeHandle(ref, () => ({
    create,
    link,
  }), [create, link]);

  if (readOnly && links.length === 0) return null;

  return (
    <section className={embedded ? "mt-4 border-t border-line/30 pt-4" : "border-b border-line/30 px-4 py-3"}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-meta font-medium text-muted">{t["gtd.projectDocs"]}</span>
      </div>

      {!loaded && !payload ? (
        <SkeletonRows count={2} />
      ) : (
        <div className="sidebar-group mt-2">
          {links.length === 0 ? (
            <EmptyState size="card" text={t["gtd.projectDoc.empty"]} />
          ) : (
            links.map((item) => {
              const menuItems = [
                ...(!item.missing
                  ? [{
                      label: t["menu.showInExplorer"],
                      icon: <FolderOpen size={14} />,
                      onClick: () => window.prism.showItemInFolder(item.filePath),
                    }]
                  : []),
                ...(!readOnly
                  ? [{
                      label: t["gtd.projectDoc.unlink"],
                      icon: <Unlink size={14} />,
                      onClick: () => void unlink(item),
                    }]
                  : []),
              ];
              return (
                <ItemRow
                  key={item.id}
                  variant="dense"
                  className="mb-0.5 last:mb-0"
                  onPrimaryClick={item.missing ? undefined : () => onOpenLink(item)}
                  tooltip={item.filePath}
                  menuItems={menuItems.length > 0 ? menuItems : undefined}
                  title={
                    item.missing
                      ? <span className="text-muted">{item.title}</span>
                      : item.title
                  }
                  meta={
                    item.missing ? (
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
      )}

      <GtdProjectDocCreateModal
        open={createKind !== null}
        kind={createKind ?? "note"}
        project={project}
        vaults={vaults}
        defaultVaultPath={defaultVaultPath}
        onClose={() => setCreateKind(null)}
        onCreated={(link) => {
          onChanged();
          onOpenLink(link);
        }}
      />

      <GtdProjectLinkPickerModal
        open={pickerKind !== null}
        projectId={project.id}
        kind={pickerKind ?? "note"}
        vaults={vaults}
        defaultVaultPath={defaultVaultPath}
        linkedPaths={links.map((item) => item.filePath)}
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
