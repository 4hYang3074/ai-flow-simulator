import { t } from "../../preferences";
import { AnimatePresence, motion } from "motion/react";
import { StageBadge, formatMs } from "./StageBadge";
import { StageExplanation } from "./StageExplanation";
import { StageDetails } from "./StageDetails";
import { ERRORS, STAGES } from "../../flow/stages";
import type { StageState, TurnState } from "../../flow/turnState";
import { DURATION, EASE_IN, EASE_OUT, SHAKE } from "../../motion";
import { CountUp } from "../CountUp";

type Props = { turn: TurnState; focus: StageState; liveTokens: number };

/**
 * The default view: one card for the stage in focus. When the focus moves on,
 * the old card fades out quickly, then the next one rises a little into place
 * with an ease-out curve (A2 + C2: fast start, soft stop). Only one card is on
 * screen at a time, so text never overlaps.
 */
export function StepCard({ turn, focus, liveTokens }: Props) {
  return (
    <div className="relative flex-1 overflow-hidden md:min-h-0">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${turn.turnId}-${focus.id}`}
          className="absolute inset-0 overflow-y-auto p-4"
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1, transition: { duration: DURATION.enter, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_IN } }}
        >
          <CardBody turn={turn} focus={focus} liveTokens={liveTokens} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const STATUS_LABEL = {
  pending: "等待中 · Waiting",
  active: "进行中 · Running",
  done: "完成 · Done",
  failed: "失败 · Failed",
} as const;

const STATUS_TONE = {
  pending: "text-muted",
  active: "text-accent",
  done: "text-ok",
  failed: "text-err",
} as const;

function CardBody({ turn, focus, liveTokens }: Props) {
  const copy = STAGES[focus.id];
  const index = turn.stages.findIndex((s) => s.id === focus.id);

  return (
    <article className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>{t("步骤")} {index + 1} / {turn.stages.length}</span>
        <span className={`${STATUS_TONE[focus.status]} tabular-nums`}>
          {t(STATUS_LABEL[focus.status])}
          {focus.ms != null && ` · ${formatMs(focus.ms)}`}
        </span>
      </div>

      {/* Where the finished step's label takes off for the full-route panel. */}
      <div data-card-badge className="self-start">
        <StageBadge stage={focus} large />
      </div>

      <StageExplanation stage={focus.id} />

      {focus.id === "generate" && focus.status === "active" && (
        <p className="text-sm text-accent tabular-nums">{liveTokens} {t("tokens received")}
        </p>
      )}

      <section className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">{t("本轮实际数据")}</h3>
        {focus.status === "active" ? <><p className="text-sm text-muted">{t("数据会在这一步完成后显示")}</p><Skeleton /></> : <StageDetails stage={focus} />}
      </section>

      {focus.status === "failed" && turn.errorCode && (
        // D5 摇头
        <motion.p className="rounded-xl border border-err/40 bg-err/10 p-3 text-sm text-err" {...SHAKE}>
          {t(ERRORS[turn.errorCode])}
        </motion.p>
      )}

      <p className="text-sm leading-relaxed text-muted">{t(copy.realWorld)}</p>

      {turn.status === "done" && index === turn.stages.length - 1 && focus.status === "done" && (
        <motion.p
          className="self-start rounded-full bg-ok/15 px-3 py-1 text-xs text-ok"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: DURATION.enter, ease: [0.34, 1.56, 0.64, 1] }}
        >{t("本轮完成 · Turn complete")}{turn.totalMs != null &&
            (turn.totalMs >= 1000 ? (
              <>
                {" · "}
                <CountUp value={turn.totalMs / 1000} decimals={2} suffix=" s" />
              </>
            ) : (
              ` · ${formatMs(turn.totalMs)}`
            ))}
        </motion.p>
      )}
    </article>
  );
}

/** G4 骨架屏: where the stage's result will appear, shimmering while it runs. */
function Skeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-3" aria-hidden="true">
      {[70, 45, 60].map((w, i) => (
        <span key={i} className="skeleton h-3 rounded" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}
