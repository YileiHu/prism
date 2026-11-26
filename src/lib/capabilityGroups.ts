import type { GrowthCapability, GrowthDomain } from "../shared/models";

export interface CapabilityOptionGroup {
  label: string;
  options: { value: string; label: string }[];
}

/**
 * Capability pickers use one section per domain so a long flat list stays
 * readable. Archived capabilities are hidden; empty domains are dropped.
 */
export function capabilityGroupsByDomain(
  capabilities: GrowthCapability[],
  domains: GrowthDomain[],
): CapabilityOptionGroup[] {
  return [...domains]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((domain) => ({
      label: domain.name,
      options: capabilities
        .filter((capability) => capability.domainId === domain.id && capability.status !== "archived")
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((capability) => ({ value: String(capability.id), label: capability.name })),
    }))
    .filter((group) => group.options.length > 0);
}
