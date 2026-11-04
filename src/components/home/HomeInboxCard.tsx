import { useEffect, useState } from "react";
import { Inbox, ListChecks, Pencil, Trash2 } from "lucide-react";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import ItemRow from "../ItemRow";
import SectionCard from "../SectionCard";
import EmptyState from "../EmptyState";
import { SkeletonRows } from "../Skeleton";
import ConfirmDialog from "../ConfirmDialog";
import RenameModal from "../RenameModal";
import InboxCapture from "../gtd/InboxCapture";
import GtdProcessDialog from "../gtd/GtdProcessDialog";
import { formatGtdDate, type GtdItem } from "../gtd/types";

interface Props {
  version: number;
}

export default function HomeInboxCard({ version }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [items, setItems] = useState<GtdItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [processing, setProcessing] = useState<GtdItem | null>(null);
  const [renaming, setRenaming] = useState<GtdItem | null>(null);
  const [deleting, setDeleting] = useState<GtdItem | null>(null);

  useEffect(() => {
    window.prism
      .getGtdItems("inbox")
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [version]);

  const notifyChange = () => window.dispatchEvent(new Event("gtd-changed"));

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await window.prism.deleteGtdItem(deleting.id);
    } catch {
      showToast(t["common.deleteFailed"], "error");
      return;
    }
    showToast(t["common.deleted"]);
    notifyChange();
  };

  return (
    <>
      <SectionCard
        icon={Inbox}
        title={t["gtd.inbox"]}
        count={items.length}
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
          {items.map((item) => (
            <ItemRow
              key={item.id}
              variant="dense"
              onPrimaryClick={() => setProcessing(item)}
              menuItems={[
                { label: t["gtd.process"], icon: <ListChecks size={14} />, onClick: () => setProcessing(item) },
                { label: t["menu.rename"], icon: <Pencil size={14} />, onClick: () => setRenaming(item) },
                { label: t["menu.delete"], icon: <Trash2 size={14} />, danger: true, onClick: () => setDeleting(item) },
              ]}
              title={item.title}
              meta={
                <span className="flex-shrink-0 text-caption text-faint">
                  {formatGtdDate(item.createdAt)}
                </span>
              }
            />
          ))}
        </div>
      </SectionCard>

      <GtdProcessDialog
        item={processing}
        onClose={() => setProcessing(null)}
        onDecided={notifyChange}
      />

      <RenameModal
        open={renaming !== null}
        initialValue={renaming?.title ?? ""}
        multiline
        onClose={() => setRenaming(null)}
        onSubmit={async (title) => {
          if (!renaming) return;
          try {
            await window.prism.renameGtdItem(renaming.id, title);
          } catch {
            showToast(t["common.saveFailed"], "error");
            return;
          }
          notifyChange();
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        message={t["gtd.deleteItemConfirm"]}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
