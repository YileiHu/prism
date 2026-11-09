import { useEffect, useMemo, useState } from "react";
import type { VaultEntry } from "../../types";
import type { CollectionData } from "../collectionTypes";
import { noteKey } from "../../lib/workspace/types";

export interface NoteOwner {
  label: string;
  tooltip: string;
  colorBar?: string;
}

function absoluteKey(vaultPath: string, relPath: string): string {
  return noteKey(
    `${vaultPath.replace(/[\\/]+$/, "")}/${relPath.replace(/^[\\/]+/, "")}`,
  );
}

/**
 * Maps absolute note paths to the collections/groups that contain them, across
 * every configured vault. Collections live in per-vault JSON files, so one
 * unreadable vault must not hide the owners from the others.
 */
export function useNoteCollectionIndex(vaults: VaultEntry[], version: number) {
  const [index, setIndex] = useState<Map<string, NoteOwner[]>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const results = await Promise.allSettled(
        vaults.map(async (vault) => {
          const data = (await window.prism.loadNoteCollections(vault.path)) as
            | { collections?: CollectionData[] }
            | null;
          return {
            vault,
            collections: Array.isArray(data?.collections) ? data.collections : [],
          };
        }),
      );
      if (cancelled) return;

      const next = new Map<string, NoteOwner[]>();
      const addOwner = (key: string, owner: NoteOwner) => {
        const owners = next.get(key);
        if (!owners) {
          next.set(key, [owner]);
          return;
        }
        if (!owners.some((existing) => existing.label === owner.label)) {
          owners.push(owner);
        }
      };

      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const { vault, collections } = result.value;
        for (const collection of collections) {
          for (const relPath of collection.notePaths ?? []) {
            addOwner(absoluteKey(vault.path, relPath), {
              label: collection.name,
              tooltip: `${vault.name} · ${collection.name}`,
              colorBar: collection.color,
            });
          }
          for (const group of collection.groups ?? []) {
            for (const relPath of group.notePaths ?? []) {
              addOwner(absoluteKey(vault.path, relPath), {
                label: `${collection.name} / ${group.name}`,
                tooltip: `${vault.name} · ${collection.name} / ${group.name}`,
                colorBar: group.color ?? collection.color,
              });
            }
          }
        }
      }
      setIndex(next);
    })().finally(() => {
      if (!cancelled) setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [vaults, version]);

  const ownersFor = useMemo(
    () => (absPath: string): NoteOwner[] => index.get(noteKey(absPath)) ?? [],
    [index],
  );

  return { ownersFor, loaded };
}
