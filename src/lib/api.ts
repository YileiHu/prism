import type { PrismAPI } from "../../electron/preload";

declare global {
  interface Window {
    prism: PrismAPI;
  }
}
