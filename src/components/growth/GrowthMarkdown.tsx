import MarkdownIt from "markdown-it";
import { useMemo, type MouseEvent } from "react";

/**
 * Growth content is self-contained prose: no vault wikilinks, note embeds,
 * math or syntax highlighting. A small markdown-it instance keeps the note
 * renderer (KaTeX + highlight.js) out of the growth module; this file is
 * loaded lazily by the two detail dialogs.
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

// Reuse the reading view's code-block frame from index.css.
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const info = (token.info ?? "").trim().split(/\s+/)[0] ?? "";
  const lang = info.replace(/[^A-Za-z0-9_+-]/g, "").slice(0, 24);
  const body = md.utils.escapeHtml(token.content);
  return `<pre class="md-code"${lang ? ` data-lang="${md.utils.escapeHtml(lang)}"` : ""}><code>${body}</code></pre>`;
};

md.renderer.rules.code_block = (tokens, idx) => {
  const body = md.utils.escapeHtml(tokens[idx].content);
  return `<pre class="md-code"><code>${body}</code></pre>`;
};

// Same scroll frame the reading view uses for wide tables.
md.renderer.rules.table_open = () => '<div class="md-table-wrap"><table>';
md.renderer.rules.table_close = () => "</table></div>";

// Growth content has no vault context: remote/data images load as-is, while a
// vault-relative path is shown as a missing-image label instead of a broken img.
md.renderer.rules.image = (tokens, idx) => {
  const token = tokens[idx];
  const src = String(token.attrGet("src") ?? "");
  const alt = String(token.content ?? "");
  if (src && !/^(https?:|data:)/i.test(src)) {
    return `<span class="md-img-missing">${md.utils.escapeHtml(alt || src)}</span>`;
  }
  return `<img src="${md.utils.escapeHtml(src)}" alt="${md.utils.escapeHtml(alt)}" loading="lazy">`;
};

interface Props {
  content: string;
}

export default function GrowthMarkdown({ content }: Props) {
  const html = useMemo(() => md.render(content), [content]);

  // All links leave the app; relative targets have no meaning in this content.
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement | null)?.closest("a");
    const href = anchor?.getAttribute("href") ?? "";
    if (!href) return;
    event.preventDefault();
    if (/^(https?:|mailto:)/i.test(href)) void window.prism.openUrl(href);
  };

  return (
    <div
      className="markdown-preview"
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
