import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import Button from "./Button";
import { useAnimatedMount } from "../lib/useAnimatedMount";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  icon?: ReactNode;
  width?: string;
  position?: "top" | "center";
  children: ReactNode;
  footer?: ReactNode;
}

export default function Modal({
  open,
  onClose,
  title,
  icon,
  width = "420px",
  position = "top",
  children,
  footer,
}: ModalProps) {
  const { mounted, exiting } = useAnimatedMount(open, 100);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex ${
        position === "center" ? "items-center" : "items-start"
      } justify-center ${position === "top" ? "pt-[20vh]" : ""}`}
    >
      <div
        className={`fixed inset-0 bg-overlay/60 glass-overlay ${exiting ? "anim-exit" : "anim-overlay"}`}
        onClick={onClose}
      />
      <div
        className={`relative glass bg-surface/85 border border-strong rounded-xl shadow-2xl p-6 ${exiting ? "anim-exit-pop" : "anim-pop"}`}
        style={{ width }}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              {icon}
              <h2 className="text-base font-semibold text-primary">{title}</h2>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X size={18} />
            </Button>
          </div>
        )}
        {children}
        {footer !== undefined && (
          <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-line">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
