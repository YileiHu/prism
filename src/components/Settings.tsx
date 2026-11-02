import { useCallback, useEffect, useState } from "react";
import { Database, Keyboard, Palette, RotateCcw, Search, SlidersHorizontal, SquarePen, Wrench } from "lucide-react";
import { useT } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";
import { useSettings } from "../lib/settings";
import Button from "./Button";
import Sidebar from "./Sidebar";
import NavItem from "./NavItem";
import ConfirmDialog from "./ConfirmDialog";
import GeneralSection from "./settings/GeneralSection";
import VaultsSection from "./settings/VaultsSection";
import EditorSection from "./settings/EditorSection";
import AppearanceSection from "./settings/AppearanceSection";
import SearchSection from "./settings/SearchSection";
import ExternalSection from "./settings/ExternalSection";
import ShortcutsSection from "./settings/ShortcutsSection";

type SettingsCategory = "general" | "vaults" | "editor" | "appearance" | "search" | "external" | "shortcuts";

const CATEGORY_KEY = "prism_settings_category";

export default function Settings() {
  const { t, setLang } = useT();
  const { setTheme, setMode } = useTheme();
  const { reset } = useSettings();
  const [category, setCategory] = useState<SettingsCategory>(() => {
    try {
      const saved = localStorage.getItem(CATEGORY_KEY);
      const valid: SettingsCategory[] = ["general", "vaults", "editor", "appearance", "search", "external", "shortcuts"];
      return valid.includes(saved as SettingsCategory) ? (saved as SettingsCategory) : "general";
    } catch {
      return "general";
    }
  });
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(CATEGORY_KEY, category); } catch { /* ignore */ }
  }, [category]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);

  const flashSaved = useCallback(() => setSaved(true), []);

  useEffect(() => {
    const handler = () => flashSaved();
    window.addEventListener("settings-saved", handler);
    return () => window.removeEventListener("settings-saved", handler);
  }, [flashSaved]);

  const handleReset = async () => {
    await reset();
    setTheme("violet");
    setMode("dark");
    setLang("zh");
    flashSaved();
  };

  const categories: { key: SettingsCategory; label: string; icon: typeof Database }[] = [
    { key: "general", label: t["settings.catGeneral"], icon: SlidersHorizontal },
    { key: "vaults", label: t["settings.catVaults"], icon: Database },
    { key: "editor", label: t["settings.catEditor"], icon: SquarePen },
    { key: "appearance", label: t["settings.catAppearance"], icon: Palette },
    { key: "search", label: t["settings.catSearch"], icon: Search },
    { key: "shortcuts", label: t["settings.catShortcuts"], icon: Keyboard },
    { key: "external", label: t["settings.catExternal"], icon: Wrench },
  ];

  return (
    <div className="h-full flex">
      <Sidebar storageKey="settings">
        <nav className="space-y-0.5">
          {categories.map(({ key, label, icon: Icon }) => (
            <NavItem
              key={key}
              onClick={() => setCategory(key)}
              active={category === key}
              leading={<Icon size={16} />}
              label={label}
            />
          ))}
        </nav>
        {saved && (
          <div className="px-4 pt-2 mt-2 border-t border-line/50">
            <span className="text-caption text-success">{t["settings.saved"]}</span>
          </div>
        )}
      </Sidebar>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl">
          {category === "general" && <GeneralSection />}
          {category === "vaults" && <VaultsSection onSaved={flashSaved} />}
          {category === "editor" && <EditorSection />}
          {category === "appearance" && <AppearanceSection />}
          {category === "search" && <SearchSection />}
          {category === "shortcuts" && <ShortcutsSection />}
          {category === "external" && <ExternalSection onSaved={flashSaved} />}

          <div className="mt-10 pt-5 border-t border-line/50 flex items-center justify-between gap-6">
            <div>
              <div className="text-body font-medium text-secondary">{t["settings.reset"]}</div>
              <p className="text-caption text-muted mt-0.5">{t["settings.resetDesc"]}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setConfirmReset(true)}>
              <RotateCcw size={14} />
              {t["settings.reset"]}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title={t["settings.reset"]}
        message={t["settings.resetConfirm"]}
        confirmLabel={t["settings.reset"]}
        tone="default"
        onConfirm={handleReset}
        onClose={() => setConfirmReset(false)}
      />
    </div>
  );
}
