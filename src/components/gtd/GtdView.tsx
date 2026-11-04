import { Fragment, useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronRight,
  Inbox,
  Clock,
  FolderKanban,
  Lightbulb,
  Archive,
  type LucideIcon,
} from "lucide-react";
import CollapsibleSidebar from "../CollapsibleSidebar";
import { ModuleSidebar } from "../AppSidebarSlot";
import NavItem from "../NavItem";
import EmptyState from "../EmptyState";
import { SkeletonRows } from "../Skeleton";
import { useT } from "../../i18n";
import GtdInbox from "./GtdInbox";
import GtdItemList from "./GtdItemList";
import GtdProjectDetail from "./GtdProjectDetail";
import GtdProjectList from "./GtdProjectList";
import GtdProcessDialog from "./GtdProcessDialog";
import type { GtdFocus, GtdItem, GtdListKey, GtdStatus } from "./types";

interface Props {
  active: boolean;
  focus: GtdFocus | null;
}

export default function GtdView({ active, focus }: Props) {
  const { t } = useT();
  const [list, setList] = useState<GtdListKey>("inbox");
  const [counts, setCounts] = useState<Record<GtdStatus, number>>({
    inbox: 0,
    someday: 0,
    waiting: 0,
    project: 0,
    archived: 0,
  });
  const [projects, setProjects] = useState<GtdItem[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [archivedProjects, setArchivedProjects] = useState<GtdItem[]>([]);
  const [archivedLoaded, setArchivedLoaded] = useState(false);
  const [selectedArchivedId, setSelectedArchivedId] = useState<number | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(true);
  const [processing, setProcessing] = useState<GtdItem | null>(null);
  const [version, setVersion] = useState(0);
  const [activeFocus, setActiveFocus] = useState<GtdFocus | null>(null);
  const focusSeqRef = useRef(0);

  // Apply incoming navigation requests from Home exactly once (seq-guarded so
  // repeat clicks on the same item still re-trigger)
  useEffect(() => {
    if (!focus || focus.seq === focusSeqRef.current) return;
    focusSeqRef.current = focus.seq;
    setActiveFocus(focus);
    setList(focus.list);
    if (focus.list === "project") {
      setProjectsOpen(true);
      if (focus.projectId) setSelectedProjectId(focus.projectId);
    }
  }, [focus]);

  const reloadCounts = useCallback(async () => {
    setCounts(await window.prism.getGtdCounts());
  }, []);

  useEffect(() => {
    reloadCounts();
  }, [reloadCounts]);

  useEffect(() => {
    window.prism.getGtdItems("project").then(setProjects).finally(() => setProjectsLoaded(true));
    window.prism.getGtdItems("archived").then(setArchivedProjects).finally(() => setArchivedLoaded(true));
  }, [version]);

  const handleChanged = useCallback(() => {
    setVersion((v) => v + 1);
    reloadCounts();
  }, [reloadCounts]);

  // Captures created elsewhere (e.g. the Home inbox input) bump the list and
  // sidebar counts without unmounting the GTD pane
  useEffect(() => {
    window.addEventListener("gtd-changed", handleChanged);
    return () => window.removeEventListener("gtd-changed", handleChanged);
  }, [handleChanged]);

  // Fall back to the first project when nothing (valid) is selected — e.g. the
  // current one was completed or deleted
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null;
  const selectedArchived = archivedProjects.find((p) => p.id === selectedArchivedId) ?? archivedProjects[0] ?? null;

  const nav: { key: GtdListKey; icon: LucideIcon; label: string; count?: number }[] = [
    { key: "inbox", icon: Inbox, label: t["gtd.inbox"], count: counts.inbox },
    { key: "project", icon: FolderKanban, label: t["gtd.projects"] },
    { key: "waiting", icon: Clock, label: t["gtd.waiting"], count: counts.waiting },
    { key: "someday", icon: Lightbulb, label: t["gtd.someday"], count: counts.someday },
    { key: "archived", icon: Archive, label: t["gtd.archived"] },
  ];

  const renderGroup = (opts: {
    key: "project" | "archived";
    icon: LucideIcon;
    label: string;
    items: GtdItem[];
    open: boolean;
    toggle: () => void;
    selected: GtdItem | null;
    selectedId: number | null;
    select: (id: number) => void;
  }) => {
    const Icon = opts.icon;
    return (
      <Fragment key={opts.key}>
        <NavItem
          onClick={opts.toggle}
          active={list === opts.key && !opts.selected}
          parentActive={list === opts.key && !!opts.selected}
          leading={<Icon size={15} />}
          label={opts.label}
          trailing={
            // Nudge right so the caret's visible edge lines up with the digit
            // counts on sibling rows (a 12px lucide chevron sits ~4px inset)
            <ChevronRight
              size={12}
              className={`translate-x-1 transition-transform duration-200 ${opts.open ? "rotate-90" : ""}`}
            />
          }
        />
        {opts.open && opts.items.length > 0 && (
          <div className="sidebar-group mb-1 mt-0.5">
            <GtdProjectList
              projects={opts.items}
              archived={opts.key === "archived"}
              selectedId={list === opts.key ? opts.selectedId : null}
              onSelect={opts.select}
              onChanged={handleChanged}
            />
          </div>
        )}
      </Fragment>
    );
  };

  return (
    <div className="h-full flex">
      <ModuleSidebar active={active}>
        <CollapsibleSidebar>
          {nav.map(({ key, icon: Icon, label, count }) =>
            key === "project" ? (
              renderGroup({
                key,
                icon: Icon,
                label,
                items: projects,
                open: projectsOpen,
                toggle: () => {
                  if (list === "project") setProjectsOpen((open) => !open);
                  else {
                    setList("project");
                    setProjectsOpen(true);
                  }
                },
                selected: selectedProject,
                selectedId: selectedProject?.id ?? null,
                select: (id) => {
                  setList("project");
                  setSelectedProjectId(id);
                },
              })
            ) : key === "archived" ? (
              renderGroup({
                key,
                icon: Icon,
                label,
                items: archivedProjects,
                open: archivedOpen,
                toggle: () => {
                  if (list === "archived") setArchivedOpen((open) => !open);
                  else {
                    setList("archived");
                    setArchivedOpen(true);
                  }
                },
                selected: selectedArchived,
                selectedId: selectedArchived?.id ?? null,
                select: (id) => {
                  setList("archived");
                  setSelectedArchivedId(id);
                },
              })
            ) : (
              <NavItem
                key={key}
                onClick={() => setList(key)}
                active={list === key}
                leading={<Icon size={15} />}
                label={label}
                trailing={count !== undefined && count > 0 ? count : undefined}
              />
            ),
          )}
        </CollapsibleSidebar>
      </ModuleSidebar>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {list === "inbox" && (
          <GtdInbox version={version} onProcess={setProcessing} onChanged={handleChanged} />
        )}
        {(list === "waiting" || list === "someday") && (
          <GtdItemList
            key={list}
            status={list}
            version={version}
            onProcess={setProcessing}
            onChanged={handleChanged}
            focusItem={
              activeFocus?.list === "waiting" && activeFocus.itemId
                ? { id: activeFocus.itemId, seq: activeFocus.seq }
                : null
            }
          />
        )}
        {list === "project" &&
          (!projectsLoaded ? (
            <SkeletonRows count={7} className="p-2" />
          ) : projects.length === 0 ? (
            <EmptyState size="module" text={t["gtd.emptyList"]} />
          ) : (
            selectedProject && (
              <GtdProjectDetail
                key={selectedProject.id}
                project={selectedProject}
                version={version}
                onChanged={handleChanged}
                focusAction={
                  activeFocus?.list === "project" && activeFocus.projectId
                    ? { projectId: activeFocus.projectId, actionId: activeFocus.actionId ?? 0, seq: activeFocus.seq }
                    : null
                }
              />
            )
          ))}
        {list === "archived" &&
          (!archivedLoaded ? (
            <SkeletonRows count={7} className="p-2" />
          ) : archivedProjects.length === 0 ? (
            <EmptyState size="module" text={t["gtd.emptyArchived"]} />
          ) : (
            selectedArchived && (
              <GtdProjectDetail
                key={`archived-${selectedArchived.id}`}
                project={selectedArchived}
                version={version}
                onChanged={handleChanged}
              />
            )
          ))}
      </div>

      <GtdProcessDialog
        item={processing}
        onClose={() => setProcessing(null)}
        onDecided={handleChanged}
      />
    </div>
  );
}
