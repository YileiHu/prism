import { useState, useEffect, useRef } from "react";
import { CalendarRange, Plus, Trash2 } from "lucide-react";
import { useT } from "../../i18n";
import Modal from "../Modal";
import Button from "../Button";
import SectionCard from "../SectionCard";
import type { ScheduleBlock } from "./types";

interface Props {
  version: number;
  onChanged: () => void;
}

interface Draft {
  id: number | null;
  label: string;
  start: string;
  end: string;
  color: string;
}

const PX_PER_HOUR = 44;
const TOTAL_HEIGHT = 24 * PX_PER_HOUR;
const BLOCK_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#64748b"];

function toMinutes(hhmm: string): number {
  return parseInt(hhmm.slice(0, 2), 10) * 60 + parseInt(hhmm.slice(3), 10);
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function ScheduleTimeline({ version, onChanged }: Props) {
  const { t } = useT();
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledRef = useRef(false);

  useEffect(() => {
    window.prism.getScheduleBlocks().then(setBlocks);
  }, [version]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowY = (nowMinutes / 60) * PX_PER_HOUR;
  const nowHHMM = toHHMM(nowMinutes);

  // Scroll the current time into view once
  useEffect(() => {
    if (scrolledRef.current || !scrollRef.current) return;
    scrolledRef.current = true;
    scrollRef.current.scrollTop = Math.max(0, nowY - 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAdd = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const hour = Math.min(22, Math.max(0, Math.floor((e.clientY - rect.top) / PX_PER_HOUR)));
    setError(null);
    setConfirmingDelete(false);
    setDraft({ id: null, label: "", start: toHHMM(hour * 60), end: toHHMM((hour + 1) * 60), color: BLOCK_COLORS[0] });
  };

  const openEdit = (block: ScheduleBlock) => {
    setError(null);
    setConfirmingDelete(false);
    setDraft({ id: block.id, label: block.label, start: block.start, end: block.end, color: block.color });
  };

  const save = async () => {
    if (!draft) return;
    const payload = { label: draft.label.trim(), start: draft.start, end: draft.end, color: draft.color };
    const res = draft.id === null
      ? await window.prism.addScheduleBlock(payload)
      : await window.prism.updateScheduleBlock(draft.id, payload);
    if (res && typeof res === "object" && "error" in res && res.error) {
      setError(res.error === "overlap" ? t["home.overlapError"] : t["home.timeOrderError"]);
      return;
    }
    setDraft(null);
    onChanged();
  };

  const remove = async () => {
    if (!draft || draft.id === null) return;
    await window.prism.deleteScheduleBlock(draft.id);
    setDraft(null);
    onChanged();
  };

  return (
    <>
    <SectionCard
      icon={CalendarRange}
      title={t["home.schedule"]}
      className="flex flex-col h-full min-h-0"
      bodyClassName="flex-1 overflow-y-auto min-h-0"
      bodyRef={scrollRef}
      headerActions={
        <button
          onClick={() => { setError(null); setConfirmingDelete(false); setDraft({ id: null, label: "", start: "08:00", end: "09:00", color: BLOCK_COLORS[0] }); }}
          className="text-faint hover:text-[var(--accent-text)] transition-colors"
        >
          <Plus size={14} />
        </button>
      }
    >
        <div className="relative cursor-copy" style={{ height: TOTAL_HEIGHT }} onClick={openAdd}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="absolute left-0 right-0 pointer-events-none" style={{ top: h * PX_PER_HOUR }}>
              <span className="absolute left-1.5 -top-[7px] text-[10px] text-faint tabular-nums">{String(h).padStart(2, "0")}:00</span>
              <div className="absolute left-12 right-0 top-0 h-px bg-line/60" />
            </div>
          ))}

          {blocks.map((block) => {
            const top = (toMinutes(block.start) / 60) * PX_PER_HOUR;
            const height = Math.max(((toMinutes(block.end) - toMinutes(block.start)) / 60) * PX_PER_HOUR, 18);
            const isNow = block.start <= nowHHMM && nowHHMM < block.end;
            return (
              <div
                key={block.id}
                onClick={(e) => { e.stopPropagation(); openEdit(block); }}
                className="absolute left-12 right-2 rounded-r-md cursor-pointer overflow-hidden hover:brightness-125 transition-[filter]"
                style={{
                  top,
                  height,
                  backgroundColor: `${block.color}${isNow ? "40" : "22"}`,
                  borderLeft: `3px solid ${block.color}`,
                }}
              >
                {height >= 26 && (
                  <div className="px-2 py-0.5">
                    <div className="text-xs font-medium text-primary truncate">{block.label || " "}</div>
                    {height >= 40 && (
                      <div className="text-[10px] text-muted tabular-nums">{block.start} – {block.end}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div className="absolute left-12 right-0 pointer-events-none z-10" style={{ top: nowY }}>
            <div className="relative h-px bg-[var(--accent)]">
              <div className="absolute -left-1 -top-[3px] w-[7px] h-[7px] rounded-full bg-[var(--accent)]" />
            </div>
          </div>
        </div>
    </SectionCard>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id === null ? t["home.addBlock"] : t["home.editBlock"]}
        width="360px"
        footer={
          <>
            {draft?.id !== null && (
              <Button
                variant={confirmingDelete ? "danger" : "danger-subtle"}
                size="sm"
                onClick={() => { if (confirmingDelete) { remove(); } else { setConfirmingDelete(true); } }}
                className="mr-auto"
              >
                <Trash2 size={13} />
                {confirmingDelete ? t["home.deleteBlockConfirm"] : t["home.deleteBlock"]}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setDraft(null)}>
              {t["resources.cancel"]}
            </Button>
            <Button variant="primary" size="sm" onClick={save}>
              {t["resources.save"]}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <input
              type="text"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder={t["home.labelPlaceholder"]}
              autoFocus
              className="w-full bg-elevated border border-strong rounded-lg px-3 py-2 text-sm placeholder-muted focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={draft.start}
                onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                className="flex-1 bg-elevated border border-strong rounded-lg px-2 py-1.5 text-sm text-primary focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
              <span className="text-muted text-sm">–</span>
              <input
                type="time"
                value={draft.end}
                onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                className="flex-1 bg-elevated border border-strong rounded-lg px-2 py-1.5 text-sm text-primary focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>
            <div className="flex gap-2.5">
              {BLOCK_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setDraft({ ...draft, color: c })}
                  className={`w-6 h-6 rounded-full transition-transform ${draft.color === c ? "ring-2 ring-white/80 scale-110" : "hover:scale-110"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}
