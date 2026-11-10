import { createElement } from "react";
import { FileText, Shapes, type LucideIcon } from "lucide-react";
import type { BlockRef, CalloutBlockRef } from "../blockModel";
import { CALLOUT_DEFAULT_TITLES, CALLOUT_TYPES } from "../callouts";
import { CALLOUT_ICONS } from "../calloutIcons";
import { setCalloutType } from "../blockActions";
import type { ContainerSpec } from "./types";

const icon = (Icon: LucideIcon) => createElement(Icon, { size: 14 });

export const calloutContainer: ContainerSpec = {
  kind: "callout",
  container: true,
  entry(ref: BlockRef) {
    const block = ref as CalloutBlockRef;
    // Body is the primary editing surface; the title is one Shift+Tab away
    return {
      target: { kind: "callout", part: "body", line: 0 },
      anchor: block.titleFrom,
    };
  },
  sourceAnchor(ref: BlockRef) {
    return (ref as CalloutBlockRef).titleFrom;
  },
  menu(ctx) {
    const block = ctx.ref as CalloutBlockRef;
    return [
      {
        label: ctx.t["blockCallout.type"],
        icon: icon(Shapes),
        children: CALLOUT_TYPES.map((type) => ({
          label: CALLOUT_DEFAULT_TITLES[type] ?? type,
          icon: icon(CALLOUT_ICONS[type] ?? FileText),
          checked: type === block.calloutType,
          onClick: () => setCalloutType(ctx.view, block, type),
        })),
      },
    ];
  },
  deleteLabel: (t) => t["blockCallout.delete"],
};
