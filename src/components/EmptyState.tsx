import type { ReactNode } from "react";
import Button from "./Button";

interface Props {
  size: "module" | "card";
  text?: string;
  icon?: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
  cta?: { label: string; onClick: () => void; icon?: ReactNode };
  /** Fill the parent and center vertically — for pane-level empty/error states. */
  fill?: boolean;
}

export default function EmptyState({
  size,
  text,
  icon,
  title,
  description,
  actions,
  cta,
  fill,
}: Props) {
  if (size === "card") {
    return (
      <div className="px-2 py-3 flex flex-col items-center gap-1">
        {icon}
        <p className="text-caption text-faint text-center">{description ?? text}</p>
      </div>
    );
  }
  const body = description ?? text;
  const actionsNode = actions ?? (cta && (
    <Button variant="primary" size="sm" onClick={cta.onClick}>
      {cta.icon}
      {cta.label}
    </Button>
  ));
  return (
    <div
      className={`flex flex-col items-center gap-3 px-8 text-center anim-fade-in ${
        fill ? "h-full min-h-0 flex-1 justify-center" : "mt-20"
      }`}
    >
      {icon}
      {title && <h2 className="text-section font-semibold text-primary">{title}</h2>}
      {body && <p className="text-center text-body text-muted max-w-lg">{body}</p>}
      {actionsNode && <div className="flex flex-wrap items-center justify-center gap-2">{actionsNode}</div>}
    </div>
  );
}
