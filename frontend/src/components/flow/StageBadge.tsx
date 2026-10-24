import { motion } from "motion/react";
import { NodeIcon } from "./NodeIcon";
import { STAGES } from "../../flow/stages";
import type { StageState } from "../../flow/turnState";
import { DURATION, EASE_OUT } from "../../motion";

/**
 * Light plus title. The step card and the route timeline both render it with
 * the same `layoutId`, so switching views moves this one element from the card
 * to its row (G2 共享元素) instead of cutting between two screens.
 */
export function StageBadge({ turnId, stage, large = false }: { turnId: string; stage: StageState; large?: boolean }) {
  const copy = STAGES[stage.id];
  return (
    <motion.div
      layoutId={`badge-${turnId}-${stage.id}`}
      className="flex min-w-0 items-center gap-3"
      transition={{ duration: DURATION.enter, ease: EASE_OUT }}
    >
      <NodeIcon status={stage.status} />
      <span className={`min-w-0 truncate ${large ? "text-base font-semibold" : "text-sm"} ${stage.status === "pending" ? "text-muted" : ""}`}>
        {copy.zh} <span className="font-normal text-muted">{copy.en}</span>
      </span>
    </motion.div>
  );
}

export function formatMs(ms: number): string {
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
