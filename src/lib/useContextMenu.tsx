import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import ContextMenu, { type MenuItem } from "../components/ContextMenu";
import { useAnimatedMount } from "./useAnimatedMount";

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
  // Keep the last menu state so it can render through its exit animation
  const lastCtx = useRef<CtxState | null>(null);
  if (ctx) lastCtx.current = ctx;

  const open = useCallback((state: CtxState) => setCtx(state), []);
  const close = useCallback(() => setCtx(null), []);

  const { mounted, exiting } = useAnimatedMount(ctx !== null, 100);

  return (
    <Ctx.Provider value={{ open, close }}>
      {children}
      {mounted && lastCtx.current && (
        <ContextMenu
          items={lastCtx.current.items}
          position={{ x: lastCtx.current.x, y: lastCtx.current.y }}
          onClose={close}
          exiting={exiting}
        />
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
