import { useEffect, useRef, useState } from "react";

interface Options {
  /** Re-initialise whenever the host dialog opens. */
  open: boolean;
  /** The cover already stored on the row (empty for a new item). */
  initialCover: string;
  /** Fallback native dialog title; `pick()` may override it. */
  pickTitle: string;
}

interface CoverDraft {
  /** Current cover file name (may be a freshly picked, not-yet-saved file). */
  cover: string;
  setCover: (name: string) => void;
  /** Opens the native picker, tracks the copy, and returns its file name. */
  pick: (title?: string) => Promise<string | null>;
  /** After a successful save: drop the replaced original and unused picks. */
  commitAfterSave: (saved: string) => void;
  /** On cancel: drop every file picked in this session, keep the original. */
  discardOnCancel: () => void;
}

/**
 * Season covers and work covers share one app-managed directory and the same
 * "pick, replace, cancel" lifecycle. This hook owns that lifecycle so the two
 * dialogs don't each re-implement file cleanup.
 */
export default function useGrowthCoverDraft({
  open,
  initialCover,
  pickTitle,
}: Options): CoverDraft {
  const [cover, setCover] = useState(initialCover);
  const pickedRef = useRef<string[]>([]);
  const originalRef = useRef(initialCover);

  useEffect(() => {
    if (!open) return;
    originalRef.current = initialCover;
    pickedRef.current = [];
    setCover(initialCover);
  }, [open, initialCover]);

  // The host may unmount without going through the cancel button (module
  // switch, split-view close). Draft files are not referenced by any row yet,
  // so clean them here; a successful save clears `pickedRef` first.
  useEffect(
    () => () => {
      for (const name of new Set(pickedRef.current)) {
        if (name) void window.prism.deleteGrowthCover(name).catch(() => undefined);
      }
      pickedRef.current = [];
    },
    [],
  );

  const discard = (names: string[]) => {
    for (const name of new Set(names)) {
      if (!name) continue;
      void window.prism.deleteGrowthCover(name).catch(() => undefined);
    }
  };

  const pick = async (title?: string) => {
    const name = await window.prism.pickGrowthCover(title ?? pickTitle);
    if (name) {
      pickedRef.current = [...pickedRef.current, name];
      setCover(name);
    }
    return name;
  };

  const commitAfterSave = (saved: string) => {
    discard([originalRef.current, ...pickedRef.current].filter((name) => name !== saved));
    pickedRef.current = [];
    originalRef.current = saved;
  };

  const discardOnCancel = () => {
    discard(pickedRef.current);
    pickedRef.current = [];
  };

  return { cover, setCover, pick, commitAfterSave, discardOnCancel };
}
