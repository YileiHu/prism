import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ImageSize } from "../editor/imageSize";
import type { EmbedLabels } from "./EmbedCard";
import { EMBED_SIZE_MAX, EMBED_SIZE_MIN, EMBED_SIZE_STEP, clampEmbedSize } from "./model";

const SIZE_MIN = EMBED_SIZE_MIN;
const SIZE_MAX = EMBED_SIZE_MAX;
const SIZE_STEP = EMBED_SIZE_STEP;

interface Props {
  value: ImageSize | null;
  labels: EmbedLabels;
  onPreview: (width: number) => void;
  onCommit: (size: ImageSize | null) => void;
  // The card resizes while dragging, which would move this slider under a
  // stationary pointer; the owner freezes the toolbar at the given rect.
  onDragChange?: (rect: DOMRect | null) => void;
}

export default function EmbedSizeSlider({ value, labels, onPreview, onCommit, onDragChange }: Props) {
  const [local, setLocal] = useState(() => clampEmbedSize(value)?.width ?? SIZE_MAX);
  const inputRef = useRef<HTMLInputElement>(null);
  const callbacksRef = useRef({ onPreview, onCommit });
  callbacksRef.current = { onPreview, onCommit };
  const dragRef = useRef(onDragChange);
  dragRef.current = onDragChange;

  useEffect(() => {
    const next = clampEmbedSize(value)?.width ?? SIZE_MAX;
    setLocal(next);
    if (inputRef.current) inputRef.current.value = String(next);
  }, [value?.width]);

  // Native events: `input` previews while dragging, `change` fires on release.
  // React's onChange maps to `input` for ranges, which would commit (and rebuild
  // this widget) on every step mid-drag.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const readWidth = () => clampEmbedSize({ width: Number(input.value) })!.width;
    const preview = () => {
      const width = readWidth();
      setLocal(width);
      callbacksRef.current.onPreview(width);
    };
    const commit = () => {
      const width = readWidth();
      dragRef.current?.(null);
      callbacksRef.current.onCommit({ width });
    };
    const freeze = () => {
      const toolbar = input.closest(".md-embed-toolbar");
      dragRef.current?.(toolbar?.getBoundingClientRect() ?? null);
    };
    // Unfreeze on the next task so a pending `change` still reads the frozen
    // geometry (releasing without moving the thumb may skip `change` entirely).
    let unfreezeTimer = 0;
    const unfreeze = () => {
      window.clearTimeout(unfreezeTimer);
      unfreezeTimer = window.setTimeout(() => dragRef.current?.(null), 0);
    };
    input.addEventListener("pointerdown", freeze);
    input.addEventListener("input", preview);
    input.addEventListener("change", commit);
    input.addEventListener("keyup", commit); // keyboard steps: not every browser fires change
    input.addEventListener("pointerup", unfreeze);
    input.addEventListener("pointercancel", unfreeze);
    input.addEventListener("blur", unfreeze);
    return () => {
      window.clearTimeout(unfreezeTimer);
      input.removeEventListener("pointerdown", freeze);
      input.removeEventListener("input", preview);
      input.removeEventListener("change", commit);
      input.removeEventListener("keyup", commit);
      input.removeEventListener("pointerup", unfreeze);
      input.removeEventListener("pointercancel", unfreeze);
      input.removeEventListener("blur", unfreeze);
    };
  }, []);

  const progress = ((local - SIZE_MIN) / (SIZE_MAX - SIZE_MIN)) * 100;

  return (
    <div className="md-embed-size">
      <input
        ref={inputRef}
        type="range"
        min={SIZE_MIN}
        max={SIZE_MAX}
        step={SIZE_STEP}
        defaultValue={local}
        title={labels.size}
        aria-label={labels.size}
        className="md-embed-size-slider"
        style={{ "--slider-progress": `${progress}%` } as CSSProperties}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") event.currentTarget.blur();
        }}
      />
      <span className="md-embed-size-value">{local}px</span>
    </div>
  );
}
