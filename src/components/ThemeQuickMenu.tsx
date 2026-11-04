import { useRef, useState } from "react";
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import Button from "./Button";
import { DropdownMenu } from "./DropdownMenu";
import SegmentedToggle from "./SegmentedToggle";
import { useT } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";
import { themes } from "../theme/themes";
import type { ColorMode } from "../shared/settings";

export default function ThemeQuickMenu() {
  const { t, lang } = useT();
  const { themeId, setTheme, mode, setMode } = useTheme();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        ref={anchorRef}
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen((v) => !v)}
        title={t["settings.appearance"]}
        aria-haspopup="menu"
        aria-expanded={open}
        active={open}
        className={open ? "chrome-pill-active" : ""}
      >
        <Palette size={16} strokeWidth={1.5} />
      </Button>

      <DropdownMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        align="right"
      >
        <div className="w-72 p-1.5">
          <div className="px-1 pb-2 text-caption font-medium text-secondary">
            {t["settings.colorMode"]}
          </div>
          <SegmentedToggle<ColorMode>
            value={mode}
            onChange={setMode}
            className="w-full"
            stretch
            options={[
              { value: "dark", label: t["settings.modeDark"], icon: Moon },
              { value: "light", label: t["settings.modeLight"], icon: Sun },
              { value: "system", label: t["settings.modeSystem"], icon: Monitor },
            ]}
          />

          <div className="border-t border-strong/50 my-3" />

          <div className="px-1 pb-2 text-caption font-medium text-secondary">
            {t["settings.themeGrid"]}
          </div>
          <div className="grid grid-cols-2 gap-1">
            {themes.map((th) => {
              const active = th.id === themeId;
              return (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => setTheme(th.id)}
                  title={lang === "en" ? th.nameEn : th.name}
                  aria-pressed={active}
                  className={`group flex items-center gap-2 rounded-control px-2 py-1.5 text-left transition-colors ${
                    active
                      ? "bg-[var(--accent-muted)] text-[var(--accent-text)]"
                      : "text-secondary hover:bg-hover"
                  }`}
                >
                  <span
                    className="h-4 w-6 flex-shrink-0 rounded-chip border border-strong transition-transform group-hover:scale-105"
                    style={{ backgroundColor: th.primary }}
                  />
                  <span className="min-w-0 flex-1 truncate text-caption">
                    {lang === "en" ? th.nameEn : th.name}
                  </span>
                  <Check
                    size={12}
                    strokeWidth={2.5}
                    className={`flex-shrink-0 ${active ? "text-[var(--accent-text)]" : "opacity-0"}`}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </DropdownMenu>
    </>
  );
}
