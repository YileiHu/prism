import { useT } from "../../i18n";
import { COLLECTION_ICON_PRESETS, DEFAULT_COLLECTION_ICON } from "../../lib/collectionIcons";
import Modal from "../Modal";

/** Grid of preset collection icons; picking one commits immediately. */
export default function CollectionIconPicker({
  open,
  value,
  onPick,
  onClose,
}: {
  open: boolean;
  value?: string;
  onPick: (icon: string) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const current = value || DEFAULT_COLLECTION_ICON;
  return (
    <Modal open={open} onClose={onClose} title={t["collections.chooseIcon"]} size="sm">
      <div className="grid grid-cols-6 gap-2">
        {COLLECTION_ICON_PRESETS.map(({ id, Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={current === id}
            onClick={() => onPick(id)}
            className={`w-10 h-10 flex items-center justify-center rounded-control border transition-colors cursor-pointer ${
              current === id
                ? "accent-ring border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent-text)]"
                : "border-line text-secondary hover:bg-elevated/60 hover:text-primary"
            }`}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
    </Modal>
  );
}
