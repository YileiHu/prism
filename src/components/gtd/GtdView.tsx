import { useState, useEffect, useCallback } from "react";
import { Inbox, Zap, Clock, FolderKanban, Lightbulb, CheckCircle2, type LucideIcon } from "lucide-react";
import Sidebar from "../Sidebar";
import { useT } from "../../i18n";
import GtdInbox from "./GtdInbox";
import GtdItemList from "./GtdItemList";
import GtdProjects from "./GtdProjects";
import GtdNextList from "./GtdNextList";
import GtdProcessDialog from "./GtdProcessDialog";
import type { GtdItem, GtdListKey, GtdStatus } from "./types";

export default function GtdView() {
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
    { key: "next", icon: Zap, label: t["gtd.next"] },
    { key: "waiting", icon: Clock, label: t["gtd.waiting"], count: counts.waiting },
    { key: "project", icon: FolderKanban, label: t["gtd.projects"], count: counts.project },
    { key: "someday", icon: Lightbulb, label: t["gtd.someday"], count: counts.someday },
    { key: "done", icon: CheckCircle2, label: t["gtd.done"] },
  ];

  return (
    <div className="h-full flex">
      <Sidebar storageKey="gtd">
        {nav.map(({ key, icon: Icon, label, count }) => (
          <button
            key={key}
            onClick={() => setList(key)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              list === key
                ? "bg-[var(--accent-muted)] text-[var(--accent-text)] font-medium active-bar"
                : "text-tertiary hover:text-primary hover:bg-elevated/50"
            }`}
          >
            <Icon size={15} className="flex-shrink-0" />
            <span className="flex-1 text-left truncate">{label}</span>
            {count !== undefined && count > 0 && (
              <span className="text-xs text-muted">{count}</span>
            )}
          </button>
        ))}
      </Sidebar>

      <div className="flex-1 flex flex-col min-w-0">
        {list === "inbox" && (
          <GtdInbox version={version} onProcess={setProcessing} onChanged={handleChanged} />
        )}
        {list === "next" && <GtdNextList version={version} onChanged={handleChanged} />}
        {(list === "waiting" || list === "someday" || list === "done") && (
          <GtdItemList
            key={list}
            status={list}
            version={version}
            onProcess={setProcessing}
            onChanged={handleChanged}
          />
        )}
        {list === "project" && <GtdProjects version={version} onChanged={handleChanged} />}
      </div>

      <GtdProcessDialog
        item={processing}
        onClose={() => setProcessing(null)}
        onDecided={handleChanged}
      />
    </div>
  );
}
