import { useState, useEffect, useCallback } from "react";
import { History, Star } from "lucide-react";
import { useT } from "../../i18n";
import ScheduleTimeline from "./ScheduleTimeline";
import HomeNextActions from "./HomeNextActions";
import NoteListCard, { type NoteRow } from "./NoteListCard";
import { formatRecentTime, type FavoriteNote, type RecentNote } from "./types";

interface Props {
  active: boolean;
  onNavigateToGtd: () => void;
}

export default function HomeView({ active, onNavigateToGtd }: Props) {
  const { t } = useT();
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const [favorites, setFavorites] = useState<FavoriteNote[]>([]);
  const [recents, setRecents] = useState<RecentNote[]>([]);

  useEffect(() => {
    window.prism.getFavoriteNotes().then(setFavorites);
    window.prism.getRecentNotes(10).then(setRecents);
  }, [version]);

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
    <div className="h-full flex gap-3 p-3 overflow-hidden">
      <div className="w-[320px] flex-shrink-0 min-h-0">
        <ScheduleTimeline version={version} onChanged={bump} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-3 overflow-y-auto">
        <HomeNextActions version={version} onChanged={bump} onNavigateToGtd={onNavigateToGtd} />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <NoteListCard title={t["home.recents"]} icon={History} rows={recentRows} emptyText={t["home.emptyRecents"]} />
          <NoteListCard title={t["home.favorites"]} icon={Star} rows={favoriteRows} emptyText={t["home.emptyFavorites"]} onUnstar={unstar} />
        </div>
      </div>
    </div>
  );
}
