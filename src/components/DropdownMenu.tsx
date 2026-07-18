import { type ReactNode } from "react";

/* ---- DropdownMenu (container) ---- */

interface DropdownMenuProps {
  open: boolean;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}

export function DropdownMenu({ open, onClose, className = "", children }: DropdownMenuProps) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className={`absolute z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-1 ${className}`}>
        {children}
      </div>
    </>
  );
}

/* ---- DropdownMenuItem ---- */

interface DropdownMenuItemProps {
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
  className?: string;
  children: ReactNode;
}

export function DropdownMenuItem({ onClick, danger, active, className = "", children }: DropdownMenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm rounded-md transition-colors ${
        active
          ? "bg-[var(--accent-muted)] text-[var(--accent-text)]"
          : danger
            ? "text-red-400 hover:bg-red-400/10"
            : "text-gray-300 hover:bg-gray-700"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/* ---- DropdownMenuDivider ---- */

export function DropdownMenuDivider() {
  return <div className="border-t border-gray-700 mx-2 my-1" />;
}
