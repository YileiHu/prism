import { Megaphone, GitCommit } from "lucide-react";
import Modal from "./Modal";
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
      width="520px"
      position="center"
    >
      <div className="max-h-[60vh] overflow-y-auto space-y-6">
        {changelog.map((entry) => (
          <div key={entry.version}>
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[var(--accent-muted)] text-[var(--accent-text)]">
                v{entry.version}
              </span>
              <span className="text-xs text-muted">{entry.date}</span>
            </div>
            <ul className="space-y-2">
              {entry.changes.map((change, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-secondary">
                  <GitCommit size={14} className="mt-0.5 flex-shrink-0 text-faint" />
                  {change}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
