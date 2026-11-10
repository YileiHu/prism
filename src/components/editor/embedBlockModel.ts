import type { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import {
  parseEmbedSpec,
  parseMarkdownImage,
  type EmbedSpec,
} from "../embeds/model";

export interface EditorEmbed {
  spec: EmbedSpec;
  syntax: "embed" | "md";
  from: number;
  to: number;
  raw: string;
  syntaxFrom: number;
  syntaxTo: number;
  syntaxRaw: string;
}

export interface EmbedBlockRef {
  kind: "embed";
  from: number;
  to: number;
  replaceFrom: number;
  replaceTo: number;
  embeds: EditorEmbed[];
}

function isInCode(state: EditorState, pos: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  while (node) {
    if (node.name === "FencedCode" || node.name === "CodeBlock"
      || node.name === "CodeText" || node.name === "InlineCode"
      || node.name === "HTMLBlock") return true;
    node = node.parent;
  }
  return false;
}

export function sameEmbed(a: EditorEmbed, b: EditorEmbed): boolean {
  return a.syntax === b.syntax
    && a.raw === b.raw
    && a.syntaxRaw === b.syntaxRaw
    && a.spec.kind === b.spec.kind
    && a.spec.target === b.spec.target
    && (a.spec.label ?? "") === (b.spec.label ?? "")
    && a.spec.size?.width === b.spec.size?.width
    && a.spec.size?.height === b.spec.size?.height;
}

export function collectEmbeds(
  state: EditorState,
  line: { from: number; text: string },
): EditorEmbed[] {
  const embeds: EditorEmbed[] = [];

  {
    const re = /!\[\[([^\[\]\n]+)\]\]/g;
    for (let m = re.exec(line.text); m; m = re.exec(line.text)) {
      if (isInCode(state, line.from + m.index)) continue;
      const inner = m[1];
      const spec = parseEmbedSpec(inner);
      if (!spec.target) continue;
      const syntaxFrom = line.from + m.index;
      const from = syntaxFrom + 3;
      embeds.push({
        spec,
        syntax: "embed",
        from,
        to: from + inner.length,
        raw: inner,
        syntaxFrom,
        syntaxTo: syntaxFrom + m[0].length,
        syntaxRaw: m[0],
      });
    }
  }

  {
    const re = /!\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^\s)]+))[^)]*\)/g;
    for (let m = re.exec(line.text); m; m = re.exec(line.text)) {
      if (isInCode(state, line.from + m.index)) continue;
      const rawAlt = m[1];
      const syntaxFrom = line.from + m.index;
      const from = syntaxFrom + 2;
      embeds.push({
        spec: parseMarkdownImage(rawAlt, (m[2] ?? m[3]).replace(/^<|>$/g, "")),
        syntax: "md",
        from,
        to: from + rawAlt.length,
        raw: rawAlt,
        syntaxFrom,
        syntaxTo: syntaxFrom + m[0].length,
        syntaxRaw: m[0],
      });
    }
  }

  return embeds;
}

export function isEmbedOnlyLine(text: string, embeds: EditorEmbed[]): boolean {
  if (embeds.length === 0) return false;
  let rest = text;
  for (const embed of embeds) {
    const index = rest.indexOf(embed.syntaxRaw);
    if (index === -1) return false;
    rest = rest.slice(0, index) + rest.slice(index + embed.syntaxRaw.length);
  }
  return rest.trim() === "";
}

export function embedBlockAt(state: EditorState, pos: number): EmbedBlockRef | null {
  const bounded = Math.max(0, Math.min(pos, state.doc.length));
  const line = state.doc.lineAt(bounded);
  const embeds = collectEmbeds(state, line);
  if (!isEmbedOnlyLine(line.text, embeds)) return null;
  return {
    kind: "embed",
    from: line.from,
    to: line.to,
    replaceFrom: line.from,
    replaceTo: line.to,
    embeds,
  };
}
