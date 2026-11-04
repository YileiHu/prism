import { useState, useEffect, useCallback, useMemo } from "react";
import { FolderOpen, History, Star } from "lucide-react";
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

  const noteMenu = (row: NoteRow): MenuItem[] => [
    {
      label: favoritePaths.has(row.path) ? t["menu.unfavorite"] : t["menu.favorite"],
      icon: <Star size={14} />,
      onClick: () => {
        window.prism.toggleFavoriteNote(row.path, row.title).then(() => {
          window.dispatchEvent(new Event("favorites-changed"));
        });
      },
    },
    {
      label: t["menu.showInExplorer"],
      icon: <FolderOpen size={14} />,
      onClick: () => window.prism.showItemInFolder(row.path),
    },
  ];

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
