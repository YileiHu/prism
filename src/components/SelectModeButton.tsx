import { CheckSquare } from "lucide-react";
import { useT } from "../i18n";
import Button from "./Button";

interface Props {
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

/** Toolbar switch for list multi-select (`useMultiSelect`). */
export default function SelectModeButton({ active, onToggle, disabled }: Props) {
  const { t } = useT();
  const label = active ? t["batch.cancelSelect"] : t["batch.selectMode"];
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      active={active}
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
    >
      <CheckSquare size={15} />
    </Button>
  );
}
