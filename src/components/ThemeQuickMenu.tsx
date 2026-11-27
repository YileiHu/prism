import { Fragment, useRef, useState } from "react";
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import Button from "./Button";
import { DropdownMenu } from "./DropdownMenu";
import SegmentedToggle from "./SegmentedToggle";
import { useT } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";
import { themes } from "../shared/themes";
import { themeAccentFill } from "../lib/themePreview";
import type { ColorMode } from "../shared/settings";

export default function ThemeQuickMenu() {
  const { t, lang } = useT();
  const { themeId, setTheme, mode, setMode, resolvedMode, pinned } = useTheme();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const lockedHint = t[resolvedMode === "dark" ? "settings.themeLockedDark" : "settings.themeLockedLight"];

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
            value={pinned ? resolvedMode : mode}
            onChange={setMode}
            className="w-full"
            stretch
            options={[
              { value: "dark", label: t["settings.modeDark"], icon: Moon, disabled: pinned },
              { value: "light", label: t["settings.modeLight"], icon: Sun, disabled: pinned },
              { value: "system", label: t["settings.modeSystem"], icon: Monitor, disabled: pinned },
            ]}
          />
          {pinned && (
            <p className="px-1 pt-2 text-meta leading-relaxed text-muted">{lockedHint}</p>
          )}

          <div className="border-t border-strong/50 my-3" />

          <div className="px-1 pb-2 text-caption font-medium text-secondary">
            {t["settings.themeGrid"]}
          </div>
          <div className="grid grid-cols-2 gap-1">
            {themes.map((th, index) => {
              const active = th.id === themeId;
              const special = Boolean(th.accent2);
              const previousSpecial = Boolean(themes[index - 1]?.accent2);
              const onlyMode = th.modes.length === 1 ? th.modes[0] : null;
              const label = lang === "en" ? th.nameEn : th.name;
              const hint = onlyMode
                ? ` · ${t[onlyMode === "dark" ? "settings.themeDarkOnly" : "settings.themeLightOnly"]}`
                : "";
              return (
                <Fragment key={th.id}>
                  {special && !previousSpecial && (
                    <div
                      role="separator"
                      aria-hidden="true"
                      className="col-span-2 my-1 border-t border-strong/50"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setTheme(th.id)}
                    title={`${label}${hint}`}
                    aria-pressed={active}
                    className={`group flex items-center gap-2 rounded-control px-2 py-1.5 text-left transition-colors ${
                      active
                        ? "bg-[var(--accent-muted)] text-[var(--accent-text)]"
                        : "text-secondary hover:bg-hover"
                    }`}
                  >
                    <span
                      className="h-4 w-6 flex-shrink-0 rounded-chip border border-strong transition-transform group-hover:scale-105"
                      style={{ background: themeAccentFill(th) }}
                    />
                    <span className="min-w-0 flex-1 truncate text-caption">{label}</span>
                    <Check
                      size={12}
                      strokeWidth={2.5}
                      className={`flex-shrink-0 ${active ? "text-[var(--accent-text)]" : "opacity-0"}`}
                    />
                  </button>
                </Fragment>
              );
            })}
          </div>
        </div>
      </DropdownMenu>
    </>
  );
}
