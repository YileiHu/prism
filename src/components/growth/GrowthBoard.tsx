import { useMemo, useState } from "react";
import { ChevronRight, Plus, Settings2, Sprout, Trash2 } from "lucide-react";
import ChipTabs from "../ChipTabs";
import EmptyState from "../EmptyState";
import ItemRow from "../ItemRow";
import SectionCard from "../SectionCard";
import { useToolbarContribution } from "../toolbar/ToolbarProvider";
import GrowthRadar from "./GrowthRadar";
import GrowthEmptyGuide from "./GrowthEmptyGuide";
import GrowthDomainDistribution from "./GrowthDomainDistribution";
import GrowthTasksCard from "./GrowthTasksCard";
import Button from "../Button";
import SegmentedToggle from "../SegmentedToggle";
import { useT } from "../../i18n";
import type {
  GrowthCapability,
  GrowthDomain,
  GrowthTask,
  GrowthTasksPayload,
} from "../../shared/models";
import { capabilityDisplay, capabilityGap, levelGrade, portableShare } from "../../lib/growth";
import { tagColor, type PaletteColor, type TagColorKey } from "../../lib/colors";
import GrowthLevelBar from "./GrowthLevelBar";
import {
  ConfidenceBadge,
  HalfLifeBadge,
  PortabilityBadge,
  StatusBadge,
} from "./GrowthBadges";

interface Props {
  domains: GrowthDomain[];
  capabilities: GrowthCapability[];
  filterDomainId: number | null;
  onFilterDomain: (domainId: number | null) => void;
  onEditDomains: () => void;
  onOpen: (capability: GrowthCapability) => void;
  onNew: () => void;
  onDeleteCapability: (capability: GrowthCapability) => void;
  tasks: GrowthTasksPayload;
  onOpenTask: (task: GrowthTask) => void;
  onDeleteTask: (task: GrowthTask) => void;
  onPredictTask: (task: GrowthTask) => void;
  onTaskToggled: (task: GrowthTask, action: "completed" | "reopened") => void;
  onChanged: () => void;
}

export default function GrowthBoard({
  domains,
  capabilities,
  filterDomainId,
  onFilterDomain,
  onEditDomains,
  onOpen,
  onNew,
  onDeleteCapability,
  tasks,
  onOpenTask,
  onDeleteTask,
  onPredictTask,
  onTaskToggled,
  onChanged,
}: Props) {
  const { t } = useT();
  const [clearView, setClearView] = useState(false);
  const [collapsed, setCollapsed] = useState<number[]>([]);

  // Non-active capabilities stay in the list and radar (dashed markers), but
  // the clear-view asset lens only counts active capabilities.
  const visible = useMemo(
    () =>
      capabilities.filter((cap) => {
        if (clearView) {
          if (cap.status !== "active") return false;
          if (!(cap.portability === "high" && cap.halfLife === "long")) return false;
        }
        if (filterDomainId !== null && cap.domainId !== filterDomainId) return false;
        return true;
      }),
    [capabilities, clearView, filterDomainId],
  );

  const shownDomains = useMemo(
    () => domains.filter((domain) => filterDomainId === null || domain.id === filterDomainId),
    [domains, filterDomainId],
  );


  const share = useMemo(() => portableShare(capabilities), [capabilities]);
  // Task badges borrow the linked capability's domain colour, matching the
  // capability rows on this page.
  const capabilityColors = useMemo(() => {
    const domainColors = new Map(
      domains.map((domain) => [domain.id, tagColor(domain.theme as TagColorKey)]),
    );
    const colors = new Map<number, PaletteColor>();
    for (const capability of capabilities) {
      const color = domainColors.get(capability.domainId);
      if (color) colors.set(capability.id, color);
    }
    return colors;
  }, [domains, capabilities]);
  const capabilityToolbar = useMemo(
    () => ({
      subtitle: (
        <span className="flex items-center gap-2 text-caption text-faint">
          <span>{t["growth.capabilityCount"].replace("{count}", String(visible.length))}</span>
          {clearView && share !== null && (
            <span className="tabular-nums text-[var(--accent-text)]">
              {t["growth.portableShare"].replace("{value}", String(Math.round(share * 100)))}
            </span>
          )}
        </span>
      ),
      actions: (
        <SegmentedToggle
          value={clearView ? "clear" : "all"}
          options={[
            { value: "all", label: t["growth.clearViewAll"] },
            { value: "clear", label: t["growth.clearView"] },
          ]}
          onChange={(value) => setClearView(value === "clear")}
        />
      ),
    }),
    [t, visible.length, clearView, share],
  );
  useToolbarContribution("growth:capability-actions", capabilityToolbar);

  const toggle = (id: number) =>
    setCollapsed((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));

  if (capabilities.length === 0) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <GrowthEmptyGuide
          icon={<Sprout size={22} />}
          eyebrow={t["growth.guide.eyebrow"]}
          title={t["growth.guide.boardTitle"]}
          description={t["growth.guide.boardDesc"]}
          steps={[
            {
              title: t["growth.guide.stepCapability"],
              description: t["growth.guide.stepCapabilityDesc"],
            },
            {
              title: t["growth.guide.stepEvidence"],
              description: t["growth.guide.stepEvidenceDesc"],
            },
            {
              title: t["growth.guide.stepReview"],
              description: t["growth.guide.stepReviewDesc"],
            },
          ]}
          primary={{ label: t["growth.newCapability"], onClick: onNew, icon: <Plus size={12} /> }}
          hint={t["growth.guide.boardHint"]}
        />
      </div>
    );
  }

  // The all-capabilities list is shared by both layouts: next to the domain
  // radar in 总览, and alone in a filtered domain page.
  const capabilityList = (
    <SectionCard
      title={t["growth.view.capabilities"]}
      count={visible.length}
      className="flex min-h-[320px] w-full flex-col lg:min-h-[240px] lg:flex-1"
      bodyClassName="motion-stagger min-h-0 flex-1 overflow-y-auto p-1.5"
    >
        {visible.length === 0 ? (
          <EmptyState
            size="card"
            text={clearView ? t["growth.emptyClearView"] : t["growth.emptyCapabilities"]}
          />
        ) : (
          shownDomains.map((domain) => {
          const rows = visible.filter((cap) => cap.domainId === domain.id);
          if (rows.length === 0) return null;
          const isCollapsed = collapsed.includes(domain.id);
          const domainPalette = tagColor(domain.theme as TagColorKey);
          return (
            <div key={domain.id} className="mb-1">
              <button
                type="button"
                onClick={() => toggle(domain.id)}
                className="flex w-full items-center gap-2 rounded-control px-2 py-1 text-left transition-colors hover:bg-hover"
              >
                <span
                  className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: domainPalette.bar }}
                />
                <span className="text-caption text-muted">{domain.name}</span>
                <span className="text-caption tabular-nums text-faint">{rows.length}</span>
                <ChevronRight
                  size={12}
                  className={`ml-auto text-faint transition-transform ${
                    isCollapsed ? "" : "rotate-90"
                  }`}
                />
              </button>
              {!isCollapsed && (
                <ul className="mt-0.5">
                  {treeOrder(rows).map(({ cap, depth }) => (
                    <li key={cap.id}>
                      <CapabilityRow
                        capability={cap}
                        depth={depth}
                        compact
                        onOpen={onOpen}
                        onDelete={onDeleteCapability}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })
        )}
    </SectionCard>
  );

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4 lg:overflow-hidden">
      <div className="shrink-0 space-y-2">

        <ChipTabs
          ariaLabel={t["growth.domains"]}
          allLabel={t["growth.view.overview"]}
          value={filterDomainId}
          onChange={onFilterDomain}
          items={domains.map((domain) => ({
            key: domain.id,
            label: domain.name,
            meta: `${Math.round(domain.weight * 100)}%`,
            dot: tagColor(domain.theme as TagColorKey).bar,
          }))}
          trailing={
            <Button
              variant="ghost"
              size="icon-sm"
              title={t["growth.editDomains"]}
              aria-label={t["growth.editDomains"]}
              onClick={onEditDomains}
            >
              <Settings2 size={15} />
            </Button>
          }
        />

        <div
          className="flex h-2 w-full overflow-hidden rounded-chip bg-elevated/50"
          role="img"
          aria-label={t["growth.board.weightBar"]}
        >
          {domains.map((domain) => {
            const dimmed = filterDomainId !== null && filterDomainId !== domain.id;
            return (
              <span
                key={`weight-${domain.id}`}
                title={`${domain.name} · ${Math.round(domain.weight * 100)}%`}
                className="transition-opacity"
                style={{
                  width: `${Math.round(domain.weight * 100)}%`,
                  backgroundColor: tagColor(domain.theme as TagColorKey).bar,
                  opacity: dimmed ? 0.22 : 1,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Below lg the page itself scrolls, so this column must grow with its
          content — a fixed `flex-1` height would park the page's bottom padding
          above the overflow and leave the last cards flush with the edge. */}
      <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {filterDomainId === null ? (
          <>
            {/* All domains is the page's overview: tasks own the left column;
                the domain radar sits above the all-capabilities list on the
                right. Below lg both columns stack and the page scrolls. */}
            <div className="flex min-h-[480px] min-w-0 flex-col lg:min-h-0 lg:flex-1">
              <GrowthTasksCard
                tasks={tasks}
                capabilityColors={capabilityColors}
                onOpenTask={onOpenTask}
                onDeleteTask={onDeleteTask}
                onPredictTask={onPredictTask}
                onTaskToggled={onTaskToggled}
                onChanged={onChanged}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-3 lg:min-h-0 lg:w-[340px] lg:flex-shrink-0 lg:overflow-y-auto xl:w-[400px]">
              <GrowthDomainDistribution
                domains={domains}
                capabilities={visible}
                onOpenDomain={onFilterDomain}
              />
              {capabilityList}
            </div>
          </>
        ) : (
          <>
            {/* This grid is a scroll container whose rows exactly fill its
                height. A translateY entrance on its direct children would
                briefly grow the scroll height and flash a scrollbar, so the
                cards fade instead. */}
            <div className="grid min-w-0 auto-rows-fr gap-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto grid-cols-1">
            {shownDomains.map((domain, index) => {
              const rows = visible.filter((cap) => cap.domainId === domain.id);
              const domainPalette = tagColor(domain.theme as TagColorKey);
              const axes = rows.slice(0, 10).map((cap) => {
                const display = capabilityDisplay(cap);
                return {
                  id: cap.id,
                  label: cap.name,
                  score: display.score,
                  band: display.band ?? 0,
                  status: cap.status,
                };
              });
              const activeFilter = filterDomainId === domain.id;
              return (
                <section
                  key={domain.id}
                  className="growth-card-in flex min-h-[220px] flex-col rounded-card border border-strong/40 bg-surface p-2.5"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <header className="flex items-baseline gap-2">
                    <span
                      className="h-1.5 w-1.5 self-center rounded-full"
                      style={{ backgroundColor: domainPalette.bar }}
                    />
                    <button
                      type="button"
                      onClick={() => onFilterDomain(activeFilter ? null : domain.id)}
                      title={domain.name}
                      className="min-w-0 truncate text-caption text-muted hover:text-primary"
                    >
                      {domain.name}
                    </button>
                    <span className="ml-auto flex-shrink-0 text-caption tabular-nums text-faint">
                      {Math.round(domain.weight * 100)}% · {rows.length}
                    </span>
                  </header>
                  <div className="mt-1 flex min-h-0 flex-1 items-center justify-center">
                    {axes.length >= 3 ? (
                      <GrowthRadar
                        axes={axes}
                        fallbackSize={160}
                        color={domainPalette.bar}
                        chipColor={domainPalette.name}
                        ariaLabel={domain.name}
                        onAxisClick={(capabilityId) => {
                          const target = rows.find((cap) => cap.id === capabilityId);
                          if (target) onOpen(target);
                        }}
                      />
                    ) : (
                      <ul className="w-full space-y-0.5">
                        <li className="px-1 text-caption text-faint">
                          {t["growth.domainRadar.needThree"]}
                        </li>
                        {rows.map((cap) => (
                          <li key={cap.id}>
                            <ItemRow
                              onPrimaryClick={() => onOpen(cap)}
                              menuItems={[
                                {
                                  label: t["menu.delete"],
                                  icon: <Trash2 size={14} />,
                                  danger: true,
                                  onClick: () => onDeleteCapability(cap),
                                },
                              ]}
                              className={`text-caption ${
                                cap.status === "archived"
                                  ? "opacity-70"
                                  : cap.status === "observe"
                                    ? "opacity-90"
                                    : ""
                              }`}
                              title={<span className="truncate text-caption text-secondary">{cap.name}</span>}
                              meta={
                                <span className="flex flex-shrink-0 items-center gap-2">
                                  {cap.status !== "active" && <StatusBadge value={cap.status} />}
                                  <span className="tabular-nums text-caption text-faint">
                                    {levelGrade(cap.level)}
                                  </span>
                                </span>
                              }
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          <div className="flex min-w-0 flex-col lg:min-h-0 lg:w-[400px] lg:flex-shrink-0 lg:overflow-y-auto">
            {capabilityList}
          </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Roots first, each followed by its prerequisites-children; orphans stay visible. */
function treeOrder(rows: GrowthCapability[]): { cap: GrowthCapability; depth: number }[] {
  const ids = new Set(rows.map((row) => row.id));
  const result: { cap: GrowthCapability; depth: number }[] = [];
  const placed = new Set<number>();
  for (const root of rows.filter((row) => row.parentId === null)) {
    result.push({ cap: root, depth: 0 });
    placed.add(root.id);
    for (const child of rows.filter((row) => row.parentId === root.id)) {
      result.push({ cap: child, depth: 1 });
      placed.add(child.id);
    }
  }
  for (const row of rows) {
    if (!placed.has(row.id)) {
      // Parent was filtered out (clear view / domain) — keep the row visible.
      result.push({ cap: row, depth: ids.has(row.parentId ?? -1) ? 1 : 0 });
      placed.add(row.id);
    }
  }
  return result;
}

function CapabilityRow({
  capability,
  depth,
  compact = false,
  onOpen,
  onDelete,
}: {
  capability: GrowthCapability;
  depth: number;
  /** Narrow column: drop the badges and the target-gap column. */
  compact?: boolean;
  onOpen: (capability: GrowthCapability) => void;
  /** Delete is a context-menu action, never a trailing button. */
  onDelete: (capability: GrowthCapability) => void;
}) {
  const { t } = useT();
  const display = capabilityDisplay(capability);
  const gap = capabilityGap(capability);
  const inactiveOpacity =
    capability.status === "archived" ? "opacity-70" : capability.status === "observe" ? "opacity-90" : "";

  return (
    <ItemRow
      onPrimaryClick={() => onOpen(capability)}
      menuItems={[
        {
          label: t["menu.delete"],
          icon: <Trash2 size={14} />,
          danger: true,
          onClick: () => onDelete(capability),
        },
      ]}
      className={inactiveOpacity}
      leading={
        depth > 0 ? (
          <span className="w-3 flex-shrink-0 text-caption text-faint" aria-hidden>
            └
          </span>
        ) : undefined
      }
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-body text-primary">{capability.name}</span>
          {capability.status !== "active" && <StatusBadge value={capability.status} />}
          {display.stale && capability.status !== "archived" && (
            <span
              className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-warning"
              title={t["growth.staleShort"]}
              aria-label={t["growth.staleShort"]}
            />
          )}
        </span>
      }
      trailing={
        !compact ? (
          <span className="hidden items-center gap-1 sm:flex">
            <HalfLifeBadge value={capability.halfLife} />
            <PortabilityBadge value={capability.portability} />
          </span>
        ) : undefined
      }
      meta={
        <span className="flex flex-shrink-0 items-center gap-2">
          <span className={`flex items-center gap-1.5 ${compact ? "w-[5.5rem]" : "w-28"}`}>
            <span className="min-w-0 flex-1">
              <GrowthLevelBar
                level={capability.level}
                band={display.band}
                targetLevel={capability.targetLevel}
              />
            </span>
            <ConfidenceBadge
              confidence={display.effectiveConfidence}
              band={display.band}
            />
          </span>
          {!compact && (
            <span className="w-12 text-right text-caption tabular-nums text-secondary">
              {gap === null ? "—" : gap > 0 ? `+${gap}` : String(gap)}
            </span>
          )}
        </span>
      }
    />
  );
}

