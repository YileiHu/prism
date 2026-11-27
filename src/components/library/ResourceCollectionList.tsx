import { useMemo } from "react";
import { Layers } from "lucide-react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import type { ResourceCollection } from "../../shared/models";
import EmptyState from "../EmptyState";
import NavItem from "../NavItem";
import SortableList from "../SortableList";
import { SkeletonRows } from "../Skeleton";
import CollectionDialogs, { useCollectionDialogs } from "./CollectionDialogs";
import CollectionDragPreview from "./CollectionDragPreview";
import CollectionSection from "./CollectionSection";
import GroupNavRow from "./GroupNavRow";
import { toResourceCollectionGroups } from "./libraryGroups";
import { LIBRARY_SOURCES } from "./librarySources";
import type { ResourceLibrary } from "./useResourceLibrary";

interface Props {
  resourceLib: ResourceLibrary;
  // Selecting a collection is also a library navigation: the parent points the
  // library at the web-resources source before applying the filter.
  onSelectCollection: (collectionId: number | null) => void;
}

// Collection section of the shared library sidebar while the web-resources
// source is selected. Same rows/menus/dialogs as the note and PDF collections.
export default function ResourceCollectionList({ resourceLib, onSelectCollection }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const collectionDialogs = useCollectionDialogs<ResourceCollection>();
  const { collections, collectionsLoaded, selectedCollectionId, totalCount } = resourceLib;
  const groups = useMemo(() => toResourceCollectionGroups(collections), [collections]);

  const handleRenameCollection = async (target: ResourceCollection, newName: string) => {
    try {
      await resourceLib.renameCollection(target.id, newName);
    } catch {
      showToast(t["common.actionFailed"], "error");
      collectionDialogs.closeRename();
      return;
    }
    collectionDialogs.closeRename();
    showToast(t["collections.renamed"]);
  };

  const handleDeleteCollection = async (target: ResourceCollection) => {
    try {
      await resourceLib.deleteCollection(target.id);
    } catch {
      showToast(t["common.deleteFailed"], "error");
      return;
    }
    collectionDialogs.closeDelete();
    showToast(t["collections.deleted"].replace("{name}", target.name));
  };

  return (
    <>
      <NavItem
        onClick={() => onSelectCollection(null)}
        active={selectedCollectionId === null}
        className="mb-1 font-medium"
        leading={<Layers size={14} />}
        label={t[LIBRARY_SOURCES.resources.allLabelKey]}
        trailing={totalCount}
      />
      {!collectionsLoaded && <SkeletonRows count={6} />}
      {collectionsLoaded && collections.length === 0 && (
        <EmptyState size="card" text={t["resources.emptyCollections"]} />
      )}
      {collectionsLoaded && collections.length > 0 && (
        <CollectionSection ids={groups.map((group) => group.id)} emptyText={t["collections.emptyHint"]}>
          <SortableList
            items={groups}
            itemId={(group) => group.id}
            onReorder={(from, to) => {
              void resourceLib.reorderCollections(from, to).catch(() => {
                showToast(t["common.actionFailed"], "error");
              });
            }}
            renderItem={(group, index) => {
              const isActive = selectedCollectionId === group.source.id;
              return (
                <GroupNavRow
                  name={group.name}
                  icon={group.icon}
                  count={group.count}
                  active={isActive}
                  index={index}
                  onSelect={() => onSelectCollection(isActive ? null : group.source.id)}
                  onRename={() => collectionDialogs.openRename({ id: group.id, name: group.name, data: group.source })}
                  onDelete={() => collectionDialogs.openDelete({ id: group.id, name: group.name, data: group.source })}
                  onSetIcon={(icon) => {
                    void resourceLib.setCollectionIcon(group.source.id, icon).catch(() => {
                      showToast(t["common.actionFailed"], "error");
                    });
                  }}
                />
              );
            }}
            renderOverlay={(group) => (
              <CollectionDragPreview name={group.name} icon={group.icon} count={group.count} />
            )}
          />
        </CollectionSection>
      )}

      <CollectionDialogs<ResourceCollection>
        renameTarget={collectionDialogs.renameTarget}
        deleteTarget={collectionDialogs.deleteTarget}
        renameTitle={t["collections.rename"]}
        deleteMessage={(target) => t["resources.deleteCollectionConfirm"].replace("{name}", target.name)}
        onRename={(target, name) => {
          void handleRenameCollection(target.data, name);
        }}
        onDelete={(target) => {
          void handleDeleteCollection(target.data);
        }}
        onCloseRename={collectionDialogs.closeRename}
        onCloseDelete={collectionDialogs.closeDelete}
      />
    </>
  );
}
