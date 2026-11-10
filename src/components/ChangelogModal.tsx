import { useEffect, useState } from "react";
import { ChevronDown, GitCommit, PartyPopper, Sparkles } from "lucide-react";
import Modal from "./Modal";
import Badge from "./Badge";
import changelog, { type ChangelogHighlight } from "../data/changelog";
import { useT } from "../i18n";
import { tagColor } from "../lib/colors";

interface ChangelogModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ChangelogModal({ open, onClose }: ChangelogModalProps) {
  const { t } = useT();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // Every release starts collapsed so the summary list stays scannable.
  useEffect(() => {
    if (open) setExpanded(new Set());
  }, [open]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const itemCountLabel = (count: number) =>
    t["changelog.itemCount"].replace("{count}", String(count));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t["changelog.title"]}
      icon={PartyPopper}
      width="780px"
      position="center"
    >
      <div className="max-h-[72vh] overflow-y-auto overflow-x-hidden pr-1">
        {changelog.map((entry, entryIndex) => {
          const changes = entry.changes ?? [];
          const changesOpen = expanded.has(`changes:${entry.version}`);
          const featured = (entry.highlights?.length ?? 0) > 0;
          return (
            <section
              key={entry.version}
              className={entryIndex > 0 ? "mt-5 border-t border-line/60 pt-5" : ""}
            >
              {entryIndex === 1 && (
                <p className="mb-4 text-caption font-medium uppercase tracking-wide text-faint">
                  {t["changelog.history"]}
                </p>
              )}
              <div className="mb-2.5 flex items-center gap-2">
                <Badge variant="accent" className="font-semibold">v{entry.version}</Badge>
                {entryIndex === 0 && (
                  <span className="inline-flex items-center gap-1 text-meta text-faint">
                    <Sparkles size={12} />
                    {t["changelog.latest"]}
                  </span>
                )}
                <span className="ml-auto text-caption text-muted">{entry.date}</span>
              </div>
              <p className="text-body leading-relaxed text-secondary">{entry.summary}</p>

              {featured && (
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  {entry.highlights!.map((highlight, index) => {
                    const key = `highlight:${entry.version}:${index}`;
                    return (
                      <HighlightCard
                        key={key}
                        highlight={highlight}
                        expanded={expanded.has(key)}
                        onToggle={() => toggle(key)}
                        itemCountLabel={itemCountLabel(highlight.items.length)}
                      />
                    );
                  })}
                </div>
              )}

              {changes.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => toggle(`changes:${entry.version}`)}
                    aria-expanded={changesOpen}
                    className={`inline-flex items-center gap-1 text-caption text-muted hover:text-secondary transition-colors cursor-pointer ${
                      featured ? "mt-3" : "mt-2"
                    }`}
                  >
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${changesOpen ? "" : "-rotate-90"}`}
                    />
                    {changesOpen
                      ? t["changelog.hideDetails"]
                      : t["changelog.showDetails"].replace("{count}", String(changes.length))}
                  </button>
                  {changesOpen && (
                    <ul className="mt-3 space-y-2">
                      {changes.map((change, i) => (
                        <li key={i} className="flex items-start gap-2 text-body text-muted">
                          <GitCommit size={14} className="mt-0.5 flex-shrink-0 text-faint" />
                          <span className="min-w-0 flex-1 break-words">{change}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          );
        })}
      </div>
    </Modal>
  );
}

interface HighlightCardProps {
  highlight: ChangelogHighlight;
  expanded: boolean;
  onToggle: () => void;
  itemCountLabel: string;
}

function HighlightCard({ highlight, expanded, onToggle, itemCountLabel }: HighlightCardProps) {
  const color = tagColor(highlight.palette);
  const Icon = highlight.icon;
  return (
    <div
      className={`rounded-card border bg-elevated/40 transition-all duration-200 ${
        expanded
          ? "border-strong shadow-popover"
          : "border-line/70 hover:-translate-y-0.5 hover:border-strong hover:shadow-popover"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 p-3.5 text-left cursor-pointer"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control"
          style={{ color: color.name, backgroundColor: color.bg }}
        >
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-body font-semibold text-primary">
              {highlight.title}
            </span>
            <ChevronDown
              size={14}
              className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </span>
          <span className="mt-0.5 block text-caption leading-relaxed text-muted">
            {highlight.description}
          </span>
          <span className="mt-1.5 block text-meta text-faint">{itemCountLabel}</span>
        </span>
      </button>
      {expanded && (
        <ul className="space-y-1.5 border-t border-line/60 px-3.5 py-3">
          {highlight.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-caption text-muted">
              <span
                className="mt-[7px] h-1 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: color.bar }}
              />
              <span className="min-w-0 flex-1 break-words leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
