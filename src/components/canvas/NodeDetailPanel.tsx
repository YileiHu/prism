import { useEffect, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Bold,
  ExternalLink,
  StickyNote,
  X,
} from "lucide-react";
import { useT } from "../../i18n";
import type { CanvasNode, CanvasTextAlign, CanvasVerticalAlign } from "../../lib/canvas/model";
import { targetTitle } from "../../lib/canvas/targets";
import { AUTO_SWATCH_COLOR, ColorSwatchPicker } from "../ColorPicker";
import Button from "../Button";
import { Textarea } from "../Input";

const FONT_SIZE_OPTIONS = [12, 14, 18, 24] as const;

interface Props {
  node: CanvasNode;
  onChangeText: (text: string) => void;
  onChangeNotes: (notes: string) => void;
  onChangeColor: (color: string) => void;
  onChangeAlign: (align: CanvasTextAlign) => void;
  onChangeVAlign: (valign: CanvasVerticalAlign) => void;
  onChangeFontSize: (size: number) => void;
  onChangeBold: (bold: boolean) => void;
  onChangeTarget: () => void;
  onOpenTarget: () => void;
  onUnlinkTarget: () => void;
  onClose: () => void;
}

export default function NodeDetailPanel({
  node,
  onChangeText,
  onChangeNotes,
  onChangeColor,
  onChangeAlign,
  onChangeVAlign,
  onChangeFontSize,
  onChangeBold,
  onChangeTarget,
  onOpenTarget,
  onUnlinkTarget,
  onClose,
}: Props) {
  const { t } = useT();
  const [text, setText] = useState(node.text);
  const [notes, setNotes] = useState(node.notes);

  useEffect(() => {
    setText(node.text);
  }, [node.text]);

  useEffect(() => {
    setNotes(node.notes);
  }, [node.notes]);

  const commitText = () => {
    const next = text.trim();
    if (next !== node.text) onChangeText(next);
  };
  const commitNotes = () => {
    if (notes !== node.notes) onChangeNotes(notes);
  };

  return (
    <div className="panel-floating">
      <div className="flex items-center gap-1.5 px-2.5 h-8 border-b border-line/50 flex-shrink-0">
        <StickyNote size={13} className="text-muted flex-shrink-0" />
        <span className="text-caption font-medium text-secondary flex-1 truncate">
          {t["canvas.nodeDetail"]}
        </span>
        <Button variant="ghost" size="icon-xs" onClick={onClose} title={t["editor.closeTab"]}>
          <X size={13} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
        <div>
          <label className="field-label">{t["canvas.text"]}</label>
          <Textarea
            value={text}
            rows={2}
            spellCheck={false}
            placeholder={t["canvas.textPlaceholder"]}
            onChange={(event) => setText(event.target.value)}
            onBlur={commitText}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            className="w-full resize-none"
          />
        </div>

        <div>
          <label className="field-label">{t["canvas.textStyle"]}</label>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              active={node.align === "left"}
              onClick={() => onChangeAlign("left")}
              title={t["canvas.alignLeft"]}
            >
              <AlignLeft size={15} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              active={node.align === "center"}
              onClick={() => onChangeAlign("center")}
              title={t["canvas.alignCenterX"]}
            >
              <AlignCenter size={15} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              active={node.align === "right"}
              onClick={() => onChangeAlign("right")}
              title={t["canvas.alignRight"]}
            >
              <AlignRight size={15} />
            </Button>
            <span className="mx-0.5 h-4 w-px bg-line/60" />
            <Button
              variant="ghost"
              size="icon-sm"
              active={node.valign === "top"}
              onClick={() => onChangeVAlign("top")}
              title={t["canvas.alignTop"]}
            >
              <AlignVerticalJustifyStart size={15} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              active={node.valign === "middle"}
              onClick={() => onChangeVAlign("middle")}
              title={t["canvas.alignCenterY"]}
            >
              <AlignVerticalJustifyCenter size={15} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              active={node.valign === "bottom"}
              onClick={() => onChangeVAlign("bottom")}
              title={t["canvas.alignBottom"]}
            >
              <AlignVerticalJustifyEnd size={15} />
            </Button>
          </div>
          <div className="mt-1 flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              active={node.bold}
              onClick={() => onChangeBold(!node.bold)}
              title={t["canvas.bold"]}
            >
              <Bold size={15} />
            </Button>
            <span className="mx-0.5 h-4 w-px bg-line/60" />
            {FONT_SIZE_OPTIONS.map((size) => (
              <Button
                key={size}
                variant="ghost"
                size="xs"
                active={node.fontSize === size}
                onClick={() => onChangeFontSize(size)}
                title={`${t["canvas.fontSize"]} ${size}px`}
              >
                {size}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <label className="field-label">{t["canvas.target"]}</label>
          {node.target ? (
            <div className="space-y-1.5">
              <p className="text-caption text-secondary break-all">{targetTitle(node.target)}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button variant="secondary" size="xs" onClick={onOpenTarget}>
                  <ExternalLink size={12} />
                  {t["canvas.openTargetShort"]}
                </Button>
                <Button variant="ghost" size="xs" onClick={onChangeTarget}>
                  {t["canvas.changeTargetShort"]}
                </Button>
                <Button variant="ghost" size="xs" onClick={onUnlinkTarget}>
                  {t["canvas.unlinkTarget"]}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-caption text-faint">{t["canvas.noTarget"]}</p>
              <Button variant="secondary" size="xs" onClick={onChangeTarget}>
                <ExternalLink size={12} />
                {t["canvas.linkTarget"]}
              </Button>
            </div>
          )}
        </div>

        <div>
          <label className="field-label">{t["canvas.color"]}</label>
          <ColorSwatchPicker
            name={node.text || node.id}
            value={node.color}
            autoBar={AUTO_SWATCH_COLOR}
            onChange={onChangeColor}
          />
        </div>

        <div>
          <label className="field-label">{t["canvas.notes"]}</label>
          <Textarea
            value={notes}
            rows={4}
            spellCheck={false}
            placeholder={t["canvas.notesPlaceholder"]}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={commitNotes}
            className="w-full resize-none text-caption"
          />
        </div>
      </div>
    </div>
  );
}
