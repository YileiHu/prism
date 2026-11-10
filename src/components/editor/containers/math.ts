import type { BlockRef } from "../blockModel";
import type { MathBlockRef } from "../mathModel";
import type { ContainerSpec } from "./types";

export const mathContainer: ContainerSpec = {
  kind: "math",
  container: true,
  entry(ref: BlockRef) {
    const block = ref as MathBlockRef;
    return {
      target: { kind: "math", part: "body" },
      anchor: block.bodyFrom + 1,
    };
  },
  sourceAnchor(ref: BlockRef) {
    return (ref as MathBlockRef).bodyFrom + 1;
  },
  deleteLabel: (t) => t["blockMath.delete"],
};
