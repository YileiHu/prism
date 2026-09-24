// Heading fold state shared by the reading view and the CodeMirror live
// preview — keyed per note, persisted to localStorage so folds survive
// app restarts. Keys are "h{level}:{text}#{occurrence}" and stay stable as
// long as the heading text itself is unchanged.
const LS_KEY = "prism_md_folds";

type FoldStore = Record<string, string[]>;

function readStore(): FoldStore {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as FoldStore) : {};
  } catch {
    return {};
  }
}

export function loadFolds(scope: string): Set<string> {
  return new Set(readStore()[scope] ?? []);
}

export function saveFold(scope: string, key: string, folded: boolean): void {
  try {
    const store = readStore();
    const set = new Set(store[scope] ?? []);
    if (folded) set.add(key);
    else set.delete(key);
    store[scope] = Array.from(set);
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch { /* storage unavailable — folds just won't persist */ }
}

// Occurrence-aware key so duplicate heading texts fold independently
export class FoldKeyCounter {
  private counts = new Map<string, number>();

  next(level: number, text: string): string {
    const base = `h${level}:${text}`;
    const n = this.counts.get(base) ?? 0;
    this.counts.set(base, n + 1);
    return `${base}#${n}`;
  }
}
