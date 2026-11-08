import { Palette } from "lucide-react";
import { useT } from "../i18n";
import type { Translation } from "../i18n/zh";
import { TAG_COLORS, hashColor } from "../lib/colors";
import type { MenuItem } from "./ContextMenu";

// Neutral swatch for the "auto" option where auto means "no explicit color".
export const AUTO_SWATCH_COLOR = "rgb(var(--c-strong))";

function Swatch({ color }: { color: string }) {
  return <span className="block w-3 h-3 rounded-full" style={{ backgroundColor: color }} />;
}

interface ColorMenuItemOptions {
  label: string;
  autoLabel: string;
  autoSource: string;
  autoBar?: string;
  current?: string | null;
  onSelect: (color: string) => void;
}

export function buildColorMenuItem(t: Translation, options: ColorMenuItemOptions): MenuItem {
  const { label, autoLabel, autoSource, autoBar, current, onSelect } = options;
  return {
    label,
    icon: <Palette size={14} />,
    children: [
      {
        label: autoLabel,
        icon: <Swatch color={autoBar ?? hashColor(autoSource).bar} />,
        checked: !current,
        onClick: () => onSelect(""),
      },
      ...TAG_COLORS.map((color) => ({
        label: t[`tagColor.${color.key}`],
        icon: <Swatch color={color.bar} />,
        checked: current?.toLowerCase() === color.bar,
        onClick: () => onSelect(color.bar),
      })),
    ],
  };
}

interface ColorSwatchPickerProps {
  name: string;
  value: string;
  autoBar?: string;
  onChange: (color: string) => void;
}

export function ColorSwatchPicker({ name, value, autoBar, onChange }: ColorSwatchPickerProps) {
  const { t } = useT();
  const autoLabel = t["collections.colorAuto"];
  const options = [
    { key: "auto", label: autoLabel, bar: autoBar ?? hashColor(name).bar, color: "" },
    ...TAG_COLORS.map((color) => ({
      key: color.key,
      label: t[`tagColor.${color.key}`],
      bar: color.bar,
      color: color.bar,
    })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      {options.map((option, index) => {
        const selected = option.color === "" ? !value : value.toLowerCase() === option.bar;
        return (
          <div key={option.key} className="flex items-center gap-2">
            {index === 1 && <span className="w-px h-4 bg-strong/50 mr-0.5" />}
            <button
              type="button"
              aria-label={option.label}
              aria-pressed={selected}
              title={option.label}
              onClick={() => onChange(option.color)}
              className="w-6 h-6 rounded-full transition-transform hover:scale-110"
              style={{
                backgroundColor: option.bar,
                boxShadow: selected
                  ? "0 0 0 2px var(--accent)"
                  : "inset 0 0 0 1px light-dark(rgba(15,23,42,0.2), rgba(255,255,255,0.12))",
              }}
            />
            {index === 0 && <span className="text-caption text-muted">{autoLabel}</span>}
          </div>
        );
      })}
    </div>
  );
}
