import { useSyncExternalStore } from "react";

/**
 * A tiny LIFO stack for `Modal` layers. Only dialogs live here — menus,
 * popovers, toasts and drag previews keep their own z-index because they are
 * lightweight layers that must still float above a dialog.
 *
 * Responsibilities:
 * - one document-level Escape listener that closes only the top dialog;
 * - an authoritative layer order so `Modal` can assign z-index and hide the
 *   backdrops of covered dialogs;
 * - "which layer is on top" so lower dialogs can become inert/aria-hidden.
 */
interface ModalLayer {
  id: string;
  getOnClose: () => void;
  getCloseOnEscape: () => boolean;
  exiting: boolean;
}

export interface ModalLayerRegistration {
  getOnClose: () => void;
  getCloseOnEscape: () => boolean;
}

let layers: ModalLayer[] = [];
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return version;
}

function onDocumentKeyDown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== "Escape" || event.defaultPrevented) return;
  const top = layers[layers.length - 1];
  // A closing dialog keeps its place until the exit animation ends; don't let
  // Escape fall through to the dialog underneath during that window.
  if (!top || top.exiting || !top.getCloseOnEscape()) return;
  top.getOnClose();
}

let listening = false;

function ensureListener() {
  if (listening || typeof document === "undefined") return;
  document.addEventListener("keydown", onDocumentKeyDown);
  listening = true;
}

function maybeRemoveListener() {
  if (!listening || layers.length > 0) return;
  document.removeEventListener("keydown", onDocumentKeyDown);
  listening = false;
}

export function registerModalLayer(
  id: string,
  registration: ModalLayerRegistration,
): () => void {
  layers = layers
    .filter((layer) => layer.id !== id)
    .concat({ id, ...registration, exiting: false });
  ensureListener();
  emit();
  return () => {
    layers = layers.filter((layer) => layer.id !== id);
    maybeRemoveListener();
    emit();
  };
}

export function setModalLayerExiting(id: string, exiting: boolean) {
  const layer = layers.find((item) => item.id === id);
  if (!layer || layer.exiting === exiting) return;
  layer.exiting = exiting;
  emit();
}

export interface ModalLayerState {
  /** 0 for the first dialog, 1 for a dialog opened on top of it, etc. */
  depth: number;
  /** The last dialog in the stack; only it reacts to Escape/focus. */
  isTop: boolean;
}

export function useModalLayer(id: string): ModalLayerState {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const index = layers.findIndex((layer) => layer.id === id);
  if (index === -1) {
    // Mounted but not registered yet (registration runs in an effect): treat
    // the pending dialog as the top layer so it doesn't flash as covered.
    return { depth: layers.length, isTop: true };
  }
  return { depth: index, isTop: index === layers.length - 1 };
}
