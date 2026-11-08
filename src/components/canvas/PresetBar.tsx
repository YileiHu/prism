import type { CanvasPreset } from "../../shared/settings";
import { PRESET_MIME } from "../../lib/canvas/presets";
import { useT } from "../../i18n";

interface Props {
  presets: CanvasPreset[];
  onContextMenu: (preset: CanvasPreset, event: React.MouseEvent) => void;
}

export default function PresetBar({ presets, onContextMenu }: Props) {
  const { t } = useT();
  if (presets.length === 0) return null;

  return (
    <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-control border border-line/50 bg-surface/95 p-1 shadow-popover">
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          draggable
          title={`${preset.name || t["canvas.presetUntitled"]} — ${t["canvas.presetDragHint"]}`}
          aria-label={preset.name || t["canvas.presetUntitled"]}
          onDragStart={(event) => {
            event.dataTransfer.setData(PRESET_MIME, JSON.stringify(preset));
            event.dataTransfer.effectAllowed = "copy";
          }}
          onContextMenu={(event) => onContextMenu(preset, event)}
          className="flex h-8 max-w-44 cursor-grab items-center rounded-chip border px-2 text-caption text-secondary transition-shadow hover:ring-1 hover:ring-[var(--accent)] active:cursor-grabbing"
          style={{
            borderColor: preset.color
              ? `color-mix(in srgb, ${preset.color} 55%, transparent)`
              : "rgb(var(--c-line))",
            backgroundColor: preset.color
              ? `color-mix(in srgb, ${preset.color} 12%, rgb(var(--c-surface)))`
              : undefined,
          }}
        >
          <span className="min-w-0 truncate">
            {preset.name || t["canvas.presetUntitled"]}
          </span>
        </button>
      ))}
    </div>
  );
}
