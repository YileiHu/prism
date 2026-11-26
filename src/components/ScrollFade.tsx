interface Props {
  /** Which edge this fade covers; place it first/last in the scroll container. */
  side: "top" | "bottom" | "left" | "right";
  /** Whether content is hidden past that edge; driven by the edge hook. */
  visible: boolean;
}

/**
 * Edge fade for the whole dialog content body whose scrollbar is hidden: it
 * sinks the first or last rows into the surface so "there is more this way"
 * still reads at a glance. The element is sticky and height-neutral, so it
 * overlays content without adding scroll length.
 *
 * This is reserved for the outer dialog content body (header/footer stay
 * pinned). Lists and inset wells inside a dialog use a normal scrollbar
 * instead — do not nest edge fades there.
 */
export default function ScrollFade({ side, visible }: Props) {
  return (
    <div
      aria-hidden
      className={`scroll-fade-${side} ${visible ? "opacity-100" : "opacity-0"}`}
    />
  );
}
