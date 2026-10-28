import { t } from "../../preferences";
import { NodeIcon } from "./NodeIcon";
import { STAGES } from "../../flow/stages";
import type { StageState } from "../../flow/turnState";

/** Light plus title, used by both the step card and the route timeline. */
export function StageBadge({ stage, large = false }: { turnId?: string; stage: StageState; large?: boolean }) {
  const copy = STAGES[stage.id];
  return (
    <div className="flex min-w-0 items-center gap-3">
      <NodeIcon status={stage.status} />
      <span className={`min-w-0 truncate ${large ? "text-base font-semibold" : "text-sm"} ${stage.status === "pending" ? "text-muted" : ""}`}>
        {t(copy.zh)}
      </span>
    </div>
  );
}

export function formatMs(ms: number): string {
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
