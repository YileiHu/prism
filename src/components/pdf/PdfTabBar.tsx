import { BookOpen, FolderPlus, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useT } from "../../i18n";
import Button from "../Button";
import TabStrip from "../TabStrip";
import type { PdfTab } from "./usePdfTabs";

interface Props {
  tabs: PdfTab[];
  activePath: string | null;
  sidebarCollapsed: boolean;
  onSelect: (relPath: string) => void;
  onClose: (relPath: string) => void;
  onReorder: (relPath: string, toIndex: number) => void;
  onNewCollection: () => void;
  onToggleSidebar: () => void;
}

export default function PdfTabBar({
  tabs,
  activePath,
  sidebarCollapsed,
  onSelect,
  onClose,
  onReorder,
  onNewCollection,
  onToggleSidebar,
}: Props) {
  const { t } = useT();

  return (
    <TabStrip
      items={tabs.map((tab) => ({ id: tab.relPath, title: tab.title, icon: <BookOpen size={12} /> }))}
      activeId={activePath}
      closeLabel={t["editor.closeTab"]}
      onSelect={onSelect}
      onClose={onClose}
      onReorder={onReorder}
      rightActions={
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onNewCollection}
            title={t["pdf.newCollection"]}
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
