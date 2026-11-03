import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import { useAnimatedMount } from "./useAnimatedMount";

export type ToastType = "default" | "success" | "error" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  type?: ToastType;
  action?: ToastAction;
  duration?: number;
}

type ShowToast = (msg: string, typeOrOptions?: ToastType | ToastOptions) => void;

interface ToastState {
  msg: string;
  type: ToastType;
  action?: ToastAction;
}

const ToastContext = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

const TONE: Record<ToastType, { border: string; Icon?: LucideIcon; iconClass: string }> = {
  default: { border: "border-strong", iconClass: "" },
  success: { border: "border-success/40", Icon: CheckCircle2, iconClass: "text-success" },
  error: { border: "border-danger/40", Icon: AlertCircle, iconClass: "text-danger" },
  info: { border: "border-info/40", Icon: Info, iconClass: "text-info" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [toastSeq, setToastSeq] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastToast = useRef<ToastState>({ msg: "", type: "default" });
  if (toast) lastToast.current = toast;
  const { mounted, exiting } = useAnimatedMount(toast !== null, 150);

  const dismiss = useCallback(() => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback<ShowToast>((msg, typeOrOptions) => {
    const options: ToastOptions =
      typeof typeOrOptions === "string" ? { type: typeOrOptions } : (typeOrOptions ?? {});
    setToast({ msg, type: options.type ?? "default", action: options.action });
    // Bump the key so repeating the same message replays the animation
    setToastSeq((s) => s + 1);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    // Action toasts need time to be clicked
    toastTimer.current = setTimeout(() => setToast(null), options.duration ?? (options.action ? 5000 : 2500));
  }, []);

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  const current = toast ?? lastToast.current;
  const tone = TONE[current.type];
  const Icon = tone.Icon;

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {mounted && (
        <div
          key={toastSeq}
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-toast flex items-center gap-2 px-4 py-2 bg-elevated border ${tone.border} rounded-control shadow-toast text-body text-primary ${exiting ? "anim-exit" : "anim-toast"}`}
        >
          {Icon && <Icon size={16} className={tone.iconClass} />}
          <span>{current.msg}</span>
          {current.action && (
            <button
              type="button"
              onClick={() => { current.action!.onClick(); dismiss(); }}
              className="ml-1 text-caption font-medium text-[var(--accent-text)] hover:underline"
            >
              {current.action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}
