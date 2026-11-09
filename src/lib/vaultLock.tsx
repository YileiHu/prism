import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { VaultPrivacyStatus } from "../shared/models";
import { bumpAssetEpoch } from "../components/editor/assetUrl";
import { clearVaultEmbedCache } from "../components/embeds/loader";
import UnlockVaultModal from "../components/vault/UnlockVaultModal";
import { normalizePath } from "./workspace/types";

const ACTIVITY_THROTTLE_MS = 5000;

interface UnlockTarget {
  path: string;
  name: string;
  onUnlocked?: () => void;
}

interface VaultLockContextValue {
  statuses: VaultPrivacyStatus[];
  // Bumped on every lock/unlock/privacy change so consumers can reload.
  epoch: number;
  isPrivate: (vaultPath: string) => boolean;
  isLocked: (vaultPath: string) => boolean;
  lock: (vaultPath: string) => Promise<void>;
  unlock: (vaultPath: string, password: string) => Promise<void>;
  requestUnlock: (vaultPath: string, onUnlocked?: () => void) => void;
  refresh: () => Promise<void>;
}

const VaultLockContext = createContext<VaultLockContextValue | null>(null);

function vaultDisplayName(vaultPath: string): string {
  return vaultPath.split(/[\\/]/).filter(Boolean).pop() ?? vaultPath;
}

export function VaultLockProvider({ children }: { children: ReactNode }) {
  const [statuses, setStatuses] = useState<VaultPrivacyStatus[]>([]);
  const [epoch, setEpoch] = useState(0);
  const [unlockTarget, setUnlockTarget] = useState<UnlockTarget | null>(null);

  const statusMap = useMemo(
    () => new Map(statuses.map((status) => [normalizePath(status.path), status])),
    [statuses],
  );
  const statusMapRef = useRef(statusMap);
  statusMapRef.current = statusMap;

  const refresh = useCallback(async () => {
    try {
      setStatuses(await window.prism.getVaultPrivacyStatuses());
    } catch {
      // Main process may be mid-startup; the next focus/vault change retries.
    }
  }, []);

  const patchStatus = useCallback((vaultPath: string, patch: Partial<VaultPrivacyStatus>) => {
    const key = normalizePath(vaultPath);
    setStatuses((prev) => prev.map((status) =>
      normalizePath(status.path) === key ? { ...status, ...patch } : status,
    ));
  }, []);

  useEffect(() => {
    void refresh();
    const onRefresh = () => { void refresh(); };
    window.addEventListener("focus", onRefresh);
    window.addEventListener("vaults-changed", onRefresh);
    return () => {
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener("vaults-changed", onRefresh);
    };
  }, [refresh]);

  useEffect(() => {
    const handleLocked = (vaultPath: string) => {
      patchStatus(vaultPath, { locked: true });
      clearVaultEmbedCache(vaultPath);
      bumpAssetEpoch();
      setEpoch((value) => value + 1);
      window.dispatchEvent(new CustomEvent("prism:vault-locked", { detail: { path: vaultPath } }));
    };
    const handleUnlocked = (vaultPath: string) => {
      patchStatus(vaultPath, { locked: false });
      bumpAssetEpoch();
      setEpoch((value) => value + 1);
      window.dispatchEvent(new CustomEvent("prism:vault-unlocked", { detail: { path: vaultPath } }));
    };
    const unsubLocked = window.prism.onVaultLocked(handleLocked);
    const unsubUnlocked = window.prism.onVaultUnlocked(handleUnlocked);
    const unsubPrivacy = window.prism.onVaultPrivacyChanged((status) => {
      const key = normalizePath(status.path);
      setStatuses((prev) => prev.some((entry) => normalizePath(entry.path) === key)
        ? prev.map((entry) => (normalizePath(entry.path) === key ? status : entry))
        : [...prev, status]);
      clearVaultEmbedCache(status.path);
      bumpAssetEpoch();
      setEpoch((value) => value + 1);
      if (status.private && status.locked) {
        window.dispatchEvent(new CustomEvent("prism:vault-locked", { detail: { path: status.path } }));
      }
      window.dispatchEvent(new CustomEvent("vaults-changed"));
    });
    return () => {
      unsubLocked();
      unsubUnlocked();
      unsubPrivacy();
    };
  }, [patchStatus]);

  // Keep unlocked vaults alive while the pointer/keyboard is in use. Throttled
  // and only active when at least one private vault is actually unlocked.
  useEffect(() => {
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - last < ACTIVITY_THROTTLE_MS) return;
      last = now;
      const anyUnlocked = Array.from(statusMapRef.current.values())
        .some((status) => status.private && !status.locked);
      if (!anyUnlocked) return;
      void window.prism.touchVaults();
    };
    window.addEventListener("pointerdown", onActivity, true);
    window.addEventListener("keydown", onActivity, true);
    return () => {
      window.removeEventListener("pointerdown", onActivity, true);
      window.removeEventListener("keydown", onActivity, true);
    };
  }, []);

  const isPrivate = useCallback(
    (vaultPath: string) => Boolean(vaultPath && statusMap.get(normalizePath(vaultPath))?.private),
    [statusMap],
  );

  const isLocked = useCallback(
    (vaultPath: string) => Boolean(vaultPath && statusMap.get(normalizePath(vaultPath))?.locked),
    [statusMap],
  );

  const lock = useCallback(async (vaultPath: string) => {
    await window.prism.lockVault(vaultPath);
  }, []);

  const unlock = useCallback(async (vaultPath: string, password: string) => {
    await window.prism.unlockVault(vaultPath, password);
    patchStatus(vaultPath, { locked: false });
  }, [patchStatus]);

  const requestUnlock = useCallback((vaultPath: string, onUnlocked?: () => void) => {
    setUnlockTarget({ path: vaultPath, name: vaultDisplayName(vaultPath), onUnlocked });
  }, []);

  const handleUnlock = useCallback(async (password: string) => {
    if (!unlockTarget) return;
    await window.prism.unlockVault(unlockTarget.path, password);
    // Patch immediately so the caller can select the vault without waiting for
    // the IPC event round-trip.
    patchStatus(unlockTarget.path, { locked: false });
    const onUnlocked = unlockTarget.onUnlocked;
    setUnlockTarget(null);
    onUnlocked?.();
  }, [patchStatus, unlockTarget]);

  const value = useMemo<VaultLockContextValue>(
    () => ({ statuses, epoch, isPrivate, isLocked, lock, unlock, requestUnlock, refresh }),
    [statuses, epoch, isPrivate, isLocked, lock, unlock, requestUnlock, refresh],
  );

  return (
    <VaultLockContext.Provider value={value}>
      {children}
      <UnlockVaultModal
        open={unlockTarget !== null}
        vaultName={unlockTarget?.name ?? ""}
        onClose={() => setUnlockTarget(null)}
        onUnlock={handleUnlock}
      />
    </VaultLockContext.Provider>
  );
}

export function useVaultLock(): VaultLockContextValue {
  const value = useContext(VaultLockContext);
  if (!value) throw new Error("useVaultLock must be used inside VaultLockProvider");
  return value;
}
