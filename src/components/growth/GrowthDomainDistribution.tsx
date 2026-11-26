import { useMemo } from "react";
import { useT } from "../../i18n";
import { tagColor, type TagColorKey } from "../../lib/colors";
import { domainAggregates, levelGrade } from "../../lib/growth";
import type { GrowthCapability, GrowthDomain } from "../../shared/models";
import { LEVEL_NAME_KEYS } from "./labels";
import SectionCard from "../SectionCard";
import GrowthRadar from "./GrowthRadar";

interface Props {
  domains: GrowthDomain[];
  capabilities: GrowthCapability[];
  /** Clicking a radar axis filters the capability page to that domain. */
  onOpenDomain: (domainId: number) => void;
}

/** All-domain radar card moved from the removed home overview. */
export default function GrowthDomainDistribution({
  domains,
  capabilities,
  onOpenDomain,
}: Props) {
  const { t } = useT();
  const aggregates = useMemo(
    () => domainAggregates(domains, capabilities),
    [domains, capabilities],
  );

  return (
    <SectionCard
      className="growth-card-in min-w-0 flex-shrink-0"
      title={t["growth.overview.domains"]}
      headerActions={<span className="text-caption text-faint">{t["growth.overview.mapHint"]}</span>}
      bodyClassName="p-3"
    >
      <div className="flex h-[320px] w-full min-w-0 justify-center py-1">
        <GrowthRadar
          axes={domains.map((domain) => {
            const aggregate = aggregates.find((item) => item.domainId === domain.id);
            return {
              id: domain.id,
              label: domain.name,
              score: aggregate?.score ?? null,
              band: aggregate?.band ?? null,
              count: aggregate?.count ?? 0,
              color: tagColor(domain.theme as TagColorKey).name,
            };
          })}
          onAxisClick={onOpenDomain}
          ariaLabel={t["growth.domains"]}
        />
      </div>
      <p className="mt-2 text-caption text-faint">
        {t["growth.overview.levelLegend"]
          .replace("{l3}", `${levelGrade(3)} ${t[LEVEL_NAME_KEYS[2]]}`)
          .replace("{l4}", `${levelGrade(4)} ${t[LEVEL_NAME_KEYS[3]]}`)}
      </p>
    </SectionCard>
  );
}
