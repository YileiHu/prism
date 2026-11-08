import { useT } from "../../i18n";
import { useSettings } from "../../lib/settings";
import type { AppSettings } from "../../shared/settings";
import { NumberInput, SectionHeader, Select, SettingRow, Toggle } from "./controls";

export default function CanvasSection() {
  const { t } = useT();
  const { values, set } = useSettings();

  return (
    <section>
      <SectionHeader title={t["settings.catCanvas"]} description={t["settings.canvasDesc"]} />

      <div className="space-y-3">
        <SettingRow label={t["settings.canvasMinimap"]} description={t["settings.canvasMinimapDesc"]}>
          <Select
            value={values.canvas_minimap_position}
            options={[
              { value: "off", label: t["settings.canvasMinimapOff"] },
              { value: "top-left", label: t["settings.canvasMinimapTopLeft"] },
              { value: "top-right", label: t["settings.canvasMinimapTopRight"] },
              { value: "bottom-left", label: t["settings.canvasMinimapBottomLeft"] },
              { value: "bottom-right", label: t["settings.canvasMinimapBottomRight"] },
            ]}
            onChange={(v) => set("canvas_minimap_position", v as AppSettings["canvas_minimap_position"])}
          />
        </SettingRow>

        <SettingRow label={t["settings.canvasBackground"]} description={t["settings.canvasBackgroundDesc"]}>
          <Select
            value={values.canvas_background}
            options={[
              { value: "dots", label: t["settings.canvasBgDots"] },
              { value: "lines", label: t["settings.canvasBgLines"] },
              { value: "cross", label: t["settings.canvasBgCross"] },
              { value: "none", label: t["settings.canvasBgNone"] },
            ]}
            onChange={(v) => set("canvas_background", v as AppSettings["canvas_background"])}
          />
        </SettingRow>

        <SettingRow label={t["settings.canvasGridSize"]} description={t["settings.canvasGridSizeDesc"]}>
          <NumberInput
            value={values.canvas_grid_size}
            min={10}
            max={60}
            step={2}
            suffix="px"
            onChange={(v) => set("canvas_grid_size", v)}
          />
        </SettingRow>

        <SettingRow label={t["settings.canvasSnap"]} description={t["settings.canvasSnapDesc"]}>
          <Toggle checked={values.canvas_snap_to_grid} onChange={(v) => set("canvas_snap_to_grid", v)} />
        </SettingRow>
      </div>
    </section>
  );
}
