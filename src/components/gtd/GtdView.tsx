import { Fragment, useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  Inbox,
  Clock,
  FolderKanban,
  Lightbulb,
  CheckCircle2,
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
    done: 0,
  });
  const [projects, setProjects] = useState<GtdItem[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projectsOpen, setProjectsOpen] = useState(true);
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
  }, [version]);

  const handleChanged = useCallback(() => {
    setVersion((v) => v + 1);
    reloadCounts();
  }, [reloadCounts]);

  // Fall back to the first project when nothing (valid) is selected — e.g. the
  // current one was completed or deleted
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null;

  const nav: { key: GtdListKey; icon: LucideIcon; label: string; count?: number }[] = [
    { key: "inbox", icon: Inbox, label: t["gtd.inbox"], count: counts.inbox },
    { key: "waiting", icon: Clock, label: t["gtd.waiting"], count: counts.waiting },
    { key: "project", icon: FolderKanban, label: t["gtd.projects"], count: counts.project },
    { key: "someday", icon: Lightbulb, label: t["gtd.someday"], count: counts.someday },
    { key: "done", icon: CheckCircle2, label: t["gtd.done"] },
  ];

  return (
    <div className="h-full flex">
      <ModuleSidebar active={active}>
        <CollapsibleSidebar>
          {nav.map(({ key, icon: Icon, label, count }) =>
            key === "project" ? (
              <Fragment key={key}>
                <NavItem
                  onClick={() => {
                    if (list === "project") setProjectsOpen((open) => !open);
                    else {
                      setList("project");
                      setProjectsOpen(true);
                    }
                  }}
                  active={list === "project" && !selectedProject}
                  sectionActive={list === "project" && !!selectedProject}
                  leading={<Icon size={15} />}
                  label={label}
                  trailing={
                    <span className="flex items-center gap-1">
                      {count !== undefined && count > 0 ? count : null}
                      {projectsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </span>
                  }
                />
                {projectsOpen && projects.length > 0 && (
                  <div className="pl-2 pt-0.5">
                    <GtdProjectList
                      projects={projects}
                      selectedId={list === "project" ? selectedProject?.id ?? null : null}
                      onSelect={(id) => {
                        setList("project");
                        setSelectedProjectId(id);
                      }}
                      onChanged={handleChanged}
                    />
                  </div>
                )}
              </Fragment>
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
        {(list === "waiting" || list === "someday" || list === "done") && (
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
      </div>

      <GtdProcessDialog
        item={processing}
        onClose={() => setProcessing(null)}
        onDecided={handleChanged}
      />
    </div>
  );
}
