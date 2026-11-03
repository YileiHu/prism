import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export interface ToolbarContribution {
  title?: ReactNode;
  subtitle?: ReactNode;
  controls?: ReactNode;
  actions?: ReactNode;
}

type Listener = () => void;

class ToolbarStore {
  private readonly entries = new Map<string, ToolbarContribution>();
  private readonly listeners = new Set<Listener>();

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  set(key: string, contribution: ToolbarContribution) {
    const prev = this.entries.get(key);
    if (
      prev &&
      prev.title === contribution.title &&
      prev.subtitle === contribution.subtitle &&
      prev.controls === contribution.controls &&
      prev.actions === contribution.actions
    ) {
      return;
    }
    this.entries.set(key, contribution);
    this.emit();
  }

  remove(key: string, contribution: ToolbarContribution) {
    if (this.entries.get(key) !== contribution) return;
    this.entries.delete(key);
    this.emit();
  }

  get(key: string): ToolbarContribution | null {
    return this.entries.get(key) ?? null;
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}

const ToolbarContext = createContext<ToolbarStore | null>(null);

export function ToolbarProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => new ToolbarStore(), []);
  return <ToolbarContext.Provider value={store}>{children}</ToolbarContext.Provider>;
}

function useToolbarStore(): ToolbarStore {
  const store = useContext(ToolbarContext);
  if (!store) throw new Error("useToolbar must be used inside ToolbarProvider");
  return store;
}

// The caller owns the object identity; build it with useMemo so registration
// only fires when the visible controls actually change.
export function useToolbarContribution(key: string, contribution: ToolbarContribution) {
  const store = useToolbarStore();
  useEffect(() => {
    store.set(key, contribution);
    return () => store.remove(key, contribution);
  }, [store, key, contribution]);
}

export function useToolbar(key: string): ToolbarContribution | null {
  const store = useToolbarStore();
  const subscribe = useCallback((listener: Listener) => store.subscribe(listener), [store]);
  return useSyncExternalStore(subscribe, () => store.get(key), () => store.get(key));
}
