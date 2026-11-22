import { useMemo } from "react";
import { Layers } from "lucide-react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import type { TagInfo } from "../../shared/models";
import EmptyState from "../EmptyState";
import NavItem from "../NavItem";
import SortableList from "../SortableList";
import { SkeletonRows } from "../Skeleton";
import CollectionDialogs, { useCollectionDialogs } from "./CollectionDialogs";
import CollectionDragPreview from "./CollectionDragPreview";
import GroupNavRow from "./GroupNavRow";
import { toResourceTagGroups } from "./libraryGroups";
import { LIBRARY_SOURCES } from "./librarySources";
import type { ResourceLibrary } from "./useResourceLibrary";

interface Props {
  resourceLib: ResourceLibrary;
  // Selecting a tag is also a library navigation: the parent points the
  // library at the web-resources source before applying the filter.
  onSelectTag: (tag: string | null) => void;
}

// Tag section of the shared library sidebar while the web-resources source is
// selected. Kept as one component so both the library page and the workspace
// sidebar get identical tag menus and rename/delete modals.
export default function ResourceTagList({ resourceLib, onSelectTag }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const tagDialogs = useCollectionDialogs<TagInfo>();
  const { tags, tagsLoaded, activeTag, totalCount } = resourceLib;
  const groups = useMemo(() => toResourceTagGroups(tags), [tags]);

  const handleRenameTag = async (target: TagInfo, newName: string) => {
    try {
      await resourceLib.renameTag(target.name, newName);
    } catch {
      showToast(t["common.actionFailed"], "error");
      tagDialogs.closeRename();
      return;
    }
    tagDialogs.closeRename();
    showToast(t["resources.tagRenamed"]);
  };

  const handleDeleteTag = async (target: TagInfo) => {
    try {
      await resourceLib.deleteTag(target.name);
    } catch {
      showToast(t["common.deleteFailed"], "error");
      return;
    }
    tagDialogs.closeDelete();
    showToast(t["resources.tagDeleted"]);
  };

  return (
    <>
      <NavItem
        onClick={() => onSelectTag(null)}
        active={activeTag === null}
        className="mb-1 font-medium"
        leading={<Layers size={14} />}
        label={t[LIBRARY_SOURCES.resources.allLabelKey]}
        trailing={totalCount}
      />
      {!tagsLoaded && <SkeletonRows count={6} />}
      {tagsLoaded && tags.length === 0 && <EmptyState size="card" text={t["resources.noTags"]} />}
      {tagsLoaded && tags.length > 0 && (
        <div className="sidebar-group">
          <SortableList
            items={groups}
            itemId={(group) => group.id}
            onReorder={(from, to) => {
              void resourceLib.reorderTags(from, to).catch(() => {
                showToast(t["common.actionFailed"], "error");
              });
            }}
            renderItem={(group, index) => {
              const isActive = activeTag === group.name;
              return (
                <GroupNavRow
                  name={group.name}
                  color={group.color}
                  count={group.count}
                  active={isActive}
                  index={index}
                  onSelect={() => onSelectTag(isActive ? null : group.name)}
                  onRename={() => tagDialogs.openRename({ id: group.id, name: group.name, data: group.source })}
                  onDelete={() => tagDialogs.openDelete({ id: group.id, name: group.name, data: group.source })}
                  onSetColor={(color) => {
                    void resourceLib.setTagColor(group.name, color).catch(() => {
                      showToast(t["common.actionFailed"], "error");
                    });
                  }}
                />
              );
            }}
            renderOverlay={(group) => (
              <CollectionDragPreview name={group.name} color={group.color} count={group.count} />
            )}
          />
        </div>
      )}

      <CollectionDialogs<TagInfo>
        renameTarget={tagDialogs.renameTarget}
        deleteTarget={tagDialogs.deleteTarget}
        renameTitle={t["resources.tagRenameTitle"]}
        deleteMessage={(target) => t["resources.tagDeleteConfirm"].replace("{name}", target.name)}
        onRename={(target, name) => {
          void handleRenameTag(target.data, name);
        }}
        onDelete={(target) => {
          void handleDeleteTag(target.data);
        }}
        onCloseRename={tagDialogs.closeRename}
        onCloseDelete={tagDialogs.closeDelete}
      />
    </>
  );
}
