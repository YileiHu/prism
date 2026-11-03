import { useEffect, useRef, useState, type ReactNode } from "react";
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

const CONTROLS_INLINE_MIN = 1080;
const ALL_INLINE_MIN = 760;

export default function AppToolbar({ scopeKey, fallback, sidebar }: Props) {
  const { t } = useT();
  const contribution = useToolbar(scopeKey);
  const model = contribution ?? fallback;
  const barRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState(Infinity);
  const [moreOpen, setMoreOpen] = useState(false);

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

  if (!model) return null;

  const overflowControls = width < CONTROLS_INLINE_MIN;
  const overflowAll = width < ALL_INLINE_MIN;
  const hasOverflow = (overflowAll && (model.controls || model.actions))
    || (overflowControls && !overflowAll && model.controls);

  const overflowContent: ReactNode = (
    <>
      {overflowControls && model.controls && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-line/40 last:border-b-0">
          {model.controls}
        </div>
      )}
      {overflowAll && model.actions && (
        <div className="flex items-center gap-1 px-2 py-1.5">{model.actions}</div>
      )}
    </>
  );

  return (
    <div
      ref={barRef}
      className="h-11 flex-shrink-0 flex items-center gap-2 px-3 border-b border-line/50 glass bg-tint/[0.04]"
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
      <div className="min-w-0 flex-1 flex items-center gap-2">
        {model.title}
        {model.subtitle}
      </div>
      {!overflowControls && model.controls && (
        <div className="flex items-center gap-1.5 flex-shrink-0">{model.controls}</div>
      )}
      {!overflowControls && model.controls && model.actions && !overflowAll && (
        <div className="w-px h-5 bg-line/70 flex-shrink-0" />
      )}
      {model.actions && !overflowAll && (
        <div className="flex items-center gap-1 flex-shrink-0">{model.actions}</div>
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
