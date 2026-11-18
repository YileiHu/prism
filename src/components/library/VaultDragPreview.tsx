import DragPreview from "../DragPreview";
import { VaultIcon } from "../../lib/vaultIcons";
import type { VaultEntry } from "../../types";

export default function VaultDragPreview({ vault }: { vault: VaultEntry }) {
  return (
    <DragPreview className="flex items-center gap-1.5 px-3 py-1.5">
      <VaultIcon name={vault.icon} size={14} />
      <span className="text-body text-primary">{vault.name}</span>
    </DragPreview>
  );
}
