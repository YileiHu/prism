import { useState } from "react";
import { useT } from "../i18n";
import { useToast } from "./toast";

interface Options {
  onPick: (dialogTitle: string) => Promise<string | null>;
  onChange: (name: string) => void;
}

/**
 * Shared pick lifecycle for an app-managed image: owns the busy flag, calls the
 * passed picker, and maps the three picker errors to the standard toasts.
 */
export default function useImagePickAction({ onPick, onChange }: Options) {
  const { t } = useT();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);

  const pick = async (dialogTitle: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const name = await onPick(dialogTitle);
      if (name) onChange(name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("FILE_TOO_LARGE")) showToast(t["image.tooLarge"], "error");
      else if (message.includes("UNSUPPORTED_TYPE")) showToast(t["image.unsupported"], "error");
      else showToast(t["image.failed"], "error");
    } finally {
      setBusy(false);
    }
  };

  return { busy, pick };
}
