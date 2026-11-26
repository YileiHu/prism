import { useEffect, useMemo, useState } from "react";
import Modal from "../Modal";
import Button from "../Button";
import Input, { Textarea } from "../Input";
import SelectButton from "../SelectButton";
import SegmentedToggle from "../SegmentedToggle";
import { useElementSize } from "../useElementSize";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import { capabilityGroupsByDomain } from "../../lib/capabilityGroups";
import type {
  GrowthCapability,
  GrowthChallenge,
  GrowthDomain,
  GrowthSeason,
} from "../../shared/models";
import { levelGrade } from "../../lib/growth";
import { LEVEL_HINT_KEYS, LEVEL_VALUE_OPTIONS } from "./labels";

interface Props {
  open: boolean;
  /** null = create */
  challenge: GrowthChallenge | null;
  capabilities: GrowthCapability[];
  domains: GrowthDomain[];
  seasons: GrowthSeason[];
  defaultSeasonId: number | null;
  onClose: () => void;
  onSaved: (challenge: GrowthChallenge) => void;
}

export default function GrowthChallengeModal({
  open,
  challenge,
  capabilities,
  domains,
  seasons,
  defaultSeasonId,
  onClose,
  onSaved,
}: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [criteria, setCriteria] = useState("");
  const [capabilityId, setCapabilityId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [difficulty, setDifficulty] = useState("3");
  const [busy, setBusy] = useState(false);
  const [bodyRef, { width }] = useElementSize<HTMLDivElement>();
  const twoColumn = width >= 900;

  // A settled challenge is a record: its structure is locked, but the story
  // can keep growing (this is why content stays editable).
  const locked = challenge !== null && challenge.status !== "open";

  useEffect(() => {
    if (!open) return;
    setTitle(challenge?.title ?? "");
    setDescription(challenge?.description ?? "");
    setGoal(challenge?.goal ?? "");
    setCriteria(challenge?.criteria ?? "");
    setCapabilityId(challenge?.capabilityId ? String(challenge.capabilityId) : "");
    setSeasonId(
      challenge?.seasonId
        ? String(challenge.seasonId)
        : defaultSeasonId === null
          ? ""
          : String(defaultSeasonId),
    );
    setDifficulty(challenge ? String(challenge.difficultyLevel) : "3");
  }, [open, challenge, defaultSeasonId]);

  // New challenge: suggest "current level + 1" once a capability is picked.
  useEffect(() => {
    if (!open || challenge) return;
    const cap = capabilities.find((item) => String(item.id) === capabilityId);
    if (cap) setDifficulty(String(Math.min(6, cap.level + 1)));
  }, [open, challenge, capabilityId, capabilities]);

  const capabilityGroups = useMemo(
    () => capabilityGroupsByDomain(capabilities, domains),
    [capabilities, domains],
  );
  const seasonOptions = useMemo(
    () => [
      { value: "", label: t["growth.challengeNone"] },
      ...seasons.map((season) => ({ value: String(season.id), label: season.title })),
    ],
    [seasons, t],
  );

  const save = async () => {
    if (busy) return;
    const clean = title.trim();
    if (!clean) return;
    setBusy(true);
    try {
      const content = {
        title: clean,
        description,
        goal,
        criteria,
      };
      const saved = challenge
        ? await window.prism.updateGrowthChallenge(
            challenge.id,
            locked
              ? content
              : {
                  ...content,
                  difficultyLevel: Number(difficulty),
                  capabilityId: capabilityId === "" ? null : Number(capabilityId),
                  seasonId: seasonId === "" ? null : Number(seasonId),
                },
          )
        : await window.prism.createGrowthChallenge({
            ...content,
            difficultyLevel: Number(difficulty),
            capabilityId: capabilityId === "" ? null : Number(capabilityId),
            seasonId: seasonId === "" ? null : Number(seasonId),
          });
      onSaved(saved);
      onClose();
    } catch (error) {
      if (error instanceof Error && error.message.includes("GROWTH_CHALLENGE_LOCKED")) {
        showToast(t["growth.challengeLocked"], "error");
      } else {
        showToast(t["common.actionFailed"], "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const setupBlock = locked ? (
    <div className="grid grid-cols-2 gap-3 rounded-card border border-strong/40 p-3">
      <div className="min-w-0 space-y-1">
        <span className="block text-caption text-muted">{t["growth.challengeCapability"]}</span>
        <span className="block truncate text-body text-secondary">
          {challenge?.capabilityName || t["growth.challengeNone"]}
        </span>
      </div>
      <div className="min-w-0 space-y-1">
        <span className="block text-caption text-muted">{t["growth.challengeSeason"]}</span>
        <span className="block truncate text-body text-secondary">
          {challenge?.seasonTitle || t["growth.challengeNone"]}
        </span>
      </div>
      <div className="min-w-0 space-y-1">
        <span className="block text-caption text-muted">{t["growth.challengeDifficulty"]}</span>
        <span className="block text-body text-secondary">{levelGrade(Number(difficulty))}</span>
      </div>
      <p className="col-span-2 text-caption text-faint">{t["growth.challengeLockedHint"]}</p>
    </div>
  ) : (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 space-y-1">
          <span className="block text-caption text-muted">{t["growth.challengeCapability"]}</span>
          <SelectButton
            value={capabilityId}
            groups={capabilityGroups}
            emptyLabel={t["growth.challengeNone"]}
            onChange={setCapabilityId}
            className="w-full"
          />
        </div>
        <div className="min-w-0 space-y-1">
          <span className="block text-caption text-muted">{t["growth.challengeSeason"]}</span>
          <SelectButton
            value={seasonId}
            options={seasonOptions}
            onChange={setSeasonId}
            className="w-full"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="block text-caption text-muted">{t["growth.challengeDifficulty"]}</span>
        <SegmentedToggle
          value={difficulty}
          options={LEVEL_VALUE_OPTIONS}
          onChange={setDifficulty}
          stretch
          className="w-full"
        />
        <p className="text-caption text-faint">{t[LEVEL_HINT_KEYS[Number(difficulty) - 1]]}</p>
        <p className="text-caption text-faint">{t["growth.challengeDifficultyHint"]}</p>
      </div>
    </>
  );

  const basicFields = (
    <>
      <label className="block space-y-1">
        <span className="block text-caption text-muted">{t["growth.challengeTitle"]}</span>
        <Input
          className="w-full"
          autoFocus
          value={title}
          placeholder={t["growth.challengeTitlePlaceholder"]}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      {setupBlock}

      <label className="block space-y-1">
        <span className="block text-caption text-muted">{t["growth.challengeDescription"]}</span>
        <Textarea
          className="w-full"
          rows={3}
          value={description}
          placeholder={t["growth.challengeDescriptionPlaceholder"]}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <label className="flex min-h-0 flex-1 flex-col space-y-1">
        <span className="block text-caption text-muted">{t["growth.challengeGoal"]}</span>
        <Textarea
          className="w-full min-h-[3.5rem] flex-1"
          rows={3}
          value={goal}
          placeholder={t["growth.challengeGoalPlaceholder"]}
          onChange={(event) => setGoal(event.target.value)}
        />
      </label>
    </>
  );

  const writingFields = (
    <label className="flex min-h-0 flex-1 flex-col space-y-1">
      <span className="block text-caption text-muted">{t["growth.challengeCriteria"]}</span>
      <Textarea
        className="w-full min-h-[34vh] flex-1"
        rows={10}
        value={criteria}
        placeholder={t["growth.challengeCriteriaPlaceholder"]}
        onChange={(event) => setCriteria(event.target.value)}
      />
      <p className="text-caption text-faint">{t["growth.challengeCriteriaHint"]}</p>
    </label>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={challenge ? t["growth.editChallenge"] : t["growth.newChallenge"]}
      layout="document"
      position="center"
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t["growth.cancel"]}
          </Button>
          <Button variant="primary" size="sm" disabled={busy || !title.trim()} onClick={() => void save()}>
            {challenge ? t["growth.save"] : t["growth.create"]}
          </Button>
        </>
      }
    >
      <div
        ref={bodyRef}
        className={`w-full ${twoColumn ? "flex h-full min-h-0 flex-col" : ""}`}
      >
        {twoColumn ? (
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-6">
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
              {basicFields}
            </div>
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
              {writingFields}
            </div>
          </div>
        ) : (
          <div className="w-full space-y-4">
            {basicFields}
            {writingFields}
          </div>
        )}
      </div>
    </Modal>
  );
}
