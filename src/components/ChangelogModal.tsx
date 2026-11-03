import { Megaphone, GitCommit } from "lucide-react";
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t["changelog.title"]}
      icon={<Megaphone size={18} className="text-[var(--accent-text)]" />}
      width="680px"
      position="center"
    >
      <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden space-y-6">
        {changelog.map((entry) => (
          <div key={entry.version}>
            <div className="flex items-center gap-2 mb-3">
              <Badge tone="accent" className="font-semibold">
                v{entry.version}
              </Badge>
              <span className="text-caption text-muted">{entry.date}</span>
            </div>
            <p className="text-body text-secondary leading-relaxed mb-3">{entry.summary}</p>
            <ul className="space-y-2">
              {entry.changes.map((change, i) => (
                <li key={i} className="flex items-start gap-2 text-body text-muted">
                  <GitCommit size={14} className="mt-0.5 flex-shrink-0 text-faint" />
                  <span className="min-w-0 flex-1 break-words">{change}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
