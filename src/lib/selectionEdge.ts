export type SelectionEdge = "only" | "first" | "middle" | "last";

/**
 * Which corner radius an item in a selection run gets. Adjacent selected rows
 * must not round their shared edge, otherwise a run of selected rows looks like
 * a stack of separate pills. `keys` is the list order (selection is contiguous
 * in display order, not in the Set's iteration order).
 */
export function selectionEdgeAt<K>(
  keys: readonly K[],
  index: number,
  selected: ReadonlySet<K>,
): SelectionEdge | null {
  const key = keys[index];
  if (key === undefined || !selected.has(key)) return null;
  const hasPrevious = index > 0 && selected.has(keys[index - 1]);
  const hasNext = index < keys.length - 1 && selected.has(keys[index + 1]);
  if (!hasPrevious && !hasNext) return "only";
  if (!hasPrevious) return "first";
  if (!hasNext) return "last";
  return "middle";
}
