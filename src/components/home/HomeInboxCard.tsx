import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { useT } from "../../i18n";
import SectionCard from "../SectionCard";
import EmptyState from "../EmptyState";
import { SkeletonRows } from "../Skeleton";
import InboxCapture from "../gtd/InboxCapture";
import GtdProcessDialog from "../gtd/GtdProcessDialog";
import GtdInboxList from "../gtd/GtdInboxList";
import { useGtdItemActions } from "../gtd/useGtdItemActions";
import { type GtdItem } from "../gtd/types";
import { tagColor } from "../../lib/colors";

interface Props {
  version: number;
}

export default function HomeInboxCard({ version }: Props) {
  const { t } = useT();
  const [items, setItems] = useState<GtdItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [processing, setProcessing] = useState<GtdItem | null>(null);

  const notifyChange = () => window.dispatchEvent(new Event("gtd-changed"));
  const actions = useGtdItemActions({ kind: "item", onChanged: notifyChange });

  useEffect(() => {
    window.prism
      .getGtdItems("inbox")
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [version]);

  return (
    <>
      <SectionCard
        icon={Inbox}
        title={t["gtd.inbox"]}
        count={items.length}
        tintColor={tagColor("blue")}
        className="flex h-full min-h-0 flex-col"
        bodyClassName="flex min-h-0 flex-1 flex-col p-0"
      >
        <div className="flex-shrink-0 border-b border-line/30 p-2">
          <InboxCapture rows={2} />
          <p className="mt-1 px-1 text-meta text-faint">{t["home.inbox.captureHint"]}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {!loaded && items.length === 0 && <SkeletonRows count={3} />}
          {loaded && items.length === 0 && (
            <EmptyState size="card" text={t["home.inbox.emptyHint"]} />
          )}
          <GtdInboxList
            items={items}
            variant="dense"
            onProcess={setProcessing}
            onRename={actions.requestRename}
            onDelete={actions.requestDelete}
          />
        </div>
      </SectionCard>

      <GtdProcessDialog
        item={processing}
        onClose={() => setProcessing(null)}
        onDecided={notifyChange}
      />

      {actions.modals}
    </>
  );
}
