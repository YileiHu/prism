import { createElement } from "react";
import { Copy, type LucideIcon } from "lucide-react";
import type { BlockRef } from "../blockModel";
import type { EmbedBlockRef } from "../embedBlockModel";
import { copyText } from "../blockActions";
import type { ContainerSpec } from "./types";

const icon = (Icon: LucideIcon) => createElement(Icon, { size: 14 });

// Embeds are source-only leaves: the card itself stays interactive (open,
// caption, size) and editing always happens on the markdown line.
export const embedContainer: ContainerSpec = {
  kind: "embed",
  container: false,
  entry(ref: BlockRef) {
    const block = ref as EmbedBlockRef;
    return {
      target: { kind: "embed", part: "source" },
      anchor: block.replaceFrom,
    };
  },
  sourceAnchor(ref: BlockRef) {
    return (ref as EmbedBlockRef).replaceFrom;
  },
  menu(ctx) {
    if (ctx.source) return [];
    const block = ctx.ref as EmbedBlockRef;
    const raw = block.embeds[0]?.syntaxRaw;
    if (!raw) return [];
    return [
      {
        label: ctx.t["embed.copySyntax"],
        icon: icon(Copy),
        onClick: () => {
          void copyText(raw).then((ok) => {
            ctx.showToast(ok ? ctx.t["embed.copied"] : ctx.t["embed.copyFailed"], ok ? undefined : "error");
          });
        },
      },
    ];
  },
  deleteLabel: (t) => t["embed.delete"],
};
