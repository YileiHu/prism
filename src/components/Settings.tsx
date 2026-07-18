import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, FolderOpen, ExternalLink, Monitor, Palette, Database, Wrench, ChevronDown } from "lucide-react";
import { useT, langOptions } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";
import { themes } from "../theme/themes";
import Button from "./Button";
import Sidebar from "./Sidebar";
import { DropdownMenu, DropdownMenuItem } from "./DropdownMenu";
import { type VaultEntry } from "../types";

type SettingsCategory = "vaults" | "external" | "appearance";

export default function Settings() {
  const { t, lang, setLang } = useT();
  const { theme: currentTheme, setTheme, themeId } = useTheme();
  const [category, setCategory] = useState<SettingsCategory>("vaults");
  const [vaults, setVaults] = useState<VaultEntry[]>([]);
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [saved, setSaved] = useState(false);
  const [browserPath, setBrowserPath] = useState("");
  const [obsidianPath, setObsidianPath] = useState("");
  const [defaultNotesDir, setDefaultNotesDir] = useState("");
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const rawVaults = await window.prism.getSetting("vault_paths");
    if (rawVaults) {
      try { setVaults(JSON.parse(rawVaults)); } catch { setVaults([]); }
    }
    const bp = await window.prism.getSetting("browser_path");
    if (bp) setBrowserPath(bp);
    const op = await window.prism.getSetting("obsidian_path");
    if (op) setObsidianPath(op);
    const dnd = await window.prism.getSetting("default_notes_dir");
    if (dnd) setDefaultNotesDir(dnd);
  };

  const flashSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const saveVaults = useCallback(async (updated: VaultEntry[]) => {
    await window.prism.setSetting("vault_paths", JSON.stringify(updated));
    setVaults(updated);
    window.dispatchEvent(new CustomEvent("vaults-changed"));
    flashSaved();
  }, []);

  const saveSetting = async (key: string, value: string) => {
    await window.prism.setSetting(key, value);
    flashSaved();
  };

  const handleAddVault = async () => {
    if (!newName.trim() || !newPath.trim()) return;
    await saveVaults([...vaults, { name: newName.trim(), path: newPath.trim() }]);
    setNewName(""); setNewPath("");
  };

  const handleRemoveVault = async (index: number) => {
    await saveVaults(vaults.filter((_, i) => i !== index));
  };

  const handleSelectDir = async () => {
    const dir = await window.prism.selectDirectory();
    if (dir) setNewPath(dir);
  };

  const handleSelectFile = async (setter: (v: string) => void, key: string) => {
    const file = await window.prism.selectFile();
    if (file) { setter(file); saveSetting(key, file); }
  };

  const handleTestBrowser = () => { window.prism.openUrl("https://example.com"); };

  const handleTestObsidian = () => {
    window.prism.openInObsidian(vaults.length > 0 ? vaults[0].path : "");
  };

  const categories: { key: SettingsCategory; label: string; icon: typeof Database }[] = [
    { key: "vaults", label: t["settings.catVaults"], icon: Database },
    { key: "external", label: t["settings.catExternal"], icon: Wrench },
    { key: "appearance", label: t["settings.catAppearance"], icon: Palette },
  ];

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <Sidebar>
        <nav className="space-y-0.5">
          {categories.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                category === key
                  ? "bg-[var(--accent-muted)] text-[var(--accent-text)] font-medium"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        {saved && (
          <div className="px-4 pt-2 mt-2 border-t border-gray-800/50">
            <span className="text-xs text-green-400">Settings saved</span>
          </div>
        )}
      </Sidebar>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {category === "vaults" && (
          <section>
            <h3 className="text-base font-semibold text-gray-200 mb-1">{t["settings.vaults"]}</h3>
            <p className="text-xs text-gray-500 mb-5">{t["settings.vaultsDesc"]}</p>

            <div className="space-y-2 mb-5">
              {vaults.length === 0 && (
                <div className="text-center text-gray-500 py-8 text-sm bg-gray-900/30 rounded-lg border border-gray-800/50">
                  {t["settings.noVaults"]}
                </div>
              )}
              {vaults.map((v, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-900/50 rounded-lg border border-gray-800/50">
                  <FolderOpen size={16} className="text-amber-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-200 font-medium truncate">{v.name}</div>
                    <div className="text-xs text-gray-500 truncate">{v.path}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleRemoveVault(i)}
                    className="hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>

            <div className="p-4 bg-gray-900/30 rounded-lg border border-gray-800/50 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen size={14} className="text-amber-500" />
                <span className="text-sm font-medium text-gray-300">{t["settings.defaultNotesDir"]}</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">{t["settings.defaultNotesDirDesc"]}</p>
              <input
                value={defaultNotesDir}
                onChange={(e) => setDefaultNotesDir(e.target.value)}
                onBlur={() => saveSetting("default_notes_dir", defaultNotesDir)}
                placeholder={t["settings.defaultNotesDirPlaceholder"]}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>

            <div className="p-4 bg-gray-900/30 rounded-lg border border-gray-800/50 space-y-3">
              <p className="text-xs text-gray-400 font-medium">{t["settings.addVault"]}</p>
              <div className="flex gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t["settings.vaultNamePlaceholder"]}
                  className="w-44 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
                <div className="flex-1 flex gap-2">
                  <input
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    placeholder={t["settings.vaultPath"]}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
                  />
                  <Button variant="ghost" size="icon-md" onClick={handleSelectDir}>
                    <FolderOpen size={16} />
                  </Button>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAddVault}
                  disabled={!newName.trim() || !newPath.trim()}
                >
                  <Plus size={16} />
                  {t["settings.addVault"]}
                </Button>
              </div>
            </div>
          </section>
        )}

        {category === "external" && (
          <section>
            <h3 className="text-base font-semibold text-gray-200 mb-1">{t["settings.external"]}</h3>
            <p className="text-xs text-gray-500 mb-5">{t["settings.externalDesc"]}</p>

            <div className="space-y-4">
              <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800/50">
                <div className="flex items-center gap-2 mb-3">
                  <Monitor size={14} className="text-blue-400" />
                  <span className="text-sm font-medium text-gray-300">{t["settings.browserPath"]}</span>
                </div>
                <div className="flex gap-2">
                  <input
                    value={browserPath}
                    onChange={(e) => setBrowserPath(e.target.value)}
                    onBlur={() => saveSetting("browser_path", browserPath)}
                    placeholder={t["settings.browserPathPlaceholder"]}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
                  />
                  <Button size="xs" onClick={() => handleSelectFile(setBrowserPath, "browser_path")} className="bg-gray-700 hover:bg-gray-600 text-gray-200 font-normal">
                    {t["settings.selectFile"]}
                  </Button>
                  <Button variant="secondary" size="xs" onClick={handleTestBrowser} className="text-blue-400 hover:text-blue-300 bg-blue-400/10 hover:bg-blue-400/20">
                    <ExternalLink size={12} />
                    {t["settings.browserTest"]}
                  </Button>
                </div>
              </div>

              <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800/50">
                <div className="flex items-center gap-2 mb-3">
                  <FolderOpen size={14} className="text-[var(--accent-text)]" />
                  <span className="text-sm font-medium text-gray-300">{t["settings.obsidianPath"]}</span>
                </div>
                <div className="flex gap-2">
                  <input
                    value={obsidianPath}
                    onChange={(e) => setObsidianPath(e.target.value)}
                    onBlur={() => saveSetting("obsidian_path", obsidianPath)}
                    placeholder={t["settings.obsidianPathPlaceholder"]}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
                  />
                  <Button size="xs" onClick={() => handleSelectFile(setObsidianPath, "obsidian_path")} className="bg-gray-700 hover:bg-gray-600 text-gray-200 font-normal">
                    {t["settings.selectFile"]}
                  </Button>
                  <Button variant="secondary" size="xs" onClick={handleTestObsidian} className="text-[var(--accent-text)] bg-[var(--accent-muted)] hover:opacity-80">
                    <ExternalLink size={12} />
                    {t["settings.obsidianTest"]}
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )}

        {category === "appearance" && (
          <section>
            <h3 className="text-base font-semibold text-gray-200 mb-1">{t["settings.appearance"]}</h3>
            <p className="text-xs text-gray-500 mb-5">{t["settings.appearanceDesc"]}</p>

            <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800/50 mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Palette size={14} className="text-[var(--accent-text)]" />
                <span className="text-sm font-medium text-gray-300">{t["settings.language"]}</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">{t["settings.languageDesc"]}</p>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setLangOpen(!langOpen)}
                  className="w-full flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 transition-colors hover:border-gray-600"
                >
                  <span>{langOptions.find((o) => o.value === lang)?.label}</span>
                  <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />
                </button>
                <DropdownMenu open={langOpen} onClose={() => setLangOpen(false)} className="left-0 top-full mt-1 w-full">
                  {langOptions.map((opt) => (
                    <DropdownMenuItem
                      key={opt.value}
                      onClick={() => { setLang(opt.value); setLangOpen(false); }}
                      active={lang === opt.value}
                    >
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenu>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {themes.map((th) => (
                <button
                  key={th.id}
                  onClick={() => setTheme(th.id)}
                  className={`p-4 rounded-xl border transition-all text-left ${
                    themeId === th.id
                      ? "border-[var(--accent)] bg-[var(--accent-muted)]"
                      : "border-gray-800 bg-gray-900/50 hover:border-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-8 h-8 rounded-full border-2 border-gray-700 flex-shrink-0"
                      style={{ backgroundColor: th.primary }}
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-200">{th.name}</div>
                      <div className="text-xs text-gray-500">{th.nameEn}</div>
                    </div>
                    {themeId === th.id && (
                      <div
                        className="ml-auto w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: th.primary }}
                      />
                    )}
                  </div>
                  <div className="flex gap-1">
                    {[
                      th.primaryHover,
                      th.primary,
                      th.primaryText,
                      th.primaryBorder,
                    ].map((c, i) => (
                      <div
                        key={i}
                        className="flex-1 h-2 rounded"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
