import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  /** Tabs keep their pill silhouette; every list row uses the control radius. */
  shape?: "row" | "pill";
}

// One chrome for every drag preview: same accent edge, elevated surface,
// shadow and opacity. Callers keep their own content/layout inside.
export default function DragPreview({ children, className = "", shape = "row" }: Props) {
  const radius = shape === "pill" ? "rounded-full" : "rounded-control";
  return (
    <div
      className={`border-2 border-[var(--accent)] bg-elevated shadow-drag ${radius} ${className}`}
    >
      {children}
    </div>
  );
}
