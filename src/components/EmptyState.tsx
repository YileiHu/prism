import type { ReactNode } from "react";
import Button from "./Button";

interface Props {
  size: "module" | "card";
  text: string;
  cta?: { label: string; onClick: () => void; icon?: ReactNode };
}

export default function EmptyState({ size, text, cta }: Props) {
  if (size === "card") {
    return <p className="text-xs text-faint px-2 py-3 text-center">{text}</p>;
  }
  return (
    <div className="flex flex-col items-center gap-3 mt-20 anim-fade-in">
      <p className="text-center text-muted text-sm">{text}</p>
      {cta && (
        <Button variant="primary" size="sm" onClick={cta.onClick}>
          {cta.icon}
          {cta.label}
        </Button>
      )}
    </div>
  );
}
