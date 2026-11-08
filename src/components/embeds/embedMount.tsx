import { createRoot } from "react-dom/client";
import EmbedCard, { type EmbedCardProps } from "./EmbedCard";

// Embeds are mounted into raw HTML hosts (reading view) and CodeMirror widget
// DOM (edit mode) through an independent React root — the card never reaches
// for application hooks, so theme comes from CSS variables and copy/callbacks
// arrive as props.
export function mountEmbedCard(host: HTMLElement, props: EmbedCardProps): () => void {
  let root: ReturnType<typeof createRoot> | null = null;
  let disposed = false;
  // Reading mode mounts from useEffect, and StrictMode runs effects twice
  // (setup → cleanup → setup). A root unmounted before its first render
  // commits is discarded by React and the second setup then renders nothing
  // (react#37804), so create the root after the double-invoke settles.
  const frame = requestAnimationFrame(() => {
    if (disposed) return;
    root = createRoot(host);
    root.render(<EmbedCard {...props} />);
  });
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    root?.unmount();
  };
}
