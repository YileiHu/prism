import { createElement } from "react";
import {
  ChevronsDownUp, ChevronsUpDown, Copy, Languages, type LucideIcon,
} from "lucide-react";
import type { BlockRef, CodeBlockRef } from "../blockModel";
import { isCodeFolded } from "../blockState";
import { copyText, setCodeLanguage, toggleCodeFoldAt } from "../blockActions";
import { COMMON_CODE_LANGUAGES } from "../codeLanguages";
import type { ContainerSpec } from "./types";

const icon = (Icon: LucideIcon) => createElement(Icon, { size: 14 });

export const codeContainer: ContainerSpec = {
  kind: "code",
  container: true,
  entry(ref: BlockRef) {
    const block = ref as CodeBlockRef;
    return {
      target: { kind: "code", part: "body", line: 0, offset: 0 },
      anchor: block.bodyFrom,
    };
  },
  sourceAnchor(ref: BlockRef) {
    return (ref as CodeBlockRef).bodyFrom;
  },
  menu(ctx) {
    const block = ctx.ref as CodeBlockRef;
    const folded = isCodeFolded(ctx.view.state, block.from);
    return [
      {
        label: ctx.t["blockCode.language"],
        icon: icon(Languages),
        children: COMMON_CODE_LANGUAGES.map((lang) => ({
          label: lang === "text" ? ctx.t["blockCode.plainText"] : lang,
          checked: (block.lang || "text") === lang,
          onClick: () => setCodeLanguage(ctx.view, block, lang === "text" ? "" : lang),
        })),
      },
      {
        label: ctx.t["blockCode.copy"],
        icon: icon(Copy),
        onClick: () => {
          void copyText(block.code).then((ok) => {
            ctx.showToast(ok ? ctx.t["blockCode.copied"] : ctx.t["blockCode.copyFailed"], ok ? undefined : "error");
          });
        },
      },
      {
        label: folded ? ctx.t["blockCode.unfold"] : ctx.t["blockCode.fold"],
        icon: icon(folded ? ChevronsUpDown : ChevronsDownUp),
        onClick: () => {
          if (!toggleCodeFoldAt(ctx.view, block) && !folded) {
            ctx.showToast(ctx.t["blockCode.foldAtEnd"], "error");
          }
        },
      },
    ];
  },
  deleteLabel: (t) => t["blockCode.delete"],
};
