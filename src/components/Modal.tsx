import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import Button from "./Button";
import { useAnimatedMount } from "../lib/useAnimatedMount";

type ModalSize = "sm" | "md" | "lg";

const SIZE_WIDTHS: Record<ModalSize, string> = {
  sm: "400px",
  md: "520px",
  lg: "600px",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  icon?: ReactNode;
  width?: string;
  size?: ModalSize;
  position?: "top" | "center";
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
  footer?: ReactNode;
}

export default function Modal({
  open,
  onClose,
  title,
  icon,
  width,
  size,
  position = "top",
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialFocusRef,
  children,
  footer,
}: ModalProps) {
  const { mounted, exiting } = useAnimatedMount(open, 100);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeOnEscape, onClose]);

  useEffect(() => {
    if (!open || !mounted) return;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const active = document.activeElement;
      // React's autoFocus already moved focus inside the dialog — keep it.
      if (!initialFocusRef?.current && active instanceof HTMLElement && active !== panel && panel.contains(active)) {
        return;
      }
      const target =
        initialFocusRef?.current ??
        panel.querySelector<HTMLElement>("[autofocus]") ??
        panel.querySelector<HTMLElement>(FOCUSABLE) ??
        panel;
      target.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      restoreFocusRef.current?.focus();
    };
  }, [open, mounted, initialFocusRef]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;

    const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (nodes.length === 0) {
      e.preventDefault();
      panel.focus();
      return;
    }

    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;

    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!mounted) return null;

  const panelWidth = width ?? (size ? SIZE_WIDTHS[size] : "420px");

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex ${
        position === "center" ? "items-center" : "items-start"
      } justify-center ${position === "top" ? "pt-[20vh]" : ""}`}
    >
      <div
        className={`fixed inset-0 bg-overlay/60 ${exiting ? "anim-exit" : "anim-overlay"}`}
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title !== undefined ? titleId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`relative bg-surface border border-strong rounded-card shadow-modal p-6 focus:outline-none ${exiting ? "anim-exit-pop" : "anim-pop"}`}
        style={{ width: panelWidth }}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              {icon}
              <h2 id={titleId} className="text-section font-semibold text-primary">{title}</h2>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X size={18} />
            </Button>
          </div>
        )}
        {children}
        {footer !== undefined && (
          <div className="flex justify-end gap-3 mt-5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
