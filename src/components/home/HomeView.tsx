import { useState, useEffect, useCallback, useMemo } from "react";
import { History, Star } from "lucide-react";
import { type MenuItem } from "../ContextMenu";
import { useT } from "../../i18n";
import { useSettings } from "../../lib/settings";
import HomeInboxCard from "./HomeInboxCard";
import HomeNextActions from "./HomeNextActions";
import NoteListCard, { type NoteRow } from "./NoteListCard";
import ToolbarClock from "./ToolbarClock";
import { useNoteCollectionIndex } from "./useNoteCollectionIndex";
import { useToolbarContribution, type ToolbarContribution } from "../toolbar/ToolbarProvider";
import { tagColor } from "../../lib/colors";
import { noteBaseMenuItems } from "../../lib/noteMenu";
import { useVaultLock } from "../../lib/vaultLock";
import { normalizePath } from "../../lib/workspace/types";
import type { FavoriteNote, RecentNote } from "./types";
import type { GtdFocusRequest } from "../gtd/types";
import type { VaultEntry } from "../../types";

interface Props {
  active: boolean;
  vaults: VaultEntry[];
  onNavigateToGtd: (req: GtdFocusRequest) => void;
}

export default function HomeView({ active, vaults, onNavigateToGtd }: Props) {
  const { t } = useT();
  const { values } = useSettings();
  const vaultLock = useVaultLock();
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const [favorites, setFavorites] = useState<FavoriteNote[]>([]);
  const [recents, setRecents] = useState<RecentNote[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [recentsLoaded, setRecentsLoaded] = useState(false);

  const toolbar = useMemo<ToolbarContribution>(() => ({ title: <ToolbarClock /> }), []);
  useToolbarContribution("module:home", toolbar);

  const { ownersFor } = useNoteCollectionIndex(vaults, version);

  useEffect(() => {
    window.prism.getFavoriteNotes().then(setFavorites).finally(() => setFavoritesLoaded(true));
    window.prism
      .getRecentNotes(values.home_recents_count)
      .then(setRecents)
      .finally(() => setRecentsLoaded(true));
  }, [version, values.home_recents_count]);

  // Refresh whenever the tab becomes visible — the pane is kept alive while
  // the user works in other tabs (GTD completions, starring, note opens).
  useEffect(() => {
    if (active) bump();
  }, [active, bump]);

  useEffect(() => {
    const refresh = () => bump();
    window.addEventListener("favorites-changed", refresh);
    window.addEventListener("gtd-changed", refresh);
    window.addEventListener("vaults-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("favorites-changed", refresh);
      window.removeEventListener("gtd-changed", refresh);
      window.removeEventListener("vaults-changed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [bump]);

  const favoritePaths = useMemo(() => new Set(favorites.map((n) => n.path)), [favorites]);

  const noteMenu = (row: NoteRow): MenuItem[] | undefined => {
    const isFavorite = favoritePaths.has(row.path);
    // The backing file is gone, so "show in explorer" is useless. Keep the
    // unfavorite action so stale entries can still be cleaned up.
    if (row.missing) {
      return isFavorite
        ? noteBaseMenuItems(row, true, { favorite: t["menu.favorite"], unfavorite: t["menu.unfavorite"] })
        : undefined;
    }
    return noteBaseMenuItems(row, isFavorite, {
      favorite: t["menu.favorite"],
      unfavorite: t["menu.unfavorite"],
      showInExplorer: t["menu.showInExplorer"],
    });
  };

  const vaultFor = useCallback((notePath: string): VaultEntry | undefined => {
    const target = normalizePath(notePath);
    let best: VaultEntry | undefined;
    let bestLength = -1;
    for (const vault of vaults) {
      const vaultPath = normalizePath(vault.path);
      if ((target === vaultPath || target.startsWith(`${vaultPath}/`)) && vaultPath.length > bestLength) {
        best = vault;
        bestLength = vaultPath.length;
      }
    }
    return best;
  }, [vaults]);

  const isLockedPath = (notePath: string): boolean => {
    const vault = vaultFor(notePath);
    return vault ? vaultLock.isLocked(vault.path) : false;
  };

  const attachOwner = (row: NoteRow): NoteRow => {
    const owners = ownersFor(row.path);
    if (owners.length === 0) return row;
    return {
      ...row,
      collection: owners[0],
      collectionMore: owners.length > 1 ? owners.length - 1 : undefined,
    };
  };

  const recentRows: NoteRow[] = recents.map((n) =>
    attachOwner({
      path: n.path,
      title: n.title,
      missing: n.missing,
    }),
  );

  const favoriteRows: NoteRow[] = favorites.map((n) =>
    attachOwner({
      path: n.path,
      title: n.title,
      missing: n.missing,
      locked: !n.missing && isLockedPath(n.path),
    }),
  );

  return (
    <div className="flex h-full flex-col gap-3 p-3 overflow-hidden">
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="min-h-0 flex-[1.5]">
            <HomeInboxCard version={version} />
          </div>
          <div className="min-h-0 flex-1">
            <HomeNextActions version={version} onChanged={bump} onNavigateToGtd={onNavigateToGtd} />
          </div>
        </div>
        <aside className="flex w-[320px] shrink-0 flex-col gap-3">
          <NoteListCard
            title={t["home.favorites"]}
            icon={Star}
            rows={favoriteRows}
            emptyText={t["home.emptyFavorites"]}
            tintColor={tagColor("gold")}
            loading={!favoritesLoaded}
            menuFor={noteMenu}
          />
          <NoteListCard
            title={t["home.recents"]}
            icon={History}
            rows={recentRows}
            emptyText={t["home.emptyRecents"]}
            tintColor={tagColor("teal")}
            loading={!recentsLoaded}
            menuFor={noteMenu}
          />
        </aside>
      </div>
    </div>
  );
}
