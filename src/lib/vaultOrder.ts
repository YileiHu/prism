import { arrayMove } from "@dnd-kit/sortable";
import type { VaultEntry } from "../types";

// The vault list order lives in the `vault_paths` setting. Persist the whole
// array (not a separate order key) so Settings and the sidebar share one order.
export async function persistVaultOrder(
  vaults: VaultEntry[],
  from: number,
  to: number,
): Promise<VaultEntry[]> {
  const previous = vaults;
  const next = arrayMove(vaults, from, to);
  // Apply the order before the IPC round-trip so the dropped row does not
  // snap back to its old slot for a frame.
  window.dispatchEvent(new CustomEvent("vaults-order-changed", { detail: next }));
  try {
    await window.prism.setSetting("vault_paths", JSON.stringify(next));
    window.dispatchEvent(new Event("vaults-changed"));
    return next;
  } catch (error) {
    window.dispatchEvent(new CustomEvent("vaults-order-changed", { detail: previous }));
    throw error;
  }
}
