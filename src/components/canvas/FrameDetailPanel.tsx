import { Frame, Lock, X } from "lucide-react";
import { useT } from "../../i18n";
import type { CanvasGroup } from "../../lib/canvas/model";
import { AUTO_SWATCH_COLOR, ColorSwatchPicker } from "../ColorPicker";
import Button from "../Button";
import { TextField, Toggle } from "../settings/controls";

interface Props {
  frame: CanvasGroup;
  onChangeName: (name: string) => void;
  onChangeColor: (color: string) => void;
  onChangeMoveContents: (value: boolean) => void;
  onChangeLocked: (value: boolean) => void;
  onClose: () => void;
}

export default function FrameDetailPanel({
  frame,
  onChangeName,
  onChangeColor,
  onChangeMoveContents,
  onChangeLocked,
  onClose,
}: Props) {
  const { t } = useT();

  return (
    <div className="absolute right-3 top-3 bottom-6 z-20 w-64 flex flex-col rounded-control border border-line/50 bg-surface shadow-popover overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 h-8 border-b border-line/50 flex-shrink-0">
        <Frame size={13} className="text-muted flex-shrink-0" />
        <span className="text-caption font-medium text-secondary flex-1 truncate">
          {t["canvas.frameDetail"]}
        </span>
        <Button variant="ghost" size="icon-xs" onClick={onClose} title={t["editor.closeTab"]}>
          <X size={13} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
        <div>
          <label className="block text-caption text-muted mb-1">{t["canvas.frameName"]}</label>
          <TextField
            value={frame.name}
            onCommit={onChangeName}
            placeholder={t["canvas.groupNamePlaceholder"]}
          />
        </div>

        <div>
          <label className="block text-caption text-muted mb-1">{t["canvas.color"]}</label>
          <ColorSwatchPicker
            name={frame.name || frame.id}
            value={frame.color}
            autoBar={AUTO_SWATCH_COLOR}
            onChange={onChangeColor}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-caption text-secondary">{t["canvas.frameMoveContents"]}</p>
            <p className="text-caption text-muted leading-snug">
              {t["canvas.frameMoveContentsHint"]}
            </p>
          </div>
          <Toggle checked={frame.moveContents} onChange={onChangeMoveContents} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-caption text-secondary">
              <Lock size={11} />
              {t["canvas.frameLocked"]}
            </p>
            <p className="text-caption text-muted leading-snug">{t["canvas.frameLockedHint"]}</p>
          </div>
          <Toggle checked={frame.locked} onChange={onChangeLocked} />
        </div>
      </div>
    </div>
  );
}
