import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAnimatedMount } from "./useAnimatedMount";

const ToastContext = createContext<(msg: string) => void>(() => {});

export function useToast(): (msg: string) => void {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);
  const [toastSeq, setToastSeq] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastToast = useRef("");
  if (toast) lastToast.current = toast;
  const { mounted, exiting } = useAnimatedMount(toast !== null, 150);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    // Bump the key so repeating the same message replays the animation
    setToastSeq((s) => s + 1);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {mounted && (
        <div
          key={toastSeq}
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 glass bg-elevated/85 border border-strong rounded-lg shadow-lg text-sm text-primary ${exiting ? "anim-exit" : "anim-toast"}`}
        >
          {toast ?? lastToast.current}
        </div>
      )}
    </ToastContext.Provider>
  );
}
