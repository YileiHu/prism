import { useT } from "../../i18n";
import { useSettings } from "../../lib/settings";
import { normalizePath } from "../../lib/paths";
import type { VaultEntry } from "../../types";
import { SectionHeader, Select, SettingRow } from "./controls";

export default function GtdSection({ vaults }: { vaults: VaultEntry[] }) {
  const { t } = useT();
  const { values, set } = useSettings();
  const current = values.project_vault_path;
  const known = vaults.some((vault) => normalizePath(vault.path) === normalizePath(current));
  const options = [
    { value: "", label: t["settings.projectVaultNone"] },
    ...vaults.map((vault) => ({ value: vault.path, label: vault.name })),
    ...(current && !known
      ? [{ value: current, label: t["settings.projectVaultMissing"] }]
      : []),
  ];

  return (
    <section>
      <SectionHeader title={t["settings.catGtd"]} description={t["settings.gtdDesc"]} />
      <div className="space-y-3">
        <SettingRow
          label={t["settings.projectVault"]}
          description={t["settings.projectVaultDesc"]}
        >
          <Select
            value={current}
            options={options}
            onChange={(value) => set("project_vault_path", value)}
          />
        </SettingRow>
        {vaults.length === 0 && (
          <p className="px-4 text-caption text-muted">{t["settings.projectVaultNoVaults"]}</p>
        )}
      </div>
    </section>
  );
}
