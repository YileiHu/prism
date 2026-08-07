import { useState, useEffect } from "react";
import { ListChecks, Clock, FolderKanban, Zap, CheckCircle2 } from "lucide-react";
import Modal from "../Modal";
import Button from "../Button";
import { useT } from "../../i18n";
import type { GtdItem, GtdStatus } from "./types";

type Step = "q1" | "q2" | "q3" | "doing";

interface Props {
  item: GtdItem | null;
  onClose: () => void;
  onDecided: () => void;
}

export default function GtdProcessDialog({ item, onClose, onDecided }: Props) {
  const { t } = useT();
  const [step, setStep] = useState<Step>("q1");

  useEffect(() => {
    if (item) setStep("q1");
  }, [item?.id]);

  const decide = async (status: GtdStatus) => {
    if (!item) return;
    await window.prism.setGtdItemStatus(item.id, status);
    onDecided();
    onClose();
  };

  return (
    <Modal
      open={item !== null}
      onClose={onClose}
      title={t["gtd.process"]}
      icon={<ListChecks size={16} className="text-[var(--accent-text)]" />}
      width="480px"
    >
      <p className="text-sm text-primary font-medium bg-elevated/60 border border-line/50 rounded-lg px-3 py-2 mb-5 break-words">
        {item?.title}
      </p>

      {step === "q1" && (
        <>
          <p className="text-sm font-medium text-primary">{t["gtd.process.q1"]}</p>
          <p className="text-xs text-muted leading-relaxed mt-1.5 mb-4">{t["gtd.process.q1hint"]}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" onClick={() => decide("someday")}>
              {t["gtd.process.q1no"]}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setStep("q2")}>
              {t["gtd.process.q1yes"]}
            </Button>
          </div>
        </>
      )}

      {step === "q2" && (
        <>
          <p className="text-sm font-medium text-primary">{t["gtd.process.q2"]}</p>
          <p className="text-xs text-muted leading-relaxed mt-1.5 mb-4">{t["gtd.process.q2hint"]}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" onClick={() => setStep("q3")}>
              {t["gtd.process.q2no"]}
            </Button>
            <Button variant="primary" size="sm" onClick={() => setStep("doing")}>
              {t["gtd.process.q2yes"]}
            </Button>
          </div>
        </>
      )}

      {step === "doing" && (
        <div className="flex flex-col items-center text-center py-2">
          <div className="relative mb-4">
            <span className="absolute inset-0 rounded-full bg-[var(--accent)] opacity-20 animate-ping" />
            <div className="relative w-14 h-14 rounded-full bg-[var(--accent-muted)] border border-[var(--accent-border)] flex items-center justify-center">
              <Zap size={26} className="text-[var(--accent-text)]" />
            </div>
          </div>
          <p className="text-sm font-medium text-primary">{t["gtd.doNow"]}</p>
          <p className="text-xs text-muted leading-relaxed mt-1.5 mb-5">{t["gtd.doNowHint"]}</p>
          <Button variant="primary" size="md" className="w-full" onClick={() => decide("done")}>
            <CheckCircle2 size={15} />
            {t["gtd.doNowConfirm"]}
          </Button>
        </div>
      )}

      {step === "q3" && (
        <>
          <p className="text-sm font-medium text-primary mb-4">{t["gtd.process.q3"]}</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => decide("waiting")}
              className="flex flex-col items-start gap-1.5 p-4 rounded-xl border border-strong/60 bg-elevated/40 hover:border-[var(--accent)] hover:bg-[var(--accent-muted)] transition-colors text-left"
            >
              <Clock size={16} className="text-[var(--accent-text)]" />
              <span className="text-sm font-medium text-primary">{t["gtd.waiting"]}</span>
              <span className="text-xs text-muted leading-relaxed">{t["gtd.process.hintSingle"]}</span>
            </button>
            <button
              onClick={() => decide("project")}
              className="flex flex-col items-start gap-1.5 p-4 rounded-xl border border-strong/60 bg-elevated/40 hover:border-[var(--accent)] hover:bg-[var(--accent-muted)] transition-colors text-left"
            >
              <FolderKanban size={16} className="text-[var(--accent-text)]" />
              <span className="text-sm font-medium text-primary">{t["gtd.projects"]}</span>
              <span className="text-xs text-muted leading-relaxed">{t["gtd.process.hintMulti"]}</span>
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
