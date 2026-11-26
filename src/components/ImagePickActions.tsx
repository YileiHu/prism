import { ImagePlus, Trash2 } from "lucide-react";
import Button from "./Button";
import useImagePickAction from "../lib/useImagePickAction";

interface Props {
  /** Stored file name; empty means nothing picked yet. */
  value: string;
  onChange: (name: string) => void;
  /** Opens the native picker and resolves to the copied file name (or null). */
  onPick: (dialogTitle: string) => Promise<string | null>;
  pickLabel: string;
  removeLabel: string;
  dialogTitle: string;
}

/**
 * Icon-only pick / remove actions for an app-managed image. The parent places
 * the fragment over the image preview (top-right) and owns the click blocking.
 * The buttons are deliberately opaque: a transparent ring disappears on busy
 * photos.
 */
const OVERLAY_BUTTON_CLASSES = "bg-surface text-primary ring-strong shadow-popover hover:bg-elevated";

export default function ImagePickActions({
  value,
  onChange,
  onPick,
  pickLabel,
  removeLabel,
  dialogTitle,
}: Props) {
  const { busy, pick } = useImagePickAction({ onPick, onChange });

  return (
    <>
      <Button
        variant="secondary"
        size="icon-sm"
        className={OVERLAY_BUTTON_CLASSES}
        title={pickLabel}
        aria-label={pickLabel}
        disabled={busy}
        onClick={() => void pick(dialogTitle)}
      >
        <ImagePlus size={15} />
      </Button>
      {value && (
        <Button
          variant="secondary"
          size="icon-sm"
          className={OVERLAY_BUTTON_CLASSES}
          title={removeLabel}
          aria-label={removeLabel}
          disabled={busy}
          onClick={() => onChange("")}
        >
          <Trash2 size={15} />
        </Button>
      )}
    </>
  );
}
