import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { StageBadge, formatMs } from "./StageBadge";
import { StageDetails } from "./StageDetails";
import { ROUTES, STAGES } from "../../flow/stages";
import type { StageState, TurnState } from "../../flow/turnState";
import { DURATION, EASE_OUT } from "../../motion";
import type { StageId } from "../../flow/protocol";

type Props = { turn: TurnState; focus: StageState | undefined };

/**
 * The details view: every stage of this turn's route, top to bottom. Finished
 * stages are ticked, the one in focus pulses, the rest wait in grey. The line
 * between two stages fills in once the upper one is done. Click a stage to open
 * its explanation and inspector (its real input and output); the one in focus
 * is open by default.
 */
export function RouteTimeline({ turn, focus }: Props) {
  const [opened, setOpened] = useState<StageId | null>(null);
  const open = opened ?? focus?.id ?? null;
  const route = turn.route ? ROUTES[turn.route] : null;
  const done = turn.stages.filter((s) => s.status === "done").length;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:min-h-0">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm">
          路线 Route：<span className="font-medium">{route ? `${route.zh} ${route.en}` : "判断中… Deciding"}</span>
        </p>
        <p className="text-xs tabular-nums text-muted">
          {done} / {turn.stages.length} 完成 · done
        </p>
      </div>
      {route && <p className="mb-4 text-xs leading-relaxed text-muted">{route.explain}</p>}

      <ol>
        {turn.stages.map((stage, i) => (
          // B1 依次出现: rows fade up one after another when the view opens.
          <motion.li
            key={stage.id}
            layout="position"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.enter, ease: EASE_OUT, delay: i * DURATION.stagger }}
            className="relative pb-1"
          >
            {i < turn.stages.length - 1 && <Connector filled={stage.status === "done"} />}
            <button
              type="button"
              className={`flex w-full items-center gap-3 rounded-lg py-2 pl-0 pr-2 text-left transition-colors hover:bg-surface-2 ${
                stage.id === focus?.id ? "bg-surface-2" : ""
              }`}
              onClick={() => setOpened(open === stage.id ? null : stage.id)}
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
                // G1 展开收起: the explanation opens smoothly instead of popping in.
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: DURATION.enter, ease: EASE_OUT }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-3 pb-3 pl-10 pr-2 text-xs leading-relaxed">
                    <div>
                      <p>{STAGES[stage.id].explain}</p>
                      <p className="mt-1 text-muted">真实系统 · In production: {STAGES[stage.id].realWorld}</p>
                    </div>
                    {/* The inspector: this stage's real input and output. */}
                    <StageDetails stage={stage} />
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
