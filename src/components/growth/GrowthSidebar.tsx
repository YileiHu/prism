import {
  BookOpen,
  Gauge,
  MessagesSquare,
  NotebookText,
  Puzzle,
  Route,
  type LucideIcon,
} from "lucide-react";
import CollapsibleSidebar from "../CollapsibleSidebar";
import { ModuleSidebar } from "../AppSidebarSlot";
import NavItem from "../NavItem";
import { useT } from "../../i18n";
import type { Translation } from "../../i18n/zh";
import type { GrowthSelfViewKey, GrowthViewKey } from "./types";

/** The three 元认知 sub-items, switched from the sidebar instead of the toolbar. */
const SELF_SECTIONS: {
  key: GrowthSelfViewKey;
  labelKey: keyof Translation;
  icon: LucideIcon;
}[] = [
  { key: "accuracy", labelKey: "growth.accuracy", icon: Gauge },
  { key: "manual", labelKey: "growth.selfModel", icon: NotebookText },
  { key: "feedback", labelKey: "growth.feedback", icon: MessagesSquare },
];

interface Props {
  active: boolean;
  view: GrowthViewKey;
  onView: (view: GrowthViewKey) => void;
  /** Open 元认知 sub-item, and the switch for it. */
  selfSection: GrowthSelfViewKey;
  onSelfSection: (section: GrowthSelfViewKey) => void;
  capabilityCount: number;
  openChallengeCount: number;
}

export default function GrowthSidebar({
  active,
  view,
  onView,
  selfSection,
  onSelfSection,
  capabilityCount,
  openChallengeCount,
}: Props) {
  const { t } = useT();

  return (
    <ModuleSidebar active={active}>
      <CollapsibleSidebar>
        <NavItem
          active={view === "capabilities"}
          leading={<Puzzle size={14} />}
          label={t["growth.view.capabilities"]}
          trailing={capabilityCount > 0 ? capabilityCount : undefined}
          onClick={() => onView("capabilities")}
        />
        <NavItem
          active={view === "challenges"}
          leading={<Route size={14} />}
          label={t["growth.view.challenges"]}
          trailing={openChallengeCount > 0 ? openChallengeCount : undefined}
          onClick={() => onView("challenges")}
        />
        <NavItem
          active={view === "chronicle"}
          leading={<BookOpen size={14} />}
          label={t["growth.view.chronicle"]}
          onClick={() => onView("chronicle")}
        />
        {/* 元认知 is a fixed group, not a destination and not collapsible. The
            divider separates it from the module views; its rows are ordinary
            nav items so their icons line up with 能力 / 赛季. */}
        <div className="mx-1 mt-3 border-t border-line/50" />
        <div className="px-2 pb-1 pt-2 text-caption font-medium text-muted">
          {t["growth.view.self"]}
        </div>
        {SELF_SECTIONS.map((item) => (
          <NavItem
            key={item.key}
            active={view === "self" && selfSection === item.key}
            leading={<item.icon size={14} />}
            label={t[item.labelKey]}
            onClick={() => onSelfSection(item.key)}
          />
        ))}
      </CollapsibleSidebar>
    </ModuleSidebar>
  );
}
