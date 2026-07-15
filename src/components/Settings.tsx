import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, FolderOpen, ExternalLink, Monitor, Palette, Database, Wrench } from "lucide-react";
import { useT } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";
import { themes } from "../theme/themes";
import "../lib/api";

interface VaultEntry {
  name: string;
  path: string;
}

type SettingsCategory = "vaults" | "external" | "appearance";

const SIDEBAR_WIDTH = "w-48";

export default function Settings() {
  const { t } = useT();
  const { theme: currentTheme, setTheme, themeId } = useTheme();
  const [category, setCategory] = useState<SettingsCategory>("vaults");
  const [vaults, setVaults] = useState<VaultEntry[]>([]);
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [saved, setSaved] = useState(false);
  const [browserPath, setBrowserPath] = useState("");
  const [obsidianPath, setObsidianPath] = useState("");

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
  };

  const flashSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const saveVaults = useCallback(async (updated: VaultEntry[]) => {
    await window.prism.setSetting("vault_paths", JSON.stringify(updated));
    setVaults(updated);
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
      <aside className={`${SIDEBAR_WIDTH} flex-shrink-0 border-r border-gray-800 flex flex-col py-4`}>
        <div className="px-4 mb-3">
          <h2 className="text-sm font-semibold text-gray-300">{t["settings.title"]}</h2>
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
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
          <div className="px-4 pt-2 border-t border-gray-800/50 mt-2">
            <span className="text-xs text-green-400">Settings saved</span>
          </div>
        )}
      </aside>

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
                  <button
                    onClick={() => handleRemoveVault(i)}
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded flex-shrink-0 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
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
                  <button onClick={handleSelectDir} className="p-2 text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                    <FolderOpen size={16} />
                  </button>
                </div>
                <button
                  onClick={handleAddVault}
                  disabled={!newName.trim() || !newPath.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 rounded-lg text-sm font-medium text-white transition-colors"
                >
                  <Plus size={16} />
                  {t["settings.addVault"]}
                </button>
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
                  <button onClick={() => handleSelectFile(setBrowserPath, "browser_path")} className="px-3 py-2 text-xs text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                    {t["settings.selectFile"]}
                  </button>
                  <button onClick={handleTestBrowser} className="flex items-center gap-1 px-3 py-2 text-xs text-blue-400 hover:text-blue-300 bg-blue-400/10 hover:bg-blue-400/20 rounded-lg transition-colors">
                    <ExternalLink size={12} />
                    {t["settings.browserTest"]}
                  </button>
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
                  <button onClick={() => handleSelectFile(setObsidianPath, "obsidian_path")} className="px-3 py-2 text-xs text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                    {t["settings.selectFile"]}
                  </button>
                  <button onClick={handleTestObsidian} className="flex items-center gap-1 px-3 py-2 text-xs text-[var(--accent-text)] hover:opacity-80 bg-[var(--accent-muted)] rounded-lg transition-colors">
                    <ExternalLink size={12} />
                    {t["settings.obsidianTest"]}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {category === "appearance" && (
          <section>
            <h3 className="text-base font-semibold text-gray-200 mb-1">{t["settings.appearance"]}</h3>
            <p className="text-xs text-gray-500 mb-5">{t["settings.appearanceDesc"]}</p>

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
