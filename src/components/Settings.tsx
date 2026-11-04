import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, Keyboard, Palette, RotateCcw, Search, SlidersHorizontal, SquarePen, Wrench } from "lucide-react";
import { useT } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";
import { useSettings } from "../lib/settings";
import { useToolbarContribution, type ToolbarContribution } from "./toolbar/ToolbarProvider";
import Button from "./Button";
import CollapsibleSidebar from "./CollapsibleSidebar";
import { ModuleSidebar } from "./AppSidebarSlot";
import NavItem from "./NavItem";
import ConfirmDialog from "./ConfirmDialog";
import GeneralSection from "./settings/GeneralSection";
import VaultsSection from "./settings/VaultsSection";
import EditorSection from "./settings/EditorSection";
import AppearanceSection from "./settings/AppearanceSection";
import SearchSection from "./settings/SearchSection";
import ExternalSection from "./settings/ExternalSection";
import ShortcutsSection from "./settings/ShortcutsSection";
import PdfSection from "./settings/PdfSection";

type SettingsCategory = "general" | "vaults" | "editor" | "appearance" | "search" | "external" | "shortcuts";

const CATEGORY_KEY = "prism_settings_category";
const CATEGORIES: SettingsCategory[] = ["general", "vaults", "editor", "appearance", "search", "external", "shortcuts"];

export default function Settings({ active }: { active: boolean }) {
  const { t, setLang } = useT();
  const { setTheme, setMode } = useTheme();
  const { reset } = useSettings();
  const [category, setCategory] = useState<SettingsCategory>(() => {
    try {
      const saved = localStorage.getItem(CATEGORY_KEY);
      const migrated = saved === "pdf" ? "vaults" : saved;
      return CATEGORIES.includes(migrated as SettingsCategory) ? (migrated as SettingsCategory) : "general";
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
    { key: "vaults", label: t["settings.catLibrary"], icon: Database },
    { key: "editor", label: t["settings.catEditor"], icon: SquarePen },
    { key: "appearance", label: t["settings.catAppearance"], icon: Palette },
    { key: "search", label: t["settings.catSearch"], icon: Search },
    { key: "shortcuts", label: t["settings.catShortcuts"], icon: Keyboard },
    { key: "external", label: t["settings.catExternal"], icon: Wrench },
  ];

  const toolbar = useMemo<ToolbarContribution>(() => {
    const label = categories.find((entry) => entry.key === category)?.label ?? t["nav.settings"];
    return {
      title: (
        <span className="min-w-0 text-body font-medium text-primary truncate">{label}</span>
      ),
      subtitle: saved
        ? <span className="text-caption text-success whitespace-nowrap">{t["settings.saved"]}</span>
        : undefined,
    };
    // categories is rebuilt each render; category/saved/t drive the visible model
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, saved, t]);

  useToolbarContribution("module:settings", toolbar);

  return (
    <div className="h-full flex">
      <ModuleSidebar active={active}>
        <CollapsibleSidebar>
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
        </CollapsibleSidebar>
      </ModuleSidebar>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl">
          {category === "general" && <GeneralSection />}
          {category === "vaults" && (
            <div>
              <div className="mb-6">
                <h4 className="text-body font-semibold text-primary mb-1">{t["settings.catVaults"]}</h4>
                <p className="text-caption text-muted mb-4">{t["settings.vaultsDesc"]}</p>
                <VaultsSection onSaved={flashSaved} />
              </div>
              <div className="pt-6 border-t border-line/50">
                <h4 className="text-body font-semibold text-primary mb-1">{t["settings.catPdf"]}</h4>
                <p className="text-caption text-muted mb-4">{t["settings.pdfDesc"]}</p>
                <PdfSection />
              </div>
            </div>
          )}
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
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmReset(true)}>
                <RotateCcw size={14} />
                {t["settings.reset"]}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title={t["settings.reset"]}
        message={t["settings.resetConfirm"]}
        confirmLabel={t["settings.reset"]}
        variant="default"
        onConfirm={handleReset}
        onClose={() => setConfirmReset(false)}
      />
    </div>
  );
}
