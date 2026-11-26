import { useEffect, useMemo, useState } from "react";
import Modal from "../Modal";
import Button from "../Button";
import Input, { Textarea } from "../Input";
import DateField from "../DateField";
import SelectButton from "../SelectButton";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { dateKey, localDateFromStamp } from "../../lib/dates";
import { capabilityGroupsByDomain } from "../../lib/capabilityGroups";
import type {
  GrowthCapability,
  GrowthChallenge,
  GrowthDomain,
  GrowthTask,
} from "../../shared/models";

interface Props {
  open: boolean;
  /** null means "create a new task". */
  task: GrowthTask | null;
  defaultCapabilityId: number | null;
  defaultChallengeId: number | null;
  /** Current-season challenges plus the task's own (the modal adds the rest). */
  challenges: GrowthChallenge[];
  currentSeasonId: number | null;
  capabilities: GrowthCapability[];
  domains: GrowthDomain[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * One task: a dated commitment that may practise a capability and may be a step
 * of a challenge. Editing works for open and completed tasks alike; completion
 * itself is a row action (checkbox / right-click menu), never a footer button.
 */
export default function GrowthTaskModal({
  open,
  task,
  defaultCapabilityId,
  defaultChallengeId,
  challenges,
  currentSeasonId,
  capabilities,
  domains,
  onClose,
  onSaved,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [capabilityId, setCapabilityId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    // A new task is planned for today until the dates are changed; an existing
    // task keeps its stored pair (including a deliberately undated one).
    const today = dateKey(new Date());
    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
    setCapabilityId(
      task
        ? task.capability === null
          ? ""
          : String(task.capability.id)
        : defaultCapabilityId === null
          ? ""
          : String(defaultCapabilityId),
    );
    setChallengeId(
      task
        ? task.challenge === null
          ? ""
          : String(task.challenge.id)
        : defaultChallengeId === null
          ? ""
          : String(defaultChallengeId),
    );
    setScheduledDate(task ? (task.scheduledDate ?? "") : today);
    setDueDate(task ? (task.dueDate ?? "") : today);
  }, [open, task, defaultCapabilityId, defaultChallengeId]);

  const groups = useMemo(
    () => capabilityGroupsByDomain(capabilities, domains),
    [capabilities, domains],
  );

  // Only open challenges of the current season (or one that fits the already
  // chosen capability) are offered, plus the task's own link so editing never
  // silently drops it.
  const challengeGroups = useMemo(() => {
    const visible = challenges.filter((challenge) => {
      if (challengeId !== "" && String(challenge.id) === challengeId) return true;
      if (challenge.status !== "open") return false;
      if (currentSeasonId !== null && challenge.seasonId !== currentSeasonId) return false;
      if (
        capabilityId !== "" &&
        challenge.capabilityId !== null &&
        String(challenge.capabilityId) !== capabilityId
      ) {
        return false;
      }
      return true;
    });
    const bySeason = new Map<string, { value: string; label: string }[]>();
    for (const challenge of visible) {
      const label =
        challenge.seasonTitle.trim() || t["growth.challenge.noSeason"];
      const rows = bySeason.get(label) ?? [];
      rows.push({ value: String(challenge.id), label: challenge.title });
      bySeason.set(label, rows);
    }
    return [...bySeason.entries()].map(([label, options]) => ({ label, options }));
  }, [challenges, capabilityId, challengeId, currentSeasonId, t]);

  const applyChallenge = (next: string) => {
    setChallengeId(next);
    const challenge = challenges.find((row) => String(row.id) === next);
    // The challenge owns the capability: picking one fills the anchor.
    if (challenge && challenge.capabilityId !== null) {
      setCapabilityId(String(challenge.capabilityId));
    }
  };

  const applyCapability = (next: string) => {
    setCapabilityId(next);
    if (next === "") {
      setChallengeId("");
      return;
    }
    const challenge = challenges.find((row) => String(row.id) === challengeId);
    if (challenge && challenge.capabilityId !== null && String(challenge.capabilityId) !== next) {
      setChallengeId("");
    }
  };

  // Start and end are a pair: setting one fills the other only while it is
  // empty; clearing either clears both; an inverted pair is clamped.
  const applyStartDate = (next: string) => {
    if (!next) {
      setScheduledDate("");
      setDueDate("");
      return;
    }
    setScheduledDate(next);
    setDueDate((current) => (!current ? next : current < next ? next : current));
  };

  const applyDueDate = (next: string) => {
    if (!next) {
      setScheduledDate("");
      setDueDate("");
      return;
    }
    setDueDate(next);
    setScheduledDate((current) => (!current ? next : next < current ? next : current));
  };

  const save = async () => {
    if (busy || !title.trim()) return;
    setBusy(true);
    try {
      const payloadDates = {
        scheduledDate: scheduledDate || null,
        dueDate: dueDate || null,
      };
      const payloadLinks = {
        capabilityId: capabilityId ? Number(capabilityId) : null,
        challengeId: challengeId ? Number(challengeId) : null,
      };
      if (task) {
        await window.prism.updateGrowthTask(task.id, {
          title,
          notes,
          ...payloadLinks,
          ...payloadDates,
        });
      } else {
        await window.prism.addGrowthTask({
          title,
          notes,
          ...payloadLinks,
          ...payloadDates,
        });
      }
      onSaved();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("GROWTH_LINK_CAPABILITY")) {
        showToast(t["growth.linkCapabilityMismatch"], "error");
      } else {
        showToast(t["common.saveFailed"], "error");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? t["growth.tasks.edit"] : t["growth.tasks.new"]}
      size="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["growth.cancel"]}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !title.trim()}
            onClick={() => void save()}
          >
            {t["growth.save"]}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.tasks.title"]}</span>
          <Input
            className="w-full"
            autoFocus
            value={title}
            placeholder={t["growth.tasks.titlePlaceholder"]}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        {task?.completedAt && (
          <p className="text-caption text-faint">
            {t["growth.tasks.completedAt"].replace("{date}", localDateFromStamp(task.completedAt))}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0 space-y-1">
            <span className="block text-caption text-muted">{t["growth.tasks.start"]}</span>
            <DateField className="w-full" value={scheduledDate} onChange={applyStartDate} />
          </label>
          <label className="block min-w-0 space-y-1">
            <span className="block text-caption text-muted">{t["growth.tasks.due"]}</span>
            <DateField className="w-full" value={dueDate} onChange={applyDueDate} />
          </label>
        </div>

        <div className="space-y-1">
          <span className="block text-caption text-muted">{t["growth.tasks.capability"]}</span>
          <SelectButton
            value={capabilityId}
            groups={groups}
            emptyLabel={t["growth.tasks.capabilityNone"]}
            onChange={applyCapability}
            className="w-full"
            placeholder={t["growth.tasks.capabilityNone"]}
          />
        </div>

        <div className="space-y-1">
          <span className="block text-caption text-muted">{t["growth.tasks.challenge"]}</span>
          <SelectButton
            value={challengeId}
            groups={challengeGroups}
            emptyLabel={t["growth.tasks.challengeNone"]}
            onChange={applyChallenge}
            className="w-full"
            placeholder={t["growth.tasks.challengeNone"]}
          />
        </div>

        <label className="block space-y-1">
          <span className="block text-caption text-muted">{t["growth.notes"]}</span>
          <Textarea
            className="w-full"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}
