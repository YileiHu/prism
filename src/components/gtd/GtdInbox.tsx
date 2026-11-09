import { useState, useEffect, useMemo } from "react";
import { useT } from "../../i18n";
import { useToolbarContribution, type ToolbarContribution } from "../toolbar/ToolbarProvider";
import EmptyState from "../EmptyState";
import { SkeletonRows } from "../Skeleton";
import InboxCapture from "./InboxCapture";
import GtdInboxList from "./GtdInboxList";
import { useGtdItemActions } from "./useGtdItemActions";
import type { GtdItem } from "./types";

interface Props {
  version: number;
  onProcess: (item: GtdItem) => void;
  onChanged: () => void;
}

export default function GtdInbox({ version, onProcess, onChanged }: Props) {
  const { t } = useT();
  const [items, setItems] = useState<GtdItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const actions = useGtdItemActions({ kind: "item", onChanged });

  useEffect(() => {
    window.prism.getGtdItems("inbox").then(setItems).finally(() => setLoaded(true));
  }, [version]);

  const toolbar = useMemo<ToolbarContribution>(() => ({
    title: (
      <span className="min-w-0 text-body font-medium text-primary truncate">{t["gtd.inbox"]}</span>
    ),
  }), [t]);

  useToolbarContribution("module:gtd", toolbar);

  return (
    <>
      <div className="px-3 py-2.5 border-b border-line/30 flex-shrink-0">
        <InboxCapture autoFocus />
      </div>
      <div className="flex-1 overflow-y-auto">
        {!loaded && items.length === 0 && <SkeletonRows count={6} />}
        {loaded && items.length === 0 && <EmptyState size="module" text={t["gtd.emptyInbox"]} />}
        <GtdInboxList
          items={items}
          variant="list"
          multiline
          rowClassName="border-b border-line/30"
          onProcess={onProcess}
          onRename={actions.requestRename}
          onDelete={actions.requestDelete}
        />
      </div>

      {actions.modals}
    </>
  );
}
