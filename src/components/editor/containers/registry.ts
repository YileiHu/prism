import type { BlockRef } from "../blockModel";
import type { BlockKind } from "../blockState";
import { calloutContainer } from "./callout";
import { codeContainer } from "./code";
import { embedContainer } from "./embed";
import { mathContainer } from "./math";
import { tableContainer } from "./table";
import type { ContainerEntry, ContainerSpec } from "./types";

const registry = new Map<BlockKind, ContainerSpec>();

export function registerContainer(spec: ContainerSpec): void {
  registry.set(spec.kind, spec);
}

registerContainer(codeContainer);
registerContainer(tableContainer);
registerContainer(calloutContainer);
registerContainer(mathContainer);
registerContainer(embedContainer);

export function containerSpec(kind: BlockKind): ContainerSpec {
  const spec = registry.get(kind);
  if (!spec) throw new Error(`No container spec registered for "${kind}"`);
  return spec;
}

export function containerEntry(ref: BlockRef, target?: HTMLElement | null): ContainerEntry {
  return containerSpec(ref.kind).entry(ref, target);
}

export function allContainers(): ContainerSpec[] {
  return [...registry.values()];
}
