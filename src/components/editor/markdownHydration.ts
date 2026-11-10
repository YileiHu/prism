import { decorateCalloutIcons } from "./calloutIcons";
import { mountEmbedCard } from "../embeds/embedMount";
import { specFromData, type EmbedOpenTarget } from "../embeds/model";
import type { AssetContext } from "./markdown";
import type { EmbedLabels } from "../embeds/EmbedCard";

export interface MarkdownHydrationOptions {
  assetContext?: AssetContext | null;
  embedLabels?: EmbedLabels;
  editableEmbeds?: boolean;
  onOpenWikilink?: (target: string) => void;
  onOpenLink?: (url: string) => void;
  onResolveRelativeLink?: (href: string) => void;
  onOpenEmbed?: (target: EmbedOpenTarget) => void;
  onToggleTask?: (taskIndex: number) => void;
}

export function hydrateMarkdown(
  root: HTMLElement,
  options: MarkdownHydrationOptions,
): () => void {
  decorateCalloutIcons(root);
  const cleanups: (() => void)[] = [];
  const { assetContext, embedLabels, onOpenEmbed } = options;
  if (assetContext && embedLabels && onOpenEmbed) {
    const hosts = root.querySelectorAll<HTMLElement>(".md-embed-pending[data-embed-kind]");
    for (const host of hosts) {
      const spec = specFromData({
        kind: host.dataset.embedKind,
        target: host.dataset.embedTarget,
        label: host.dataset.embedLabel,
        size: host.dataset.embedSize,
      });
      if (!spec) continue;
      cleanups.push(mountEmbedCard(host, {
        spec,
        ctx: assetContext,
        editable: options.editableEmbeds ?? false,
        labels: embedLabels,
        onOpen: onOpenEmbed,
      }));
    }
  }

  const handleClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const wikilink = target.closest<HTMLElement>("a[data-wikilink]");
    if (wikilink && options.onOpenWikilink) {
      event.preventDefault();
      options.onOpenWikilink(wikilink.getAttribute("data-wikilink") ?? "");
      return;
    }

    const checkbox = target.closest<HTMLInputElement>("input.task-list-item-checkbox");
    if (checkbox && options.onToggleTask) {
      event.preventDefault();
      const all = Array.from(root.querySelectorAll("input.task-list-item-checkbox"));
      options.onToggleTask(all.indexOf(checkbox));
      return;
    }

    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute("href") ?? "";
    if (/^(https?:|mailto:)/i.test(href)) {
      if (options.onOpenLink) options.onOpenLink(href);
      else options.onOpenEmbed?.({ kind: "link", url: href });
    } else if (/\.md$/i.test(href)) {
      options.onResolveRelativeLink?.(href);
    }
  };
  root.addEventListener("click", handleClick);

  return () => {
    root.removeEventListener("click", handleClick);
    for (const cleanup of cleanups) cleanup();
  };
}
