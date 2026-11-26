import { useEffect, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X, type LucideIcon } from "lucide-react";
import Button from "./Button";
import ScrollFade from "./ScrollFade";
import { useAnimatedMount } from "../lib/useAnimatedMount";
import { useScrollEdges } from "../lib/useScrollEdges";
import {
  registerModalLayer,
  setModalLayerExiting,
  useModalLayer,
} from "../lib/modalStack";
import { useT } from "../i18n";

type ModalSize = "sm" | "md" | "lg";

/**
 * `dialog` is the classic centered panel: fixed header/footer, scrollable body.
 * `document` fills the window and uses the same pinned header/footer body.
 */
type ModalLayout = "dialog" | "document";

const SIZE_WIDTHS: Record<ModalSize, string> = {
  sm: "400px",
  md: "520px",
  lg: "600px",
};

/**
 * Space between the document panel and the window on every side. Keep the
 * documented values in `docs/guides/ui-kit.md` in sync when changing this.
 */
const DOCUMENT_MARGIN = 64;

const DOCUMENT_WIDTH = `calc(100vw - ${DOCUMENT_MARGIN * 2}px)`;
const DOCUMENT_HEIGHT = `calc(100vh - ${DOCUMENT_MARGIN * 2}px)`;

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  icon?: LucideIcon;
  width?: string;
  size?: ModalSize;
  /** `document` fills the window; both layouts pin the header/footer and scroll the body. */
  layout?: ModalLayout;
  /** Defaults to center; `top` is reserved for an explicitly top-aligned picker. */
  position?: "top" | "center";
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Non-destructive icon actions shown next to the title, before the close button. */
  headerActions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Every dialog goes through this component, so layering is centralized in
 * `modalStack.ts`: only the top layer handles Escape, lower layers are inert,
 * and the exit animation keeps its stack slot until it actually unmounts.
 */
export default function Modal({
  open,
  onClose,
  title,
  icon: Icon,
  width,
  size,
  layout = "dialog",
  position = "center",
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialFocusRef,
  headerActions,
  children,
  footer,
}: ModalProps) {
  const { t } = useT();
  const { mounted, exiting } = useAnimatedMount(open, 100);
  const isDocument = layout === "document";
  const panelRef = useRef<HTMLDivElement>(null);
  const [setBodyScrollEl, bodyScrollEdges] = useScrollEdges<HTMLDivElement>();
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const layerId = useId();
  const { depth, isTop } = useModalLayer(layerId);
  const isTopRef = useRef(isTop);
  isTopRef.current = isTop;
  // Keep the covered dialog's backdrop and fade the new top backdrop in. The
  // background gets darker (two layers are ~84%) but the covered panel dims
  // smoothly and the background never brightens first.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const openRef = useRef(open);
  openRef.current = open;
  const closeOnEscapeRef = useRef(closeOnEscape);
  closeOnEscapeRef.current = closeOnEscape;

  // Capture the trigger before this dialog makes any dialog underneath inert.
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    // A rapid close/reopen can fire while focus is still inside this panel;
    // keep the original trigger instead of restoring to a node that is about
    // to be replaced.
    if (active instanceof HTMLElement && panelRef.current?.contains(active)) return;
    restoreFocusRef.current = active instanceof HTMLElement ? active : null;
  }, [open]);

  useLayoutEffect(() => {
    if (!mounted) return;
    return registerModalLayer(layerId, {
      getOnClose: () => {
        if (openRef.current) onCloseRef.current();
      },
      getCloseOnEscape: () => openRef.current && closeOnEscapeRef.current,
    });
  }, [mounted, layerId]);

  useEffect(() => {
    if (mounted) setModalLayerExiting(layerId, exiting);
  }, [mounted, exiting, layerId]);

  useEffect(() => {
    if (!open || !mounted) return;

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
    };
  }, [open, mounted, initialFocusRef]);

  const wasMountedRef = useRef(mounted);
  useEffect(() => {
    const wasMounted = wasMountedRef.current;
    wasMountedRef.current = mounted;
    if (!wasMounted || mounted) return;
    // Restore after the exit animation, when a covered dialog is no longer
    // inert. A dialog that was never on top must not steal focus from the
    // one above it.
    if (!isTopRef.current) return;
    // Wait for the stack pop and the lower dialog's inert removal to commit
    // before focusing back into it.
    let retry = 0;
    let raf = 0;
    const restore = () => {
      const target = restoreFocusRef.current;
      if (!target || !target.isConnected) return;
      const activeDialog = document.querySelector<HTMLElement>(
        '[role="dialog"][aria-modal="true"]',
      );
      // A newer dialog may have opened while this one was exiting; don't steal
      // focus from it.
      if (activeDialog && !activeDialog.contains(target)) return;
      target.focus();
      // The lower dialog may still be inert for one more paint after the stack
      // pop; retry once it has been released.
      if (document.activeElement !== target && retry < 1) {
        retry += 1;
        raf = requestAnimationFrame(restore);
      }
    };
    const timer = setTimeout(restore, 0);
    return () => {
      clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mounted]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !isTop) return;
    const panel = panelRef.current;
    if (!panel) return;
    // React portals bubble events through the React tree, so a dialog opened
    // from inside this one can reach this handler. Only trap Tab for our own
    // DOM subtree.
    if (!(e.target instanceof Node) || !panel.contains(e.target)) return;

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

  const panelWidth =
    width ?? (isDocument ? DOCUMENT_WIDTH : size ? SIZE_WIDTHS[size] : "420px");
  const topAligned = position === "top" && !isDocument;

  const header =
    title !== undefined ? (
      <div className="mb-5 flex flex-shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {Icon && <Icon size={18} className="flex-shrink-0 text-[var(--accent-text)]" />}
          <h2 id={titleId} className="min-w-0 truncate text-section font-semibold text-primary">{title}</h2>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {headerActions}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            title={t["common.close"]}
            aria-label={t["common.close"]}
          >
            <X size={18} />
          </Button>
        </div>
      </div>
    ) : null;

  const footerNode =
    footer !== undefined ? (
      <div
        className={`flex justify-end gap-3 ${
          isDocument ? "mt-4 flex-shrink-0" : "mt-5 flex-shrink-0"
        }`}
      >
        {footer}
      </div>
    ) : null;

  return createPortal(
    <div
      className={`fixed inset-0 flex ${
        topAligned ? "items-start pt-[20vh]" : "items-center"
      } justify-center`}
      style={{ zIndex: 50 + depth }}
      data-modal-layer={depth}
      inert={!isTop}
      aria-hidden={!isTop || undefined}
    >
      <div
        className={`fixed inset-0 bg-overlay/60 ${exiting ? "anim-exit" : "anim-overlay"}`}
        onClick={isTop && !exiting && closeOnBackdrop ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={isTop}
        aria-labelledby={title !== undefined ? titleId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`relative bg-surface border border-strong rounded-card shadow-modal ${isDocument ? "p-4" : "p-6"} focus:outline-none flex flex-col overflow-hidden ${
          isDocument ? "" : "max-h-[calc(100vh-48px)]"
        } ${exiting ? "anim-exit-pop" : "anim-pop"}`}
        style={{
          width: panelWidth,
          ...(isDocument ? { height: DOCUMENT_HEIGHT, maxHeight: DOCUMENT_HEIGHT } : {}),
        }}
      >
        {header}
        <div
          ref={setBodyScrollEl}
          className="relative min-h-0 flex-auto overflow-y-auto scrollbar-none"
        >
          <ScrollFade side="top" visible={bodyScrollEdges.top} />
          {children}
          <ScrollFade side="bottom" visible={bodyScrollEdges.bottom} />
        </div>
        {footerNode}
      </div>
    </div>,
    document.body,
  );
}
