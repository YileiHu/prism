import { useCallback, useEffect, useRef, useState } from "react";

/** Gallery cap shared by the editor and the server-side normalizer. */
export const MAX_ARTIFACT_IMAGES = 6;

/**
 * Owns the artifact gallery lifecycle: files picked in this session are
 * removed on cancel, and every replaced/removed file is cleaned up after save.
 */
export default function useGrowthImagesDraft({
  open,
  initialImages,
  pickTitle,
}: {
  open: boolean;
  initialImages: string[];
  pickTitle: string;
}) {
  const [images, setImages] = useState<string[]>([]);
  const initialRef = useRef<string[]>([]);
  const pickedRef = useRef<Set<string>>(new Set());
  const key = initialImages.join("|");

  useEffect(() => {
    if (!open) return;
    const next = [...initialImages];
    setImages(next);
    initialRef.current = next;
    pickedRef.current = new Set();
    // `key` captures the initial list without depending on array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  // Unmount cleanup for drafts (module switch / split close); a saved gallery
  // clears `pickedRef` in `commitAfterSave` so live files are never touched.
  useEffect(
    () => () => {
      for (const name of pickedRef.current) {
        void window.prism.deleteGrowthCover(name).catch(() => undefined);
      }
      pickedRef.current = new Set();
    },
    [],
  );

  const add = useCallback(async (): Promise<string | null> => {
    if (images.length >= MAX_ARTIFACT_IMAGES) return null;
    const name = await window.prism.pickGrowthCover(pickTitle);
    if (!name) return null;
    pickedRef.current.add(name);
    setImages((previous) => (previous.length >= MAX_ARTIFACT_IMAGES ? previous : [...previous, name]));
    return name;
  }, [images.length, pickTitle]);

  const remove = useCallback((name: string) => {
    setImages((previous) => previous.filter((item) => item !== name));
  }, []);

  const commitAfterSave = useCallback((saved: string[]) => {
    const keep = new Set(saved);
    const drop = new Set(
      [...initialRef.current, ...pickedRef.current].filter((name) => name && !keep.has(name)),
    );
    for (const name of drop) {
      void window.prism.deleteGrowthCover(name).catch(() => undefined);
    }
    initialRef.current = [...saved];
    pickedRef.current = new Set();
  }, []);

  const discardOnCancel = useCallback(() => {
    for (const name of pickedRef.current) {
      void window.prism.deleteGrowthCover(name).catch(() => undefined);
    }
    pickedRef.current = new Set();
  }, []);

  return { images, add, remove, commitAfterSave, discardOnCancel, max: MAX_ARTIFACT_IMAGES };
}
