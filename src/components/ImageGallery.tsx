import { useCallback, useEffect, useRef } from "react";
import ScrollFade from "./ScrollFade";
import { useHorizontalScrollEdges } from "../lib/useScrollEdges";

interface GalleryImage {
  src: string;
  alt?: string;
}

interface Props {
  images: GalleryImage[];
  className?: string;
  imageClassName?: string;
}

/**
 * Horizontal image strip: wheel scrolls the strip, the scrollbar is hidden,
 * and the left/right edges fade like the rest of the modal's scroll areas.
 */
export default function ImageGallery({ images, className = "", imageClassName = "" }: Props) {
  const [setScrollEl, edges] = useHorizontalScrollEdges<HTMLDivElement>();
  const cleanupRef = useRef<(() => void) | null>(null);

  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      setScrollEl(element);
      if (!element) return;
      const onWheel = (event: WheelEvent) => {
        const max = element.scrollWidth - element.clientWidth;
        if (max <= 0) return;
        const delta =
          Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        if (delta === 0) return;
        const next = Math.max(0, Math.min(max, element.scrollLeft + delta));
        if (next === element.scrollLeft) return;
        event.preventDefault();
        element.scrollLeft = next;
      };
      element.addEventListener("wheel", onWheel, { passive: false });
      cleanupRef.current = () => element.removeEventListener("wheel", onWheel);
    },
    [setScrollEl],
  );

  useEffect(() => () => cleanupRef.current?.(), []);

  if (images.length === 0) return null;
  if (images.length === 1) {
    return (
      <img
        src={images[0].src}
        alt={images[0].alt ?? ""}
        className={`h-[32vh] w-full rounded-card border border-line/60 bg-elevated object-cover ${className} ${imageClassName}`}
      />
    );
  }
  return (
    <div
      ref={attach}
      className={`relative flex w-full min-w-0 gap-3 overflow-x-auto scrollbar-none ${className}`}
    >
      <ScrollFade side="left" visible={edges.left} />
      {images.map((image, index) => (
        <img
          key={`${image.src}-${index}`}
          src={image.src}
          alt={image.alt ?? ""}
          className={`h-[32vh] w-auto max-w-none flex-none rounded-card border border-line/60 bg-elevated object-cover ${imageClassName}`}
        />
      ))}
      <ScrollFade side="right" visible={edges.right} />
    </div>
  );
}
