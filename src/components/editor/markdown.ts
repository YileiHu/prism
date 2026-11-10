import MarkdownIt from "markdown-it";
import type { MarkdownIt as MarkdownItType, StateCore, StateInline, Token } from "markdown-it";
import markPlugin from "markdown-it-mark";
import taskLists from "markdown-it-task-lists";
import { load as loadYaml } from "js-yaml";
import { katex } from "@mdit/plugin-katex";
import { highlightCode } from "./codeHighlight";
import { CALLOUT_DEFAULT_TITLES, CALLOUT_FAMILIES, CALLOUT_RE } from "./callouts";
import { formatSizeToken, imageSizeAttrs, parseImageAlt } from "./imageSize";
import { IMAGE_EXTS, assetSrc, prismFileUrl, type AssetContext } from "./assetUrl";
import {
  clampEmbedSize,
  detectEmbedKind,
  domainOf,
  parseEmbedSpec,
  type EmbedKind,
  type EmbedSpec,
} from "../embeds/model";

export { IMAGE_EXTS, prismFileUrl };
export type { AssetContext };
export { CALLOUT_FAMILIES } from "./callouts";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const TAG_RE = /^#([\p{L}\p{N}_/-]+)/u;

// ---- Callout: "> [!type] Title" → styled div with a title bar ----

function transformCallouts(state: StateCore): void {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== "blockquote_open") continue;

    let depth = 1;
    let closeIdx = -1;
    for (let j = i + 1; j < tokens.length; j++) {
      if (tokens[j].type === "blockquote_open") depth++;
      else if (tokens[j].type === "blockquote_close" && --depth === 0) {
        closeIdx = j;
        break;
      }
    }
    if (closeIdx === -1) continue;

    const pOpen = tokens[i + 1];
    const inline = tokens[i + 2];
    const pClose = tokens[i + 3];
    if (!pOpen || pOpen.type !== "paragraph_open" || !inline || inline.type !== "inline" || !pClose || pClose.type !== "paragraph_close") continue;
    const firstChild = inline.children?.[0];
    if (!firstChild || firstChild.type !== "text") continue;

    const m = CALLOUT_RE.exec(firstChild.content);
    if (!m) continue;
    const type = m[1].toLowerCase();
    const family = CALLOUT_FAMILIES[type];
    if (!family) continue;
    const title = m[3].trim() || CALLOUT_DEFAULT_TITLES[type] || type;

    tokens[i].tag = "div";
    tokens[i].attrSet("class", "callout");
    tokens[i].attrSet("data-callout", family);
    // The matching close must swap tags too, otherwise the emitted
    // </blockquote> can't close the <div> and the rest of the document
    // gets swallowed into the callout
    tokens[closeIdx].tag = "div";

    pOpen.tag = "div";
    pOpen.hidden = false;
    pOpen.attrSet("class", "callout-title");
    pClose.tag = "div";
    pClose.hidden = false;
    firstChild.content = title;

    // Title is only the first line — the rest of the paragraph plus any
    // following blocks all go into a single callout-content wrapper
    const children = inline.children ?? [];
    const softbreakIdx = children.findIndex((child) => child.type === "softbreak");
    const hasBody = softbreakIdx !== -1 && softbreakIdx < children.length - 1;
    const hasExtraBlocks = closeIdx > i + 4;
    if (!hasBody && !hasExtraBlocks) continue;

    const insertions: Token[] = [];
    if (hasBody) {
      const bodyChildren = children.slice(softbreakIdx + 1);
      inline.children = children.slice(0, softbreakIdx);
      const bodyOpen = new state.Token("paragraph_open", "p", 1);
      const bodyInline = new state.Token("inline", "", 0);
      bodyInline.children = bodyChildren;
      const bodyClose = new state.Token("paragraph_close", "p", -1);
      insertions.push(bodyOpen, bodyInline, bodyClose);
    }

    const open = new state.Token("callout_content_open", "div", 1);
    open.attrSet("class", "callout-content");
    const close = new state.Token("callout_content_close", "div", -1);
    tokens.splice(closeIdx, 0, close);
    tokens.splice(i + 4, 0, open, ...insertions);
  }
}

// ---- Wikilink: "[[target|label]]" → clickable internal link ----

function wikilinkRule(state: StateInline, silent: boolean): boolean {
  const { src, pos } = state;
  if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return false;
  const end = src.indexOf("]]", pos + 2);
  if (end === -1) return false;
  const inner = src.slice(pos + 2, end);
  if (!inner.trim() || inner.includes("\n")) return false;
  const pipe = inner.indexOf("|");
  const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
  const label = ((pipe === -1 ? inner : inner.slice(pipe + 1)).trim()) || target;
  if (!target) return false;

  if (!silent) {
    const token = state.push("wikilink", "", 0);
    token.content = label;
    token.attrSet("data-wikilink", target);
  }
  state.pos = end + 2;
  return true;
}

// ---- Embed: "![[target|label|WxH]]" → unified card (image/canvas/note/link) ----

function embedRule(state: StateInline, silent: boolean): boolean {
  const { src, pos } = state;
  if (src.charCodeAt(pos) !== 0x21 || src.charCodeAt(pos + 1) !== 0x5b || src.charCodeAt(pos + 2) !== 0x5b) return false;
  const end = src.indexOf("]]", pos + 3);
  if (end === -1) return false;
  const inner = src.slice(pos + 3, end);
  if (!inner.trim() || inner.includes("\n")) return false;
  const spec = parseEmbedSpec(inner);
  if (!spec.target) return false;

  if (!silent) {
    const token = state.push("wikilink_embed", "", 0);
    token.content = spec.label ?? spec.target;
    token.meta = { embed: spec };
    token.attrSet("data-embed-target", spec.target);
    token.attrSet("data-embed-kind", spec.kind);
    if (spec.label) token.attrSet("data-embed-label", spec.label);
    if (spec.size) token.attrSet("data-embed-size", formatSizeToken(spec.size));
  }
  state.pos = end + 2;
  return true;
}

// ---- Inline tag: "#tag" → styled pill (same semantics as vault scan) ----

const TAG_PRECEDING = /[\s([{'">~*_（【]/;

function tagRule(state: StateInline, silent: boolean): boolean {
  const { src, pos } = state;
  if (src.charCodeAt(pos) !== 0x23) return false;
  const prev = pos > 0 ? src[pos - 1] : "";
  if (prev && !TAG_PRECEDING.test(prev)) return false;
  const m = TAG_RE.exec(src.slice(pos, state.posMax));
  if (!m) return false;
  const tag = m[1];
  if (!/\p{L}/u.test(tag) || /^\d+$/.test(tag)) return false;

  if (!silent) {
    const token = state.push("mdtag", "", 0);
    token.content = "#" + tag;
  }
  state.pos += m[0].length;
  return true;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const md: MarkdownItType = new MarkdownIt({
  // Obsidian treats single newlines as line breaks and blocks raw HTML
  html: false,
  linkify: true,
  breaks: true,
  highlight: (str: string, lang: string): string => {
    const { html, lang: safeLang, highlighted } = highlightCode(str, lang);
    const cls = safeLang ? ` data-lang="${escapeAttr(safeLang)}"` : "";
    return `<pre class="md-code"${cls}><code${highlighted ? ' class="hljs"' : ""}>${html}</code></pre>`;
  },
});

md.core.ruler.after("inline", "prism_callouts", transformCallouts);
// Embeds that sit alone in their paragraph render as centered blocks; embeds
// mixed with text keep the inline flow
md.core.ruler.after("inline", "prism_standalone_images", (state) => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== "paragraph_open") continue;
    const inline = tokens[i + 1];
    if (inline?.type !== "inline") continue;
    const children = inline.children ?? [];
    let embeds = 0;
    let standalone = true;
    for (const child of children) {
      if (child.type === "image") {
        embeds++;
      } else if (child.type === "wikilink_embed") {
        embeds++;
      } else if (child.type === "text") {
        if (child.content.trim()) {
          standalone = false;
          break;
        }
      } else if (
        child.type !== "softbreak" &&
        child.type !== "hardbreak" &&
        child.type !== "link_open" &&
        child.type !== "link_close"
      ) {
        standalone = false;
        break;
      }
    }
    if (!standalone || embeds === 0) continue;
    for (const child of children) {
      if (child.type === "image") child.attrJoin("class", "md-img-standalone");
      else if (child.type === "wikilink_embed") child.attrJoin("class", "md-embed-standalone");
    }
  }
});
// Short table cells (dates, numbers, short labels) shouldn't wrap; longer
// descriptive cells keep normal wrapping. Wide tables scroll inside the frame.
const TABLE_NOWRAP_MAX = 12;
md.core.ruler.after("inline", "prism_table_nowrap", (state) => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length - 1; i++) {
    const type = tokens[i].type;
    if (type !== "th_open" && type !== "td_open") continue;
    const inline = tokens[i + 1];
    if (inline.type !== "inline") continue;
    const text = inline.content.trim();
    if (!text || text.length > TABLE_NOWRAP_MAX) continue;
    tokens[i].attrJoin("class", "md-cell-nowrap");
  }
});
md.use(markPlugin);
md.use(taskLists, { enabled: true, label: true });
// Obsidian-style $...$ / $$...$$ math (KaTeX options pass through as extras)
md.use(katex, { throwOnError: false });

md.inline.ruler.before("link", "prism_wikilink", wikilinkRule);
md.inline.ruler.before("prism_wikilink", "prism_wikilink_embed", embedRule);
md.inline.ruler.before("prism_wikilink_embed", "prism_tag", tagRule);

md.renderer.rules.wikilink = (tokens, idx) => {
  const token = tokens[idx];
  const target = String(token.attrGet("data-wikilink") ?? "");
  return `<a data-wikilink="${escapeAttr(target)}" class="wikilink">${md.utils.escapeHtml(token.content)}</a>`;
};

// ---- Local asset URLs ----
// Images live on disk inside the vault, which the renderer can't fetch
// directly — they go through the prism-file:// protocol (electron/main.ts),
// which resolves the ref against the note's folder and the vault root.
// The helpers live in assetUrl.ts so embed code can import them without
// pulling in markdown-it.

// markdown-it renders synchronously; the context is only valid during a call
let assetCtx: AssetContext | null = null;

function specOf(token: Token): EmbedSpec | null {
  const spec = (token.meta as { embed?: EmbedSpec } | null)?.embed;
  if (spec) return spec;
  const target = String(token.attrGet("data-embed-target") ?? "");
  if (!target) return null;
  const kind = (token.attrGet("data-embed-kind") as EmbedKind | null) ?? detectEmbedKind(target);
  return { kind, target, size: null };
}

function embedBlockClass(token: Token): string {
  const cls = token.attrGet("class");
  return typeof cls === "string" && cls.includes("md-embed-standalone") ? " md-embed-block" : "";
}

md.renderer.rules.wikilink_embed = (tokens, idx) => {
  const token = tokens[idx];
  const spec = specOf(token);
  if (!spec) return md.utils.escapeHtml(token.content);
  const cls = `md-embed-card md-embed-card-${spec.kind} md-embed-${spec.kind}${embedBlockClass(token)}`;

  if (spec.kind === "image") {
    if (!assetCtx) return `<span class="md-img-missing">${md.utils.escapeHtml(spec.target)}</span>`;
    const label = spec.label ?? "";
    return `<span class="${cls}"><img src="${escapeAttr(assetSrc(spec.target, assetCtx))}" alt="${escapeAttr(label)}"${imageSizeAttrs(clampEmbedSize(spec.size))} loading="lazy"></span>`;
  }

  if (spec.kind === "link") {
    const label = spec.label || spec.target;
    return `<span class="${cls}"><a class="md-embed-link-anchor" href="${escapeAttr(spec.target)}" rel="noreferrer noopener"><span class="md-embed-link-body"><span class="md-embed-link-domain">${md.utils.escapeHtml(domainOf(spec.target))}</span><span class="md-embed-link-label">${md.utils.escapeHtml(label)}</span></span></a></span>`;
  }

  // canvas / note / pdf: the reading view mounts a React card into this placeholder
  const attrs = [
    `data-embed-kind="${escapeAttr(spec.kind)}"`,
    `data-embed-target="${escapeAttr(spec.target)}"`,
    spec.label ? `data-embed-label="${escapeAttr(spec.label)}"` : "",
    spec.size ? `data-embed-size="${formatSizeToken(spec.size)}"` : "",
  ].filter(Boolean).join(" ");
  return `<span class="md-embed-pending${embedBlockClass(token)}" ${attrs}></span>`;
};

md.renderer.rules.image = (tokens, idx, options, env) => {
  const token = tokens[idx];
  const rawAlt = String(token.content ?? "");
  const { size } = parseImageAlt(rawAlt);
  // Alt text is rendered from children (strips **/_/etc.), then the trailing
  // size token is removed from whichever form carried it
  const inlineText = md.renderer.renderInlineAsText(token.children ?? [], options, env);
  const alt = parseImageAlt(inlineText || rawAlt).alt;
  let src = String(token.attrGet("src") ?? "");
  if (src && !/^(https?:|data:|#|mailto:)/i.test(src)) {
    if (assetCtx) {
      src = prismFileUrl(assetCtx.vaultPath, src.replace(/^[\\/]+/, ""), assetCtx.noteDir);
    } else {
      return `<span class="md-img-missing">${md.utils.escapeHtml(alt || src)}</span>`;
    }
  }
  const title = token.attrGet("title");
  const cls = token.attrGet("class");
  const block = typeof cls === "string" && cls.includes("md-img-standalone") ? " md-embed-block" : "";
  return `<span class="md-embed-card md-embed-card-image md-embed-image${block}"><img${cls ? ` class="${escapeAttr(String(cls))}"` : ""} src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"${title ? ` title="${escapeAttr(String(title))}"` : ""}${imageSizeAttrs(clampEmbedSize(size))}></span>`;
};

md.renderer.rules.mdtag = (tokens, idx) => {
  return `<span class="md-tag">${md.utils.escapeHtml(tokens[idx].content)}</span>`;
};

// Scroll container so wide tables scroll without stretching the card to the
// full text width (also gives the rounded bordered frame a clip box)
md.renderer.rules.table_open = () => '<div class="md-table-wrap"><table>';
md.renderer.rules.table_close = () => "</table></div>";

// ---- Heading ids + outline extraction ----
// Runs at the parse level so the outline is independent of DOM mutations
// (folding moves headings deeper into wrappers)

export interface HeadingOutline {
  id: string;
  level: number;
  text: string;
}

function inlinePlainText(token: Token): string {
  let out = "";
  for (const child of token.children ?? []) {
    if (child.type === "text" || child.type === "code_inline" || child.type === "math_inline" || child.type === "wikilink" || child.type === "mdtag") {
      out += child.content;
    } else if (child.type === "softbreak" || child.type === "hardbreak") {
      out += " ";
    }
  }
  return out.replace(/[*_~=`$]+/g, "").trim();
}

md.core.ruler.push("prism_heading_outline", (state) => {
  const env = (state.env ??= {}) as { outline?: HeadingOutline[] };
  env.outline = [];
  let index = 0;
  for (let i = 0; i < state.tokens.length; i++) {
    const token = state.tokens[i];
    if (token.type !== "heading_open") continue;
    const m = /^h([1-6])$/i.exec(token.tag);
    if (!m) continue;
    const id = `hd-${index++}`;
    token.attrSet("id", id);
    const inline = state.tokens[i + 1];
    env.outline.push({
      id,
      level: Number(m[1]),
      text: inline ? inlinePlainText(inline) : "",
    });
  }
});

export interface RenderResult {
  html: string;
  frontmatter: Record<string, unknown> | null;
  outline: HeadingOutline[];
}

export function stripFrontmatter(src: string): { body: string; frontmatter: Record<string, unknown> | null } {
  const m = FRONTMATTER_RE.exec(src);
  if (!m) return { body: src, frontmatter: null };
  let frontmatter: Record<string, unknown> | null = null;
  try {
    const loaded = loadYaml(m[1]);
    if (loaded && typeof loaded === "object" && !Array.isArray(loaded)) {
      frontmatter = loaded as Record<string, unknown>;
    }
  } catch { /* malformed YAML — show nothing rather than fail the render */ }
  return { body: src.slice(m[0].length), frontmatter };
}

export function renderInlineMarkdown(src: string, assetContext?: AssetContext | null): string {
  assetCtx = assetContext ?? null;
  try {
    return md.renderInline(src);
  } finally {
    assetCtx = null;
  }
}

export function renderMarkdown(src: string, assetContext?: AssetContext | null): RenderResult {
  const { body, frontmatter } = stripFrontmatter(src);
  assetCtx = assetContext ?? null;
  try {
    const env: { outline?: HeadingOutline[] } = {};
    const html = md.render(body, env);
    return { html, frontmatter, outline: env.outline ?? [] };
  } finally {
    assetCtx = null;
  }
}
