import { useEffect, useState } from "react";
import { ChevronDown, GitCommit, PartyPopper } from "lucide-react";
import Modal from "./Modal";
import Badge from "./Badge";
import changelog from "../data/changelog";
import { useT } from "../i18n";

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

  const toggle = (version: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t["changelog.title"]}
      icon={<PartyPopper size={18} className="text-[var(--accent-text)]" />}
      width="680px"
      position="center"
    >
      <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden space-y-6">
        {changelog.map((entry) => {
          const isOpen = expanded.has(entry.version);
          return (
            <div key={entry.version}>
              <div className="flex items-center gap-2 mb-3">
                <Badge tone="accent" className="font-semibold">
                  v{entry.version}
                </Badge>
                <span className="text-caption text-muted">{entry.date}</span>
              </div>
              <p className="text-body text-secondary leading-relaxed mb-2">{entry.summary}</p>
              <button
                type="button"
                onClick={() => toggle(entry.version)}
                aria-expanded={isOpen}
                className="inline-flex items-center gap-1 text-caption text-muted hover:text-secondary transition-colors cursor-pointer"
              >
                <ChevronDown
                  size={14}
                  className={`transition-transform ${isOpen ? "" : "-rotate-90"}`}
                />
                {isOpen
                  ? t["changelog.hideDetails"]
                  : t["changelog.showDetails"].replace("{count}", String(entry.changes.length))}
              </button>
              {isOpen && (
                <ul className="space-y-2 mt-3">
                  {entry.changes.map((change, i) => (
                    <li key={i} className="flex items-start gap-2 text-body text-muted">
                      <GitCommit size={14} className="mt-0.5 flex-shrink-0 text-faint" />
                      <span className="min-w-0 flex-1 break-words">{change}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
