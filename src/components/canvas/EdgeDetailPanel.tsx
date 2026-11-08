import { useEffect, useState } from "react";
import { Spline, X } from "lucide-react";
import { useT } from "../../i18n";
import {
  EDGE_WIDTHS,
  LINE_STYLES,
  type CanvasEdge,
  type CanvasLineStyle,
} from "../../lib/canvas/model";
import { AUTO_SWATCH_COLOR, ColorSwatchPicker } from "../ColorPicker";
import Button from "../Button";
import Input from "../Input";

export const EDGE_WIDTH_LABEL_KEYS: Record<
  number,
  "canvas.widthThin" | "canvas.widthMedium" | "canvas.widthThick"
> = {
  1.5: "canvas.widthThin",
  2.5: "canvas.widthMedium",
  4: "canvas.widthThick",
};

const LINE_STYLE_KEYS: Record<CanvasLineStyle, "canvas.lineSolid" | "canvas.lineDashed"> = {
  solid: "canvas.lineSolid",
  dashed: "canvas.lineDashed",
};

interface Props {
  edge: CanvasEdge;
  autoSource: string;
  onChangeLabel: (label: string) => void;
  onChangeColor: (color: string) => void;
  onChangeWidth: (width: number) => void;
  onChangeLineStyle: (style: CanvasLineStyle) => void;
  onClose: () => void;
}

export default function EdgeDetailPanel({
  edge,
  autoSource,
  onChangeLabel,
  onChangeColor,
  onChangeWidth,
  onChangeLineStyle,
  onClose,
}: Props) {
  const { t } = useT();
  const [label, setLabel] = useState(edge.label);

  useEffect(() => {
    setLabel(edge.label);
  }, [edge.id, edge.label]);

  const commitLabel = () => {
    const next = label.trim();
    if (next !== edge.label) onChangeLabel(next);
  };

  return (
    <div className="absolute right-3 top-3 bottom-6 z-20 w-64 flex flex-col rounded-control border border-line/50 bg-surface shadow-popover overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 h-8 border-b border-line/50 flex-shrink-0">
        <Spline size={13} className="text-muted flex-shrink-0" />
        <span className="text-caption font-medium text-secondary flex-1 truncate">
          {t["canvas.edgeDetail"]}
        </span>
        <Button variant="ghost" size="icon-xs" onClick={onClose} title={t["editor.closeTab"]}>
          <X size={13} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
        <div>
          <label className="block text-caption text-muted mb-1">{t["canvas.edgeLabel"]}</label>
          <Input
            value={label}
            spellCheck={false}
            placeholder={t["canvas.edgeLabelPlaceholder"]}
            onChange={(event) => setLabel(event.target.value)}
            onBlur={commitLabel}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-caption text-muted mb-1">{t["canvas.color"]}</label>
          <ColorSwatchPicker
            name={autoSource}
            value={edge.color ?? ""}
            autoBar={AUTO_SWATCH_COLOR}
            onChange={onChangeColor}
          />
        </div>

        <div>
          <label className="block text-caption text-muted mb-1">{t["canvas.strokeWidth"]}</label>
          <div className="flex items-center gap-1">
            {EDGE_WIDTHS.map((width) => (
              <Button
                key={width}
                variant="ghost"
                size="xs"
                active={edge.strokeWidth === width}
                onClick={() => onChangeWidth(width)}
                title={`${width}px`}
              >
                {t[EDGE_WIDTH_LABEL_KEYS[width]]}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-caption text-muted mb-1">{t["canvas.lineStyle"]}</label>
          <div className="flex items-center gap-1">
            {LINE_STYLES.map((style) => (
              <Button
                key={style}
                variant="ghost"
                size="xs"
                active={edge.lineStyle === style}
                onClick={() => onChangeLineStyle(style)}
              >
                {t[LINE_STYLE_KEYS[style]]}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
