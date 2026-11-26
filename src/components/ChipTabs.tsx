import { useLayoutEffect, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuItem } from "./DropdownMenu";
import { useT } from "../i18n";
import { useSlidingThumb } from "./useSlidingThumb";

export interface ChipTab<T extends string | number> {
  key: T;
  label: string;
  /** Small value after the label, e.g. a weight percentage. */
  meta?: string;
  /** Leading colour dot; pass a resolved CSS colour. */
  dot?: string;
  /** Overrides the thumb/text colours (season themes need their own palette). */
  tone?: { background: string; color: string };
  disabled?: boolean;
}

interface Props<T extends string | number> {
  items: readonly ChipTab<T>[];
  value: T | null;
  onChange: (key: T | null) => void;
  /** Adds a leading chip mapped to `null` (e.g. "all"). */
  allLabel?: string;
  /**
   * Measure how many chips the track holds, keep those and move the rest into
   * a "more" menu. The visible chips stretch, so the track is always full.
   */
  collapse?: boolean;
  /** Rendered after the track, pushed to the right (e.g. an edit button). */
  trailing?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

const CHIP_BASE =
  "relative flex items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-[5px] px-2.5 py-[5px] leading-none text-caption";

/**
 * One recessed track with a single raised chip that slides between items — the
 * same physical language as `SegmentedToggle`, sized for longer lists.
 *
 * Chips always fill the track. With `collapse` the strip measures how many fit
 * at their natural width (off-screen mirror) and puts the rest into a "more"
 * menu, so long lists neither scroll nor leave empty track; the active chip
 * keeps its label on the "more" chip while it is hidden in the menu.
 */
export default function ChipTabs<T extends string | number>({
  items,
  value,
  onChange,
  allLabel,
  collapse = false,
  trailing,
  className = "",
  ariaLabel,
}: Props<T>) {
  const { t } = useT();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);

  const hasAll = allLabel !== undefined;
  const total = items.length + (hasAll ? 1 : 0);
  const collapsing = collapse && total > 1;

  const [fitCount, setFitCount] = useState(total);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreMeasureRef = useRef<HTMLButtonElement>(null);

  const visibleCount = collapsing ? Math.min(fitCount, total) : total;

  const itemIndex = value === null ? -1 : items.findIndex((item) => item.key === value);
  const activeIndex =
    value === null
      ? hasAll
        ? 0
        : -1
      : itemIndex >= 0
        ? itemIndex + (hasAll ? 1 : 0)
        : -1;
  const activeInMenu = collapsing && activeIndex >= visibleCount;
  const thumbIndex = activeInMenu ? visibleCount : activeIndex;
  const signature = `${allLabel ?? ""}|${items
    .map((item) => `${item.key}:${item.label}`)
    .join("|")}|${visibleCount}`;
  const { containerRef, setItemRef, thumb } = useSlidingThumb(thumbIndex, signature);

  const activeItem = itemIndex >= 0 ? items[itemIndex] : undefined;
  const activeTone = activeItem?.tone;
  const hiddenStart = visibleCount - (hasAll ? 1 : 0);

  // A menu that outlives a selection change would cover the new chip.
  useEffect(() => {
    setMoreOpen(false);
  }, [value]);

  // How many chips fit at their natural width? Measured off-screen so the count
  // is exact for the current font and labels, not a fixed guess.
  useLayoutEffect(() => {
    if (!collapsing) {
      setFitCount(total);
      return;
    }
    const scroller = containerRef.current;
    const measure = measureRef.current;
    if (!scroller || !measure) return;
    const compute = () => {
      const available = scroller.clientWidth;
      const nodes = Array.from(measure.children) as HTMLElement[];
      if (nodes.length === 0 || available <= 0) return;
      const widths = nodes.map((node) => node.offsetWidth);
      let count = 0;
      let used = 0;
      for (const width of widths) {
        if (used + width <= available) {
          used += width;
          count += 1;
        } else {
          break;
        }
      }
      if (count < widths.length) {
        const moreWidth = moreMeasureRef.current?.offsetWidth ?? 0;
        while (count > 1 && used + moreWidth > available) {
          count -= 1;
          used -= widths[count];
        }
        count = Math.max(1, count);
      } else {
        count = widths.length;
      }
      setFitCount((previous) => (previous === count ? previous : count));
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [collapsing, total, containerRef, signature, allLabel]);

  const chipClass = (active: boolean, disabled = false) =>
    `${CHIP_BASE} min-w-0 flex-1 ${active ? "" : "text-muted hover:text-secondary"} ${
      disabled ? "cursor-not-allowed opacity-40" : ""
    }`;

  const chipContent = (item: ChipTab<T>) => (
    <>
      {item.dot && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: item.dot }}
        />
      )}
      <span className="truncate">{item.label}</span>
      {item.meta && <span className="flex-shrink-0 tabular-nums opacity-70">{item.meta}</span>}
    </>
  );

  const renderChip = (index: number) => {
    if (hasAll && index === 0) {
      const active = value === null;
      return (
        <button
          key="__all__"
          ref={setItemRef(index)}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onChange(null)}
          className={chipClass(active)}
        >
          <span className="truncate">{allLabel}</span>
        </button>
      );
    }
    const item = items[index - (hasAll ? 1 : 0)];
    if (!item) return null;
    const active = item.key === value;
    return (
      <button
        key={String(item.key)}
        ref={setItemRef(index)}
        type="button"
        role="tab"
        aria-selected={active}
        disabled={item.disabled}
        onClick={() => onChange(active ? null : item.key)}
        className={chipClass(active, item.disabled)}
        style={active && item.tone ? { color: item.tone.color } : undefined}
      >
        {chipContent(item)}
      </button>
    );
  };

  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`} role="presentation">
      <div className="segmented-toggle relative min-w-0 flex-1 rounded-control border p-[3px]">
        <div ref={containerRef} role="tablist" aria-label={ariaLabel} className="relative flex w-full">
          {thumb && (
            <span
              aria-hidden
              className="segmented-thumb pointer-events-none absolute left-0 top-0 rounded-[5px] transition-[transform,width] duration-200 ease-out motion-reduce:transition-none"
              style={{
                transform: `translate(${thumb.left}px, ${thumb.top}px)`,
                width: thumb.width,
                height: thumb.height,
                ...(activeTone ? { background: activeTone.background } : {}),
              }}
            />
          )}

          {Array.from({ length: visibleCount }, (_, index) => renderChip(index))}

          {collapsing && visibleCount < total && (
            <button
              ref={(node) => {
                setItemRef(visibleCount)(node);
                moreRef.current = node;
              }}
              type="button"
              role="tab"
              aria-selected={activeInMenu}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
              className={chipClass(activeInMenu)}
            >
              <span className="max-w-[10rem] truncate">
                {activeInMenu ? (activeItem?.label ?? t["common.more"]) : t["common.more"]}
              </span>
              <ChevronDown size={12} className="flex-shrink-0 opacity-70" />
            </button>
          )}
        </div>
      </div>

      {/* Off-screen mirror used only for measuring natural chip widths. */}
      {collapsing && (
        <>
          <div
            ref={measureRef}
            aria-hidden
            className="pointer-events-none invisible fixed left-[-9999px] top-0 flex"
          >
            {hasAll && (
              <button type="button" tabIndex={-1} className={`${CHIP_BASE} flex-shrink-0`}>
                {allLabel}
              </button>
            )}
            {items.map((item) => (
              <button
                key={String(item.key)}
                type="button"
                tabIndex={-1}
                className={`${CHIP_BASE} flex-shrink-0`}
              >
                {chipContent(item)}
              </button>
            ))}
          </div>
          <button
            ref={moreMeasureRef}
            type="button"
            tabIndex={-1}
            aria-hidden
            className={`pointer-events-none invisible fixed left-[-9999px] top-0 flex-shrink-0 ${CHIP_BASE}`}
          >
            <span>{t["common.more"]}</span>
            <ChevronDown size={12} className="flex-shrink-0" />
          </button>
        </>
      )}

      {trailing && <div className="flex flex-shrink-0 items-center">{trailing}</div>}

      {collapsing && (
        <DropdownMenu open={moreOpen} onClose={() => setMoreOpen(false)} anchorRef={moreRef}>
          {items.slice(hiddenStart).map((item) => (
            <DropdownMenuItem
              key={String(item.key)}
              active={item.key === value}
              onClick={() => {
                onChange(item.key);
                setMoreOpen(false);
              }}
            >
              <span className="flex min-w-0 items-center gap-2">
                {item.dot && (
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: item.dot }}
                  />
                )}
                <span className="truncate">{item.label}</span>
                {item.meta && <span className="ml-1 text-caption text-faint">{item.meta}</span>}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenu>
      )}
    </div>
  );
}
