import { Trash2 } from "lucide-react";
import ChipTabs from "../ChipTabs";
import EmptyState from "../EmptyState";
import ItemRow from "../ItemRow";
import { useT } from "../../i18n";
import { tagColor } from "../../lib/colors";
import type { GrowthSelfModelEntry, GrowthSelfSection } from "../../shared/models";
import {
  CONFIDENCE_NAME_KEYS,
  SELF_SECTIONS,
  SELF_SECTION_COLORS,
  SELF_SECTION_HINT_KEYS,
  SELF_SECTION_KEYS,
} from "./labels";
import GrowthStars from "./GrowthStars";

interface Props {
  entries: GrowthSelfModelEntry[];
  /** null = the "all" view. */
  value: GrowthSelfSection | null;
  onChange: (value: GrowthSelfSection | null) => void;
  onEdit: (entry: GrowthSelfModelEntry) => void;
  onDelete: (entry: GrowthSelfModelEntry) => void;
}

/**
 * The operating manual as one section at a time: chips carry the counts, the
 * selected section lists every statement with its evidence and confidence.
 */
export default function GrowthSelfModelPanel({ entries, value, onChange, onEdit, onDelete }: Props) {
  const { t } = useT();

  const renderRow = (entry: GrowthSelfModelEntry) => (
    <ItemRow
      key={entry.id}
      multiline
      tooltip={t["growth.edit"]}
      onPrimaryClick={() => onEdit(entry)}
      menuItems={[
        {
          label: t["menu.delete"],
          icon: <Trash2 size={14} />,
          danger: true,
          onClick: () => onDelete(entry),
        },
      ]}
      title={
        <>
          <span className="block text-body text-primary">{entry.statement}</span>
          {entry.evidence && (
            <span className="mt-0.5 block text-caption text-faint">{entry.evidence}</span>
          )}
        </>
      }
      trailing={
        <GrowthStars
          className="mt-0.5"
          value={entry.confidence}
          color={tagColor(SELF_SECTION_COLORS[entry.section]).bar}
          title={t[CONFIDENCE_NAME_KEYS[entry.confidence]]}
        />
      }
    />
  );

  return (
    <div className="space-y-3">
      <ChipTabs
        ariaLabel={t["growth.selfModel"]}
        allLabel={t["growth.self.all"]}
        value={value}
        onChange={onChange}
        items={SELF_SECTIONS.map((section) => ({
          key: section,
          label: t[SELF_SECTION_KEYS[section]],
          dot: tagColor(SELF_SECTION_COLORS[section]).bar,
        }))}
      />

      {value === null ? (
        <div className="space-y-4">
          {entries.length === 0 && (
            <EmptyState size="card" text={t["growth.emptySelfModel"]} />
          )}
          {SELF_SECTIONS.map((section) => {
            const rows = entries.filter((entry) => entry.section === section);
            if (rows.length === 0) return null;
            return (
              <section key={section}>
                <h3 className="mb-1 flex items-center gap-2 text-caption text-muted">
                  <span
                    className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: tagColor(SELF_SECTION_COLORS[section]).bar }}
                  />
                  {t[SELF_SECTION_KEYS[section]]}
                  <span className="tabular-nums text-faint">{rows.length}</span>
                </h3>
                <div>{rows.map((entry) => renderRow(entry))}</div>
              </section>
            );
          })}
        </div>
      ) : (
        <section>
          <p className="mb-1 flex items-center gap-1.5 text-caption text-faint">
            <span
              className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: tagColor(SELF_SECTION_COLORS[value]).bar }}
            />
            {t[SELF_SECTION_HINT_KEYS[value]]}
          </p>
          {entries.filter((entry) => entry.section === value).length === 0 ? (
            <EmptyState size="card" text={t["growth.self.emptySection"]} />
          ) : (
            <div>
              {entries
                .filter((entry) => entry.section === value)
                .map((entry) => renderRow(entry))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
