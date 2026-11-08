import type { CanvasPreset } from "../../shared/settings";
import type { CanvasNode } from "./model";

export const PRESET_MIME = "application/x-prism-canvas-preset";

export function newPresetId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `p_${cryptoApi.randomUUID().slice(0, 8)}`;
  }
  return `p_${Math.random().toString(36).slice(2, 10)}`;
}

export function presetFromNode(node: CanvasNode, name: string): CanvasPreset {
  return {
    id: newPresetId(),
    name,
    color: node.color,
    fontSize: node.fontSize,
    bold: node.bold,
    align: node.align,
    valign: node.valign,
    width: node.width,
    height: node.height,
  };
}
