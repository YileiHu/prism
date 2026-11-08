import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  Frame,
} from "lucide-react";
import { useT } from "../../i18n";
import type { AlignMode, DistributeMode } from "../../lib/canvas/geometry";
import Button from "../Button";

interface Props {
  count: number;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (mode: DistributeMode) => void;
  onCreateFrame: () => void;
}

export default function SelectionToolbar({ count, onAlign, onDistribute, onCreateFrame }: Props) {
  const { t } = useT();
  const canDistribute = count >= 3;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 rounded-control border border-line bg-surface px-1 py-1 shadow-popover">
      <Button variant="ghost" size="icon-sm" onClick={() => onAlign("left")} title={t["canvas.alignLeft"]}>
        <AlignStartVertical size={15} />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => onAlign("centerX")} title={t["canvas.alignCenterX"]}>
        <AlignCenterVertical size={15} />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => onAlign("right")} title={t["canvas.alignRight"]}>
        <AlignEndVertical size={15} />
      </Button>
      <span className="mx-0.5 h-4 w-px bg-line/60" />
      <Button variant="ghost" size="icon-sm" onClick={() => onAlign("top")} title={t["canvas.alignTop"]}>
        <AlignStartHorizontal size={15} />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => onAlign("centerY")} title={t["canvas.alignCenterY"]}>
        <AlignCenterHorizontal size={15} />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => onAlign("bottom")} title={t["canvas.alignBottom"]}>
        <AlignEndHorizontal size={15} />
      </Button>
      <span className="mx-0.5 h-4 w-px bg-line/60" />
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!canDistribute}
        onClick={() => onDistribute("horizontal")}
        title={t["canvas.distributeX"]}
      >
        <AlignHorizontalSpaceBetween size={15} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!canDistribute}
        onClick={() => onDistribute("vertical")}
        title={t["canvas.distributeY"]}
      >
        <AlignVerticalSpaceBetween size={15} />
      </Button>
      <span className="mx-0.5 h-4 w-px bg-line/60" />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onCreateFrame}
        title={t["canvas.createFrame"]}
      >
        <Frame size={15} />
      </Button>
    </div>
  );
}
