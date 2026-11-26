import { useRef, type CSSProperties } from "react";
import { ImageIcon } from "lucide-react";
import Button from "../Button";
import ImagePickActions from "../ImagePickActions";
import { useT } from "../../i18n";
import { growthCoverUrl } from "../../lib/growth";
import { coverImageStyle, normalizeCoverTransform } from "../../lib/imageFocus";
import useImagePickAction from "../../lib/useImagePickAction";
import type { GrowthCoverTransform } from "../../shared/models";

export type GrowthImageRatio = "poster" | "card" | "square" | "portrait" | "wide";

interface Props {
  value: string;
  onChange: (name: string) => void;
  pick: (title?: string) => Promise<string | null>;
  dialogTitle: string;
  pickLabel: string;
  /** Shown instead of `pickLabel` when an image is already selected. */
  changeLabel?: string;
  removeLabel: string;
  ratio?: GrowthImageRatio;
  /** Pan/zoom is only useful for hero images; cards can keep a plain preview. */
  crop?: boolean;
  transform?: GrowthCoverTransform | null;
  onTransformChange?: (transform: GrowthCoverTransform | null) => void;
}

const RATIO_CLASSES: Record<GrowthImageRatio, string> = {
  poster: "h-28 w-full",
  card: "aspect-[16/10] w-full",
  square: "aspect-square w-full",
  portrait: "aspect-[3/4] w-full",
  wide: "aspect-[21/9] w-full",
};

/**
 * One image field for growth forms: pick / replace / remove, optional pan/zoom,
 * the same object-position math as the poster/card renderers, and the shared
 * draft-file cleanup owned by `useGrowthCoverDraft` at the call site.
 */
export default function GrowthImageField({
  value,
  onChange,
  pick,
  dialogTitle,
  pickLabel,
  changeLabel,
  removeLabel,
  ratio = "card",
  crop = false,
  transform,
  onTransformChange,
}: Props) {
  const { t } = useT();
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);
  const current = normalizeCoverTransform(transform);
  const interactive = crop && value !== "" && onTransformChange !== undefined;

  const update = (patch: Partial<GrowthCoverTransform>) => {
    onTransformChange?.({ ...current, ...patch });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !boxRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: current.x,
      y: current.y,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    const drag = dragRef.current;
    if (!box || !drag || drag.pointerId !== event.pointerId) return;
    const rect = box.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    // Dragging right shows more of the left side, so the focal point moves left.
    update({
      x: clamp(drag.x - (event.clientX - drag.startX) / rect.width),
      y: clamp(drag.y - (event.clientY - drag.startY) / rect.height),
    });
  };

  const stopDrag = () => {
    dragRef.current = null;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const step = 0.02;
    const zoomStep = 0.1;
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    const clampScale = (value: number) => Math.min(3, Math.max(1, value));
    let next: GrowthCoverTransform | null = null;

    if (event.key === "ArrowLeft") next = { ...current, x: clamp(current.x - step) };
    else if (event.key === "ArrowRight") next = { ...current, x: clamp(current.x + step) };
    else if (event.key === "ArrowUp") next = { ...current, y: clamp(current.y - step) };
    else if (event.key === "ArrowDown") next = { ...current, y: clamp(current.y + step) };
    else if (event.key === "+" || event.key === "=") {
      next = { ...current, scale: clampScale(current.scale + zoomStep) };
    } else if (event.key === "-") {
      next = { ...current, scale: clampScale(current.scale - zoomStep) };
    }

    if (!next) return;
    event.preventDefault();
    onTransformChange?.(next);
  };

  const handleChange = (name: string) => {
    if (!name) onTransformChange?.(null);
    onChange(name);
  };

  const pickForField = async (title: string) => {
    const picked = await pick(title);
    if (picked) onTransformChange?.(null);
    return picked;
  };
  const placeholderPicker = useImagePickAction({ onPick: pickForField, onChange });

  return (
    <div className="space-y-1.5">
      <div
        ref={boxRef}
        role={interactive ? "group" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? t["growth.image.dragHint"] : undefined}
        onPointerDown={interactive ? onPointerDown : undefined}
        onPointerMove={interactive ? onPointerMove : undefined}
        onPointerUp={interactive ? stopDrag : undefined}
        onPointerCancel={interactive ? stopDrag : undefined}
        onKeyDown={interactive ? onKeyDown : undefined}
        className={`relative overflow-hidden rounded-card border border-strong/40 bg-elevated ${RATIO_CLASSES[ratio]} ${
          interactive
            ? "cursor-grab touch-none select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] active:cursor-grabbing"
            : ""
        }`}
      >
        {value ? (
          <img
            src={growthCoverUrl(value)}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
            style={coverImageStyle(transform)}
          />
        ) : (
          <Button
            variant="ghost"
            className="h-full w-full flex-col gap-1 rounded-card p-0 text-faint hover:bg-elevated/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
            style={{ transform: "scale(1)" }}
            title={pickLabel}
            aria-label={pickLabel}
            disabled={placeholderPicker.busy}
            onClick={() => void placeholderPicker.pick(dialogTitle)}
          >
            <ImageIcon size={20} />
            <span className="text-caption">{t["growth.image.empty"]}</span>
          </Button>
        )}

        {value && (
          <div
            className="absolute right-2 top-2 z-10 flex items-center gap-1"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <ImagePickActions
              value={value}
              onChange={handleChange}
              onPick={pickForField}
              pickLabel={changeLabel ?? pickLabel}
              removeLabel={removeLabel}
              dialogTitle={dialogTitle}
            />
          </div>
        )}
      </div>

      {interactive && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-shrink-0 text-caption text-faint">{t["growth.image.zoom"]}</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={current.scale}
            aria-label={t["growth.image.zoom"]}
            onChange={(event) => update({ scale: Number(event.target.value) })}
            className="min-w-[80px] flex-1"
            style={
              {
                "--slider-progress": `${((current.scale - 1) / 2) * 100}%`,
              } as CSSProperties
            }
          />
          <span className="w-10 flex-shrink-0 text-right text-caption tabular-nums text-faint">
            {Math.round(current.scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update({ x: 0.5, y: 0.5, scale: 1 })}
          >
            {t["growth.image.reset"]}
          </Button>
        </div>
      )}
    </div>
  );
}
