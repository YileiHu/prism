import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const SlotContext = createContext<HTMLElement | null>(null);

export function AppSidebarSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <SlotContext.Provider value={slot}>
      <div className="flex-1 min-h-0 flex">
        <div ref={setSlot} className="h-full flex-shrink-0 flex" />
        <div className="flex-1 min-w-0 flex flex-col">{children}</div>
      </div>
    </SlotContext.Provider>
  );
}

interface ModuleSidebarProps {
  active: boolean;
  children: ReactNode;
}

// Every module stays mounted (hidden panes), so all sidebars keep their state.
// They render through a portal into the shared full-height slot; only the
// active module's copy is visible and contributes width.
export function ModuleSidebar({ active, children }: ModuleSidebarProps) {
  const slot = useContext(SlotContext);
  if (!slot) return null;
  return createPortal(
    <div className={active ? "h-full flex" : "hidden"}>{children}</div>,
    slot,
  );
}
