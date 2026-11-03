import { FileText, FolderPlus, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { useT } from "../../i18n";
import Button from "../Button";
import TabStrip from "../TabStrip";
import type { NoteTab } from "./useNoteTabs";

interface Props {
  tabs: NoteTab[];
  activePath: string | null;
  newLabel: string;
  closeLabel: string;
  sidebarCollapsed: boolean;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onNewNote: () => void;
  onNewCollection: () => void;
  onToggleSidebar: () => void;
  onReorder: (path: string, toIndex: number) => void;
}

export default function NoteTabBar({
  tabs,
  activePath,
  newLabel,
  closeLabel,
  sidebarCollapsed,
  onSelect,
  onClose,
  onNewNote,
  onNewCollection,
  onToggleSidebar,
  onReorder,
}: Props) {
  const { t } = useT();

  return (
    <TabStrip
      items={tabs.map((tab) => ({ id: tab.path, title: tab.title, icon: <FileText size={12} /> }))}
      activeId={activePath}
      closeLabel={closeLabel}
      onSelect={onSelect}
      onClose={onClose}
      onReorder={onReorder}
      rightActions={
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onNewNote}
            title={newLabel}
            className="h-full !rounded-none !px-2.5 !py-0 hover:!text-primary"
          >
            <Plus size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onNewCollection}
            title={t["collections.new"]}
            className="h-full !rounded-none !px-2.5 !py-0 hover:!text-primary"
          >
            <FolderPlus size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleSidebar}
            title={sidebarCollapsed ? t["collections.expandSidebar"] : t["collections.collapseSidebar"]}
            className="h-full !rounded-none !px-2.5 !py-0 hover:!text-primary"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </Button>
        </>
      }
    />
  );
}
