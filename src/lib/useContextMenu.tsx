import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import ContextMenu, { type MenuItem } from "../components/ContextMenu";

interface CtxState {
  x: number;
  y: number;
  items: MenuItem[];
}

interface CtxValue {
  open: (state: CtxState) => void;
  close: () => void;
}

const Ctx = createContext<CtxValue | null>(null);

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<CtxState | null>(null);

  const open = useCallback((state: CtxState) => setCtx(state), []);
  const close = useCallback(() => setCtx(null), []);

  return (
    <Ctx.Provider value={{ open, close }}>
      {children}
      {ctx && (
        <ContextMenu items={ctx.items} position={{ x: ctx.x, y: ctx.y }} onClose={close} />
      )}
    </Ctx.Provider>
  );
}

export function useContextMenu() {
  const context = useContext(Ctx);
  if (!context) throw new Error("useContextMenu must be used within ContextMenuProvider");

  const onContextMenu = useCallback(
    (e: React.MouseEvent, items: MenuItem[]) => {
      e.preventDefault();
      context.open({ x: e.clientX, y: e.clientY, items });
    },
    [context],
  );

  return { onContextMenu };
}
