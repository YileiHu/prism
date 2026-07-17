import { type ReactNode } from "react";
import { X } from "lucide-react";
import Button from "./Button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  icon?: ReactNode;
  width?: string;
  position?: "top" | "center";
  children: ReactNode;
  footer?: ReactNode;
}

export default function Modal({
  open,
  onClose,
  title,
  icon,
  width = "420px",
  position = "top",
  children,
  footer,
}: ModalProps) {
  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex ${
        position === "center" ? "items-center" : "items-start"
      } justify-center ${position === "top" ? "pt-[20vh]" : ""}`}
    >
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-6"
        style={{ width }}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              {icon}
              <h2 className="text-base font-semibold text-gray-200">{title}</h2>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X size={18} />
            </Button>
          </div>
        )}
        {children}
        {footer !== undefined && (
          <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
