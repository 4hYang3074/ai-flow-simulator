import { t } from "../../preferences";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { StageBadge, formatMs } from "./StageBadge";
import { StageExplanation } from "./StageExplanation";
import { StageDetails } from "./StageDetails";
import { ROUTES, STAGES } from "../../flow/stages";
import type { StageState, TurnState } from "../../flow/turnState";
import { DURATION, EASE_OUT } from "../../motion";
import type { StageId } from "../../flow/protocol";

type Props = {
  turn: TurnState;
  focus: StageState | undefined;
  /** Stages whose label has flown in from the current-step card. */
  landed: Set<StageId>;
};

/**
 * The full route, always on screen: every stage of this turn, top to bottom.
 * A stage is ticked when its label lands here from the current-step card; the
 * one in focus pulses, the rest wait in grey. Click a stage to open its
 * explanation and inspector (its real input and output).
 */
export function RouteTimeline({ turn, focus, landed }: Props) {
  const [open, setOpen] = useState<StageId | null>(null);
  const route = turn.route ? ROUTES[turn.route] : null;
  // A finished stage still shows as running until its label arrives.
  const shown = turn.stages.map((s) =>
    (s.status === "done" || s.status === "failed") && !landed.has(s.id) ? { ...s, status: "active" as const } : s,
  );
  const done = shown.filter((s) => s.status === "done").length;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:min-h-0">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm">{t("路线 Route：")}<span className="font-medium">{route ? t(route.zh) : t("判断中… Deciding")}</span>
        </p>
        <p className="text-xs tabular-nums text-muted">
          {done} / {turn.stages.length} {t("完成 · Done")}
        </p>
      </div>
      {route && (
        <div className="mb-4 flex flex-col gap-2 text-sm leading-relaxed">
          <p>{t(route.explain)}</p>
          <p className="rounded-lg bg-surface-2 p-3"><span className="font-semibold">{t("路线示例")} · </span>{t(route.example)}</p>
        </div>
      )}

      <ol>
        {shown.map((stage, i) => (
          // A plain list: rows do not move. A row added when the route is
          // decided only fades in.
          <motion.li
            key={stage.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="relative pb-1"
            data-stage-row={stage.id}
          >
            {i < turn.stages.length - 1 && <Connector filled={stage.status === "done"} />}
            <button
              type="button"
              className={`flex w-full items-center gap-3 rounded-lg py-2 pl-0 pr-2 text-left transition-colors hover:bg-surface-2 ${
                stage.id === focus?.id ? "bg-surface-2" : ""
              }`}
              onClick={() => setOpen(open === stage.id ? null : stage.id)}
              aria-expanded={open === stage.id}
            >
              <span className="pl-2">
                <StageBadge turnId={turn.turnId} stage={stage} />
              </span>
              {stage.ms != null && (
                <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">{formatMs(stage.ms)}</span>
              )}
            </button>
            <AnimatePresence initial={false}>
              {open === stage.id && (
                // The explanation fades in under its row; the rows below move
                // down at once rather than sliding, so nothing overlaps.
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  transition={{ duration: DURATION.enter, ease: EASE_OUT }}
                >
                  <div className="flex flex-col gap-3 pb-3 pl-10 pr-2 text-xs leading-relaxed">
                    <div>
                      <StageExplanation stage={stage.id} compact />
                      <p className="mt-1 text-muted">{t(STAGES[stage.id].realWorld)}</p>
                    </div>
                    {/* The inspector: this stage's real input and output. */}
                    <section className="border-t border-border pt-3"><h3 className="mb-2 text-sm font-semibold">{t("本轮实际数据")}</h3><StageDetails stage={stage} /></section>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

/** The rail from one stage down to the next; it fills once the upper one is done. */
function Connector({ filled }: { filled: boolean }) {
  return (
    <span className="absolute bottom-0 left-[17px] top-[30px] w-0.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
      <motion.span
        className="absolute inset-0 origin-top bg-ok"
        initial={false}
        animate={{ scaleY: filled ? 1 : 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
      />
    </span>
  );
}
