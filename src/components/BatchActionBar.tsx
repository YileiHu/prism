import { ChevronDown } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import Button from "./Button";
import { DropdownMenu, DropdownMenuItem } from "./DropdownMenu";

export interface BatchActionMenuItem {
  key: string;
  label: string;
  onClick: () => void;
}

/** One button in the batch bar; `menu` turns it into a split-less dropdown. */
export interface BatchAction {
  key: string;
  label: string;
  icon?: ReactNode;
  /** `ghost-danger` is the delete entry point; it must be confirmed by the caller. */
  variant?: "primary" | "ghost" | "ghost-danger";
  onClick?: () => void;
  menu?: BatchActionMenuItem[];
}

interface Props {
  selectedCount: number;
  actions: BatchAction[];
  onSelectAll?: () => void;
  /** Leaves selection mode (the toolbar switch and Esc do the same). */
  onExit: () => void;
}

function BatchActionButton({ action }: { action: BatchAction }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const variant = action.variant ?? "ghost";

  if (action.menu?.length) {
    return (
      <div ref={anchorRef}>
        <Button variant={variant} size="xs" onClick={() => setOpen((value) => !value)}>
          {action.label}
          <ChevronDown size={14} />
        </Button>
        <DropdownMenu
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
          side="top"
          className="min-w-[180px]"
        >
          {action.menu.map((item) => (
            <DropdownMenuItem
              key={item.key}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenu>
      </div>
    );
  }

  return (
    <Button variant={variant} size="xs" onClick={action.onClick}>
      {action.icon}
      {action.label}
    </Button>
  );
}

/**
 * Shared bottom bar for list multi-select. The bar only owns layout and the
 * count / select-all / exit affordances; each module supplies the actions and
 * their confirmations (see docs/guides/ui-kit.md).
 */
export default function BatchActionBar({ selectedCount, actions, onSelectAll, onExit }: Props) {
  const { t } = useT();

  if (selectedCount === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label={t["batch.selected"].replace("{count}", String(selectedCount))}
      className="sticky bottom-0 left-0 right-0 flex items-center gap-3 px-4 py-2.5 bg-elevated border-t border-strong shadow-popover z-20 anim-bar"
    >
      <span className="text-body text-secondary font-medium" aria-live="polite">
        {t["batch.selected"].replace("{count}", String(selectedCount))}
      </span>

      {actions.map((action) => (
        <BatchActionButton key={action.key} action={action} />
      ))}

      <span className="ml-auto flex items-center gap-1">
        {onSelectAll && (
          <Button variant="ghost" size="xs" onClick={onSelectAll}>
            {t["batch.selectAll"]}
          </Button>
        )}
        <Button variant="ghost" size="xs" onClick={onExit}>
          {t["batch.cancelSelect"]}
        </Button>
      </span>
    </div>
  );
}
