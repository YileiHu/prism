import { useState, useEffect, useCallback, useRef } from "react";
import { Inbox, Clock, FolderKanban, Lightbulb, CheckCircle2, type LucideIcon } from "lucide-react";
import Sidebar from "../Sidebar";
import NavItem from "../NavItem";
import { useT } from "../../i18n";
import GtdInbox from "./GtdInbox";
import GtdItemList from "./GtdItemList";
import GtdProjects from "./GtdProjects";
import GtdProcessDialog from "./GtdProcessDialog";
import type { GtdFocus, GtdItem, GtdListKey, GtdStatus } from "./types";

interface Props {
  focus: GtdFocus | null;
}

export default function GtdView({ focus }: Props) {
  const { t } = useT();
  const [list, setList] = useState<GtdListKey>("inbox");
  const [counts, setCounts] = useState<Record<GtdStatus, number>>({
    inbox: 0,
    someday: 0,
    waiting: 0,
    project: 0,
    done: 0,
  });
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
  }, [focus]);

  const reloadCounts = useCallback(async () => {
    setCounts(await window.prism.getGtdCounts());
  }, []);

  useEffect(() => {
    reloadCounts();
  }, [reloadCounts]);

  const handleChanged = useCallback(() => {
    setVersion((v) => v + 1);
    reloadCounts();
  }, [reloadCounts]);

  const nav: { key: GtdListKey; icon: LucideIcon; label: string; count?: number }[] = [
    { key: "inbox", icon: Inbox, label: t["gtd.inbox"], count: counts.inbox },
    { key: "waiting", icon: Clock, label: t["gtd.waiting"], count: counts.waiting },
    { key: "project", icon: FolderKanban, label: t["gtd.projects"], count: counts.project },
    { key: "someday", icon: Lightbulb, label: t["gtd.someday"], count: counts.someday },
    { key: "done", icon: CheckCircle2, label: t["gtd.done"] },
  ];

  return (
    <div className="h-full flex">
      <Sidebar>
        {nav.map(({ key, icon: Icon, label, count }) => (
          <NavItem
            key={key}
            onClick={() => setList(key)}
            active={list === key}
            leading={<Icon size={15} />}
            label={label}
            trailing={count !== undefined && count > 0 ? count : undefined}
          />
        ))}
      </Sidebar>

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
        {list === "project" && (
          <GtdProjects
            version={version}
            onChanged={handleChanged}
            focusAction={
              activeFocus?.list === "project" && activeFocus.projectId
                ? { projectId: activeFocus.projectId, actionId: activeFocus.actionId ?? 0, seq: activeFocus.seq }
                : null
            }
          />
        )}
      </div>

      <GtdProcessDialog
        item={processing}
        onClose={() => setProcessing(null)}
        onDecided={handleChanged}
      />
    </div>
  );
}
