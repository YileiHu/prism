import type { ReactNode } from "react";
import Button from "../Button";

interface Step {
  title: string;
  description?: string;
}

interface Action {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
}

interface Props {
  icon: ReactNode;
  eyebrow?: string;
  title: string;
  description: string;
  steps?: Step[];
  primary?: Action;
  hint?: string;
  className?: string;
}

/**
 * Shared first-run state for every growth view. It explains the module, gives a
 * short ordered path and exactly one obvious next action, instead of a lone
 * "nothing here" line.
 */
export default function GrowthEmptyGuide({
  icon,
  eyebrow,
  title,
  description,
  steps,
  primary,
  hint,
  className = "",
}: Props) {
  return (
    <div
      className={`flex w-full flex-col items-center px-6 py-6 text-center anim-fade-in ${className}`}
    >
      <div className="max-w-[560px]">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-muted)] text-[var(--accent-text)]">
          {icon}
        </span>
        {eyebrow && (
          <p className="mt-4 text-meta uppercase tracking-[0.08em] text-faint">{eyebrow}</p>
        )}
        <h2 className="mt-1 text-section font-semibold text-primary">{title}</h2>
        <p className="mx-auto mt-2 max-w-[48ch] text-body text-muted">{description}</p>

        {steps && steps.length > 0 && (
          <ol className="mt-5 grid gap-2 text-left">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="flex items-start gap-3 rounded-card border border-line/60 bg-surface/60 px-3 py-2"
              >
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-muted)] text-meta font-medium tabular-nums text-[var(--accent-text)]">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-caption font-medium text-primary">{step.title}</span>
                  {step.description && (
                    <span className="mt-0.5 block text-caption text-faint">{step.description}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}

        {primary && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button variant="primary" size="sm" onClick={primary.onClick}>
              {primary.icon}
              {primary.label}
            </Button>
          </div>
        )}

        {hint && <p className="mx-auto mt-4 max-w-[46ch] text-caption text-faint">{hint}</p>}
      </div>
    </div>
  );
}
