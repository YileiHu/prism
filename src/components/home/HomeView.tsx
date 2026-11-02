import { useState, useEffect, useCallback } from "react";
import { History, Star } from "lucide-react";
import { useT } from "../../i18n";
import { useSettings } from "../../lib/settings";
import HomeClock from "./HomeClock";
import HomeNextActions from "./HomeNextActions";
import NoteListCard, { type NoteRow } from "./NoteListCard";
import { formatRecentTime, type FavoriteNote, type RecentNote } from "./types";
import type { GtdFocusRequest } from "../gtd/types";

interface Props {
  active: boolean;
  onNavigateToGtd: (req: GtdFocusRequest) => void;
}

export default function HomeView({ active, onNavigateToGtd }: Props) {
  const { t } = useT();
  const { values } = useSettings();
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const [favorites, setFavorites] = useState<FavoriteNote[]>([]);
  const [recents, setRecents] = useState<RecentNote[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [recentsLoaded, setRecentsLoaded] = useState(false);

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
    const onFavoritesChanged = () => bump();
    const onFocus = () => bump();
    window.addEventListener("favorites-changed", onFavoritesChanged);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("favorites-changed", onFavoritesChanged);
      window.removeEventListener("focus", onFocus);
    };
  }, [bump]);

  const unstar = (row: NoteRow) => {
    window.prism.toggleFavoriteNote(row.path, row.title).then(() => {
      window.dispatchEvent(new Event("favorites-changed"));
    });
  };

  const recentRows: NoteRow[] = recents.map((n) => ({
    path: n.path,
    title: n.title,
    missing: n.missing,
    meta: n.missing ? undefined : formatRecentTime(n.opened_at),
  }));

  const favoriteRows: NoteRow[] = favorites.map((n) => ({
    path: n.path,
    title: n.title,
    missing: n.missing,
  }));

  return (
    <div className="h-full flex flex-col gap-3 p-3 overflow-hidden">
      <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-3">
          <HomeClock />
          <div className="flex-1 min-h-0">
            <HomeNextActions version={version} onChanged={bump} onNavigateToGtd={onNavigateToGtd} />
          </div>
        </div>
        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-3">
          <NoteListCard title={t["home.favorites"]} icon={Star} rows={favoriteRows} emptyText={t["home.emptyFavorites"]} accent loading={!favoritesLoaded} onUnstar={unstar} />
          <NoteListCard title={t["home.recents"]} icon={History} rows={recentRows} emptyText={t["home.emptyRecents"]} loading={!recentsLoaded} />
        </div>
      </div>
    </div>
  );
}
