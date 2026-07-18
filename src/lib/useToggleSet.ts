import { useCallback } from "react";

export function useSetToggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>) {
  return useCallback(
    (key: string) => {
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [setter],
  );
}
