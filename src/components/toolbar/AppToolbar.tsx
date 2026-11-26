import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useToolbar, type ToolbarContribution } from "./ToolbarProvider";
import { DropdownMenu } from "../DropdownMenu";
import Button from "../Button";
import { useT } from "../../i18n";

interface Props {
  scopeKey: string;
  fallback?: ToolbarContribution;
  sidebar?: { collapsed: boolean; onToggle: () => void };
}

/** How much of the bar is inline. Derived from measured widths, not breakpoints. */
type Stage = "all" | "controls" | "none";

export default function AppToolbar({ scopeKey, fallback, sidebar }: Props) {
  const { t } = useT();
  const contribution = useToolbar(scopeKey);
  const model = contribution ?? fallback;
  const barRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState(Infinity);
  const [stage, setStage] = useState<Stage>("all");
  const [moreOpen, setMoreOpen] = useState(false);
  // The width the current inline measurement was taken at.
  const measuredWidth = useRef(-1);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? el.clientWidth);
    });
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // A different page means different content: re-measure from scratch.
    measuredWidth.current = -1;
    setStage("all");
    setMoreOpen(false);
  }, [scopeKey]);

  // Fit the real content instead of guessing from the window width: the same
  // bar can hold a lot on one page (small labels) and nothing on another.
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const widthNow = bar.clientWidth;
    if (stage !== "all") {
      // A width change invalidates the cached measurement: go back inline once,
      // measure, then decide again.
      if (measuredWidth.current === widthNow) return;
      setStage("all");
      return;
    }
    // The left group is `flex-1`, so its own width is already stretched to the
    // available space. Measure its children instead to get the natural width.
    const leftElement = leftRef.current;
    const left = leftElement
      ? Array.from(leftElement.children).reduce(
          (sum, child) => sum + (child as HTMLElement).scrollWidth,
          0,
        ) + Math.max(0, leftElement.children.length - 1) * 8
      : 0;
    const controls = controlsRef.current?.offsetWidth ?? 0;
    const actions = actionsRef.current?.offsetWidth ?? 0;
    measuredWidth.current = widthNow;

    const chrome = 56 + (sidebar ? 40 : 0); // padding, gaps, divider, sidebar toggle
    const moreWidth = 40; // the "more" button that appears once anything collapses
    const neededAll = left + controls + actions + chrome;
    if (neededAll <= widthNow) return;
    // Controls go first; the actions stay until even that does not fit.
    if (left + actions + chrome + moreWidth <= widthNow) {
      setStage("controls");
      return;
    }
    setStage("none");
  }, [stage, width, model, sidebar]);

  if (!model) return null;

  const overflowControls = stage !== "all";
  const overflowActions = stage === "none";
  const hasOverflow = overflowControls || overflowActions;

  const overflowContent: ReactNode = (
    <>
      {overflowControls && model.controls && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-line/40 last:border-b-0">
          {model.controls}
        </div>
      )}
      {overflowActions && model.actions && (
        <div className="flex items-center gap-1 px-2 py-1.5">{model.actions}</div>
      )}
    </>
  );

  return (
    <div
      ref={barRef}
      className="relative z-10 h-11 flex-shrink-0 flex items-center gap-2 px-3 border-b border-strong/60 toolbar-band"
    >
      {sidebar && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={sidebar.onToggle}
          title={sidebar.collapsed ? t["collections.expandSidebar"] : t["collections.collapseSidebar"]}
        >
          {sidebar.collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </Button>
      )}
      <div ref={leftRef} className="min-w-0 flex-1 flex items-center gap-2">
        {model.title}
        {model.subtitle}
        {model.tabs && <div className="flex flex-shrink-0 items-center">{model.tabs}</div>}
      </div>
      {!overflowControls && model.controls && (
        <div ref={controlsRef} className="flex items-center gap-1.5 flex-shrink-0">
          {model.controls}
        </div>
      )}
      {!overflowControls && model.controls && model.actions && !overflowActions && (
        <div className="w-px h-5 bg-line/70 flex-shrink-0" />
      )}
      {!overflowActions && model.actions && (
        <div ref={actionsRef} className="flex items-center gap-1 flex-shrink-0">
          {model.actions}
        </div>
      )}
      {hasOverflow && (
        <>
          <Button
            ref={moreRef}
            variant="ghost"
            size="icon-sm"
            active={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
            title={t["toolbar.more"]}
          >
            <MoreHorizontal size={15} />
          </Button>
          <DropdownMenu open={moreOpen} onClose={() => setMoreOpen(false)} anchorRef={moreRef} align="right">
            {overflowContent}
          </DropdownMenu>
        </>
      )}
    </div>
  );
}
