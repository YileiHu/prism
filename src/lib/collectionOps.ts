/** Returns `items` unchanged for no-op moves so callers can skip a save. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function insertAt<T>(items: readonly T[], index: number, item: T): T[] {
  const next = [...items];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
  return next;
}

export function renameById<T extends { id: string; name: string }>(
  items: readonly T[],
  id: string,
  name: string,
): T[] {
  return items.map((item) => (item.id === id ? { ...item, name } : item));
}

export function deleteById<T extends { id: string }>(items: readonly T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}
