import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Brain, Gauge, MessagesSquare, NotebookText, Plus, Puzzle, Route, Sprout } from "lucide-react";
import Button from "../Button";
import { SkeletonRows } from "../Skeleton";
import EmptyState from "../EmptyState";
import ConfirmDialog from "../ConfirmDialog";
import { useToolbar, useToolbarContribution } from "../toolbar/ToolbarProvider";
import { useT } from "../../i18n";
import { useToast } from "../../lib/toast";
import type {
  GrowthArtifact,
  GrowthCapability,
  GrowthChallenge,
  GrowthPrediction,
  GrowthState,
  GrowthTask,
  GrowthTasksPayload,
} from "../../shared/models";
import type { Translation } from "../../i18n/zh";
import GrowthSidebar from "./GrowthSidebar";
import GrowthBoard from "./GrowthBoard";
import GrowthChallengeBoard from "./GrowthChallengeBoard";
import GrowthSelfView from "./GrowthSelfView";
import GrowthTaskModal from "./GrowthTaskModal";
import GrowthPredictionModal from "./GrowthPredictionModal";
import GrowthPredictionSettleModal from "./GrowthPredictionSettleModal";
import GrowthChronicleView from "./GrowthChronicleView";
import GrowthCapabilityCard from "./GrowthCapabilityCard";
import GrowthCapabilityModal from "./GrowthCapabilityModal";
import GrowthReviewModal from "./GrowthReviewModal";
import GrowthEvidenceModal from "./GrowthEvidenceModal";
import GrowthDomainModal from "./GrowthDomainModal";
import GrowthArtifactModal from "./GrowthArtifactModal";
import GrowthArtifactDetail from "./GrowthArtifactDetail";
import type {
  GrowthArtifactDefaults,
  GrowthPredictionLink,
  GrowthSelfViewKey,
  GrowthTaskDefaults,
  GrowthViewKey,
} from "./types";

/** Toolbar follows the project convention: it names the current view. */
const VIEW_META: Record<GrowthViewKey, { icon: typeof Sprout; labelKey: keyof Translation }> = {
  capabilities: { icon: Puzzle, labelKey: "growth.view.capabilities" },
  challenges: { icon: Route, labelKey: "growth.view.challenges" },
  self: { icon: Brain, labelKey: "growth.view.self" },
  chronicle: { icon: BookOpen, labelKey: "growth.view.chronicle" },
};

/** Toolbar title/icon for each 元认知 section; the sidebar still groups them. */
const SELF_SECTION_META: Record<
  GrowthSelfViewKey,
  { icon: typeof Sprout; labelKey: keyof Translation }
> = {
  accuracy: { icon: Gauge, labelKey: "growth.accuracy" },
  manual: { icon: NotebookText, labelKey: "growth.selfModel" },
  feedback: { icon: MessagesSquare, labelKey: "growth.feedback" },
};

// The six domains are seeds, not fixed schema: names live in i18n and are
// user-editable data afterwards. Only created when the table is empty.
const DEFAULT_DOMAINS: { key: keyof Translation; weight: number }[] = [
  { key: "growth.domain.cognition", weight: 0.2 },
  { key: "growth.domain.expression", weight: 0.15 },
  { key: "growth.domain.interpersonal", weight: 0.1 },
  { key: "growth.domain.execution", weight: 0.15 },
  { key: "growth.domain.physical", weight: 0.1 },
  { key: "growth.domain.professional", weight: 0.3 },
];

interface Props {
  active: boolean;
}

export default function GrowthView({ active }: Props) {
  const { t } = useT();
  const showToast = useToast();
  const [data, setData] = useState<GrowthState | null>(null);
  const [tasks, setTasks] = useState<GrowthTasksPayload>({ open: [], completed: [] });
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  const [view, setView] = useState<GrowthViewKey>("capabilities");
  // Which 元认知 sub-item the sidebar has selected; survives leaving the view.
  const [selfSection, setSelfSection] = useState<GrowthSelfViewKey>("accuracy");
  // Set when the chronicle jumps into a specific season; cleared on sidebar nav.
  const [challengeFocus, setChallengeFocus] = useState<number | null>(null);
  const [filterDomainId, setFilterDomainId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [capabilityModal, setCapabilityModal] = useState<{ open: boolean; capability: GrowthCapability | null }>({
    open: false,
    capability: null,
  });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [deletingCapability, setDeletingCapability] = useState<GrowthCapability | null>(null);
  const [domainModalOpen, setDomainModalOpen] = useState(false);
  const [taskModal, setTaskModal] = useState<{
    open: boolean;
    task: GrowthTask | null;
    capabilityId: number | null;
    challengeId: number | null;
  }>({ open: false, task: null, capabilityId: null, challengeId: null });
  const [predictionModal, setPredictionModal] = useState<{
    open: boolean;
    link: GrowthPredictionLink | null;
  }>({ open: false, link: null });
  const [settlingPrediction, setSettlingPrediction] = useState<GrowthPrediction | null>(null);
  // Set when another surface asks the season board to open one challenge.
  const [challengeToOpen, setChallengeToOpen] = useState<number | null>(null);
  const [deletingTask, setDeletingTask] = useState<GrowthTask | null>(null);
  const [artifactDetail, setArtifactDetail] = useState<GrowthArtifact | null>(null);
  const [deletingArtifact, setDeletingArtifact] = useState<GrowthArtifact | null>(null);
  const [artifactEdit, setArtifactEdit] = useState<{
    open: boolean;
    artifact: GrowthArtifact | null;
    defaults: GrowthArtifactDefaults;
  }>({ open: false, artifact: null, defaults: {} });
  const seededRef = useRef(false);
  const predictionsRef = useRef<GrowthPrediction[]>([]);

  const bump = useCallback(() => setVersion((value) => value + 1), []);

  // Tasks and forecasts are created from several surfaces; the module root owns
  // the dialogs so every entry point prefills the same links.
  const openNewTask = useCallback((defaults: GrowthTaskDefaults = {}) => {
    setTaskModal({
      open: true,
      task: null,
      capabilityId: defaults.capabilityId ?? null,
      challengeId: defaults.challengeId ?? null,
    });
  }, []);
  const openTask = useCallback((task: GrowthTask) => {
    setTaskModal({ open: true, task, capabilityId: null, challengeId: null });
  }, []);
  const openPrediction = useCallback((link: GrowthPredictionLink) => {
    setPredictionModal({ open: true, link });
  }, []);
  const openChallenge = useCallback((challenge: GrowthChallenge) => {
    setChallengeFocus(challenge.seasonId);
    setChallengeToOpen(challenge.id);
    setView("challenges");
  }, []);
  const openCapabilityById = useCallback((capabilityId: number) => {
    setSelectedId(capabilityId);
    setView("capabilities");
  }, []);

  // The completion toast offers the next step: settle a forecast linked to the
  // task, or undo the completion when there is none.
  const handleTaskToggled = useCallback(
    (task: GrowthTask, action: "completed" | "reopened") => {
      if (action === "reopened") {
        showToast(t["growth.tasks.reopenedToast"].replace("{title}", task.title), "success");
        return;
      }
      const pending = predictionsRef.current.filter(
        (row) => row.task?.id === task.id && row.actual === null,
      );
      if (pending.length > 0) {
        showToast(
          t["growth.tasks.completedPendingToast"]
            .replace("{title}", task.title)
            .replace("{count}", String(pending.length)),
          {
            type: "success",
            action: {
              label: t["growth.predictionSettle"],
              onClick: () => setSettlingPrediction(pending[0]),
            },
          },
        );
        return;
      }
      showToast(t["growth.tasks.completedToast"].replace("{title}", task.title), {
        type: "success",
        action: {
          label: t["common.undo"],
          onClick: () => {
            void window.prism
              .reopenGrowthTask(task.id)
              .then(bump)
              .catch(() => showToast(t["common.saveFailed"], "error"));
          },
        },
      });
    },
    [bump, showToast, t],
  );

  // Works are shown on the season wall and the chronicle, but edited from one
  // shared dialog owned here so every entry point gets the same form.
  const openNewArtifact = useCallback((defaults: GrowthArtifactDefaults = {}) => {
    setArtifactEdit({ open: true, artifact: null, defaults });
  }, []);
  const openArtifact = useCallback((artifact: GrowthArtifact) => {
    setArtifactDetail(artifact);
  }, []);
  const editArtifact = useCallback((artifact: GrowthArtifact) => {
    setArtifactEdit({ open: true, artifact, defaults: {} });
  }, []);
  const closeArtifactEdit = useCallback(() => {
    setArtifactEdit({ open: false, artifact: null, defaults: {} });
  }, []);
  const handleArtifactSaved = useCallback((saved: GrowthArtifact) => {
    // The detail may be open underneath the edit dialog: keep it in sync.
    setArtifactDetail((current) => (current && current.id === saved.id ? saved : current));
    closeArtifactEdit();
    bump();
  }, [bump, closeArtifactEdit]);

  const confirmDeleteArtifact = useCallback(async () => {
    if (!deletingArtifact) return;
    const target = deletingArtifact;
    try {
      await window.prism.deleteGrowthArtifact(target.id);
      setDeletingArtifact(null);
      setArtifactDetail((current) => (current?.id === target.id ? null : current));
      bump();
    } catch {
      showToast(t["common.deleteFailed"], "error");
      throw new Error("delete failed");
    }
  }, [deletingArtifact, bump, showToast, t]);

  const confirmDeleteTask = useCallback(async () => {
    if (!deletingTask) return;
    const target = deletingTask;
    try {
      await window.prism.deleteGrowthTask(target.id);
      setDeletingTask(null);
      setTaskModal((current) =>
        current.task?.id === target.id
          ? { open: false, task: null, capabilityId: null, challengeId: null }
          : current,
      );
      bump();
    } catch {
      showToast(t["common.deleteFailed"], "error");
      throw new Error("delete failed");
    }
  }, [deletingTask, bump, showToast, t]);

  useEffect(() => {
    let cancelled = false;
    window.prism
      .getGrowthState()
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch(() => {
        if (!cancelled) showToast(t["common.actionFailed"], "error");
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [version, showToast, t]);

  useEffect(() => {
    let cancelled = false;
    window.prism
      .getGrowthTasks()
      .then((next) => {
        if (!cancelled) setTasks(next);
      })
      .catch(() => {
        /* keep the previous snapshot */
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  // First run: seed the six domains with localized names, but only when the
  // module is actually opened. Idempotent - the ref stops a retry loop if the
  // insert fails (names are UNIQUE).
  useEffect(() => {
    if (!active) return;
    if (!data || data.domains.length > 0 || seededRef.current) return;
    seededRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        for (const domain of DEFAULT_DOMAINS) {
          await window.prism.createGrowthDomain(t[domain.key], domain.weight);
        }
      } catch {
        // A partial seed is still usable; the user can rename/add later.
      }
      if (!cancelled) bump();
    })();
    return () => {
      cancelled = true;
    };
  }, [active, data, t, bump]);

  useEffect(() => {
    const handler = () => bump();
    window.addEventListener("growth-changed", handler);
    return () => window.removeEventListener("growth-changed", handler);
  }, [bump]);

  useEffect(() => {
    if (active) bump();
  }, [active, bump]);

  const selected = useMemo(
    () => data?.capabilities.find((capability) => capability.id === selectedId) ?? null,
    [data, selectedId],
  );
  const selectedDomain = useMemo(() => {
    if (!data || !selected) return null;
    return data.domains.find((domain) => domain.id === selected.domainId) ?? null;
  }, [data, selected]);
  const selectedParentName = useMemo(() => {
    if (!data || !selected || selected.parentId === null) return null;
    return data.capabilities.find((item) => item.id === selected.parentId)?.name ?? null;
  }, [data, selected]);
  const domains = data?.domains ?? [];
  const capabilities = data?.capabilities ?? [];
  const challenges = data?.challenges ?? [];
  const artifacts = data?.artifacts ?? [];
  const seasons = data?.seasons ?? [];
  const currentSeason = seasons.find((season) => season.closedAt === null) ?? null;
  const predictions = data?.predictions ?? [];
  predictionsRef.current = predictions;
  const selfModel = data?.selfModel ?? [];
  const feedback = data?.feedback ?? [];
  const annualNotes = data?.annualNotes ?? [];

  const openNew = useCallback(() => {
    setCapabilityModal({ open: true, capability: null });
  }, []);

  const openCapability = useCallback((capability: GrowthCapability) => {
    setSelectedId(capability.id);
  }, []);

  // The challenges view owns its own actions (new / edit / settle season) and
  // registers them under a side key; the module toolbar merges them in.
  const challengeActions = useToolbar("growth:challenge-actions");
  // The capability board registers its filters and count the same way.
  const capabilityActions = useToolbar("growth:capability-actions");
  // Metacognition registers the active section's action; the section switch
  // itself lives in the sidebar.
  const selfControls = useToolbar("growth:self-controls");
  // The chronicle page owns the "edit annual page" action.
  const chronicleActions = useToolbar("growth:chronicle-actions");

  // The sidebar owns navigation; the toolbar keeps only the contextual create
  // action. The capability page always reads as "能力"; each 元认知 sub-item
  // shows its own name and icon (自知度 / 说明书 / 他评) instead of the group.
  const selfMeta = view === "self" ? SELF_SECTION_META[selfSection] : null;
  const ViewIcon = selfMeta?.icon ?? VIEW_META[view].icon;
  const viewLabelKey = selfMeta?.labelKey ?? VIEW_META[view].labelKey;
  const toolbar = useMemo(
    () => ({
      title: (
        <span className="flex items-center gap-2 text-body font-medium text-primary">
          <ViewIcon size={15} className="text-[var(--accent-text)]" />
          {t[viewLabelKey]}
        </span>
      ),
      subtitle: view === "capabilities" ? capabilityActions?.subtitle : undefined,
      actions:
        view === "challenges" ? (
          challengeActions?.actions
        ) : view === "capabilities" ? (
          <>
            {capabilityActions?.actions}
            <Button
              variant="ghost"
              size="icon-sm"
              title={t["growth.newCapability"]}
              aria-label={t["growth.newCapability"]}
              onClick={openNew}
            >
              <Plus size={15} />
            </Button>
          </>
        ) : view === "self" ? (
          selfControls?.actions
        ) : view === "chronicle" ? (
          chronicleActions?.actions
        ) : undefined,
    }),
    [
      t,
      view,
      viewLabelKey,
      openNew,
      challengeActions,
      capabilityActions,
      selfControls,
      chronicleActions,
    ],
  );
  useToolbarContribution("module:growth", toolbar);

  const confirmDelete = useCallback(async () => {
    if (!deletingCapability) return;
    const target = deletingCapability;
    try {
      await window.prism.deleteGrowthCapability(target.id);
      setSelectedId((current) => (current === target.id ? null : current));
      setDeletingCapability(null);
      bump();
    } catch {
      showToast(t["common.deleteFailed"], "error");
      throw new Error("delete failed");
    }
  }, [deletingCapability, bump, showToast, t]);

  return (
    <div className="flex h-full">
      <GrowthSidebar
        active={active}
        view={view}
        onView={(next) => {
          setChallengeFocus(null);
          // The sidebar's 能力 entry always lands on the all-domain 总览;
          // domain chips/additional navigation narrow it afterwards.
          if (next === "capabilities") setFilterDomainId(null);
          setView(next);
        }}
        selfSection={selfSection}
        onSelfSection={(next) => {
          setChallengeFocus(null);
          setSelfSection(next);
          setView("self");
        }}
        capabilityCount={capabilities.length}
        openChallengeCount={challenges.filter((item) => item.status === "open").length}
      />

      <div key={view} className="growth-view flex min-h-0 min-w-0 flex-1 flex-col">
        {!loaded ? (
          <SkeletonRows count={7} className="p-2" />
        ) : !data ? (
          <EmptyState
            size="module"
            fill
            icon={<Sprout size={32} className="text-faint" />}
            title={t["nav.growth"]}
            description={t["growth.loadFailed"]}
          />
        ) : view === "challenges" ? (
          <GrowthChallengeBoard
            seasons={seasons}
            challenges={challenges}
            artifacts={artifacts}
            capabilities={capabilities}
            domains={domains}
            tasks={tasks}
            predictions={predictions}
            focusSeasonId={challengeFocus}
            openChallengeId={challengeToOpen}
            onChallengeOpened={() => setChallengeToOpen(null)}
            onChanged={bump}
            onOpenTask={openTask}
            onNewTask={openNewTask}
            onPredictTask={(task) =>
              openPrediction({
                capabilityId: task.capability?.id ?? null,
                task: { id: task.id, title: task.title },
                subject: task.title,
              })
            }
            onNewPrediction={openPrediction}
            onSettlePrediction={setSettlingPrediction}
            onDeleteTask={setDeletingTask}
            onTaskToggled={handleTaskToggled}
            onOpenCapability={openCapabilityById}
            onOpenArtifact={openArtifact}
            onEditArtifact={editArtifact}
            onNewArtifact={openNewArtifact}
            onDeleteArtifact={setDeletingArtifact}
          />
        ) : view === "self" ? (
          <GrowthSelfView
            predictions={predictions}
            selfModel={selfModel}
            feedback={feedback}
            section={selfSection}
            onNewPrediction={() =>
              openPrediction({ capabilityId: null, challenge: null, task: null })
            }
            onSettlePrediction={setSettlingPrediction}
            onChanged={bump}
          />
        ) : view === "chronicle" ? (
          <GrowthChronicleView
            version={version}
            seasons={seasons}
            challenges={challenges}
            artifacts={artifacts}
            annualNotes={annualNotes}
            onOpenSeason={(seasonId) => {
              setChallengeFocus(seasonId);
              setView("challenges");
            }}
            onOpenCapabilities={() => {
              setFilterDomainId(null);
              setView("capabilities");
            }}
            onOpenArtifact={openArtifact}
            onDeleteArtifact={setDeletingArtifact}
            onChanged={bump}
          />
        ) : (
          <GrowthBoard
            domains={domains}
            capabilities={capabilities}
            filterDomainId={filterDomainId}
            onFilterDomain={setFilterDomainId}
            onEditDomains={() => setDomainModalOpen(true)}
            onOpen={openCapability}
            onNew={openNew}
            onDeleteCapability={setDeletingCapability}
            tasks={tasks}
            onOpenTask={openTask}
            onDeleteTask={setDeletingTask}
            onPredictTask={(task) =>
              openPrediction({
                capabilityId: task.capability?.id ?? null,
                task: { id: task.id, title: task.title },
                subject: task.title,
              })
            }
            onTaskToggled={handleTaskToggled}
            onChanged={bump}
          />
        )}
      </div>

      <GrowthCapabilityCard
        open={selected !== null}
        capability={selected}
        domain={selectedDomain}
        parentName={selectedParentName}
        onClose={() => setSelectedId(null)}
        onEdit={() => setCapabilityModal({ open: true, capability: selected })}
        onReview={() => setReviewOpen(true)}
        onAddEvidence={() => setEvidenceOpen(true)}
        onChanged={bump}
        tasks={tasks}
        challenges={challenges}
        predictions={predictions}
        onOpenTask={openTask}
        onDeleteTask={setDeletingTask}
        onNewTask={openNewTask}
        onPredictTask={(task) =>
          openPrediction({
            capabilityId: task.capability?.id ?? null,
            task: { id: task.id, title: task.title },
            subject: task.title,
          })
        }
        onNewPrediction={openPrediction}
        onSettlePrediction={setSettlingPrediction}
        onOpenChallenge={openChallenge}
        onTaskToggled={handleTaskToggled}
      />

      <GrowthCapabilityModal
        open={capabilityModal.open}
        capability={capabilityModal.capability}
        domains={domains}
        capabilities={capabilities}
        defaultDomainId={filterDomainId}
        onClose={() => setCapabilityModal({ open: false, capability: null })}
        onSaved={bump}
      />

      <GrowthReviewModal
        open={reviewOpen && selected !== null}
        capability={selected}
        challenges={challenges}
        onClose={() => setReviewOpen(false)}
        onReviewed={bump}
      />

      <GrowthEvidenceModal
        open={evidenceOpen && selected !== null}
        capabilityId={selected?.id ?? null}
        capabilityName={selected?.name ?? null}
        onClose={() => setEvidenceOpen(false)}
        onSaved={bump}
      />

      <GrowthDomainModal
        open={domainModalOpen}
        domains={domains}
        onClose={() => setDomainModalOpen(false)}
        onSaved={bump}
      />

      <GrowthTaskModal
        open={taskModal.open}
        task={taskModal.task}
        defaultCapabilityId={taskModal.capabilityId}
        defaultChallengeId={taskModal.challengeId}
        challenges={challenges}
        currentSeasonId={currentSeason?.id ?? null}
        capabilities={capabilities}
        domains={domains}
        onClose={() =>
          setTaskModal({ open: false, task: null, capabilityId: null, challengeId: null })
        }
        onSaved={bump}
      />

      <GrowthPredictionModal
        open={predictionModal.open}
        link={predictionModal.link}
        capabilities={capabilities}
        domains={domains}
        onClose={() => setPredictionModal({ open: false, link: null })}
        onSaved={bump}
      />

      <GrowthPredictionSettleModal
        prediction={settlingPrediction}
        onClose={() => setSettlingPrediction(null)}
        onSaved={bump}
      />

      <GrowthArtifactDetail
        open={artifactDetail !== null}
        artifact={artifactDetail}
        challenges={challenges}
        onClose={() => setArtifactDetail(null)}
        onEdit={editArtifact}
      />

      <GrowthArtifactModal
        open={artifactEdit.open}
        artifact={artifactEdit.artifact}
        defaults={artifactEdit.defaults}
        capabilities={capabilities}
        domains={domains}
        challenges={challenges}
        onClose={closeArtifactEdit}
        onSaved={handleArtifactSaved}
      />

      <ConfirmDialog
        open={deletingTask !== null}
        message={t["growth.deleteTaskConfirm"]}
        onConfirm={confirmDeleteTask}
        onClose={() => setDeletingTask(null)}
      />

      <ConfirmDialog
        open={deletingArtifact !== null}
        message={t["growth.deleteArtifactConfirm"]}
        onConfirm={confirmDeleteArtifact}
        onClose={() => setDeletingArtifact(null)}
      />

      <ConfirmDialog
        open={deletingCapability !== null}
        message={t["growth.deleteCapabilityConfirm"]}
        confirmLabel={t["growth.delete"]}
        onConfirm={confirmDelete}
        onClose={() => setDeletingCapability(null)}
      />
    </div>
  );
}
