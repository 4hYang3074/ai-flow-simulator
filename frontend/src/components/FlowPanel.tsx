import { t } from "../preferences";
import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Panel } from "./Panel";
import { StepCard } from "./flow/StepCard";
import { RouteTimeline } from "./flow/RouteTimeline";
import { PlaybackControls } from "./flow/PlaybackControls";
import { StageFlightLayer, useStageFlights } from "./flow/StageFlights";
import { ERRORS } from "../flow/stages";
import { stageNavigation, type ViewedStage, type FlowEvent } from "../flow/turnState";
import { usePlayback, type PlaybackSettings } from "../hooks/usePlayback";
import type { FlowLog } from "../hooks/useChat";
import { DURATION, EASE_OUT } from "../motion";

const GHOST_STEPS = 4;

type Props = { flow: FlowLog | null; onShown?: (event: FlowEvent) => void };

/**
 * Two panels driven by one replay: the current step in the middle, the full
 * route on the right. Each finished step flies from the card to its row.
 */
export function FlowPanel({ flow, onShown }: Props) {
  const [settings, setSettings] = useState<PlaybackSettings>({ speed: 1, stepMode: true });
  const [viewed, setViewed] = useState<ViewedStage | null>(null);
  const flights = useStageFlights(flow?.turnId);
  const shown = useCallback(
    (event: FlowEvent) => {
      flights.onEvent(event);
      onShown?.(event);
    },
    [flights, onShown],
  );
  const { turn, waiting, next, lagging, actualFinished } = usePlayback(flow, settings, shown);
  const navigation = stageNavigation(turn, viewed);
  const { focus, isReviewing } = navigation;
  const canNext = !!navigation.next || (waiting && !isReviewing);
  const onPrevious = () => {
    if (!turn || !navigation.previous) return;
    setSettings((current) => ({ ...current, stepMode: true }));
    setViewed({ turnId: turn.turnId, stageId: navigation.previous.id });
  };
  const onNext = () => {
    if (!turn) return;
    if (navigation.next) {
      setViewed({ turnId: turn.turnId, stageId: navigation.next.id });
    } else if (waiting && !isReviewing) {
      setViewed(null);
      next();
    }
  };
  const nextHint = navigation.next ? t("查看已经展示过的下一步")
    : waiting ? t("点击后继续下一步")
    : turn?.status === "done" || turn?.status === "failed" ? t("已经到最后一步")
    : t("等待当前步骤完成");

  const replayBadge = (
    <AnimatePresence>
      {flow?.replay && (
        <motion.span
          className="rounded-full bg-warn/15 px-2 py-0.5 text-xs text-warn"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: DURATION.exit }}
        >{t("↺ 回放 Replay")}</motion.span>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <Panel title={t("当前步骤")} subtitle="Current step" action={replayBadge}>
        {!turn ? (
          <Idle />
        ) : !turn.stages.length ? (
          turn.status === "failed" && turn.errorCode ? (
            <p className="m-4 rounded-xl border border-err/40 bg-err/10 p-3 text-sm text-err">{t(ERRORS[turn.errorCode])}</p>
          ) : (
            <Idle label={t("开始处理… · Starting…")} />
          )
        ) : (
          <>
            <AnimatePresence initial={false}>
              {(lagging || isReviewing) && (
                // Honest about pacing: the panel is a slowed replay, and this
                // says where the backend really is.
                <motion.p
                  className="mx-4 mt-3 rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-muted"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: DURATION.exit, ease: EASE_OUT }}
                >{isReviewing ? t("正在回看已展示的步骤，不会重新执行")
                  : !settings.stepMode ? t("正在自动回放，可以点上一步停下来回看")
                  : actualFinished ? t("后端已完成，可以用上一步和下一步查看流程")
                  : t("正在按步骤展示，完成后可点下一步")}
                </motion.p>
              )}
            </AnimatePresence>
            {focus && <StepCard turn={turn} focus={focus} liveTokens={flow?.tokens ?? 0} />}
          </>
        )}
        <PlaybackControls
          settings={settings}
          onChange={(value) => { setSettings(value); if (!value.stepMode) setViewed(null); }}
          hasSteps={!!focus}
          canPrevious={!!navigation.previous}
          canNext={canNext}
          nextHint={nextHint}
          onPrevious={onPrevious}
          onNext={onNext}
        />
      </Panel>

      <Panel title={t("完整流程")} subtitle="Full route" className="md:col-span-2 xl:col-span-1">
        {turn && turn.stages.length ? (
          <RouteTimeline turn={turn} focus={focus} landed={flights.landed} />
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-muted">{t("每一步完成后会飘到这里的正确位置 · Finished steps land here")}</div>
        )}
      </Panel>

      <StageFlightLayer flights={flights.flights} onArrive={flights.arrive} />
    </>
  );
}

function Idle({ label }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <ol className="flex flex-col items-center" aria-hidden="true">
        {Array.from({ length: GHOST_STEPS }, (_, i) => (
          // B1 依次出现: the idle rail fades up one node at a time.
          <motion.li
            key={i}
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.enter, ease: EASE_OUT, delay: i * DURATION.stagger }}
          >
            <span className="size-3 rounded-full border-2 border-border" />
            {i < GHOST_STEPS - 1 && <span className="h-7 w-px border-l-2 border-dashed border-border" />}
          </motion.li>
        ))}
      </ol>
      <div className="text-center">
        {label ? (
          <p className="text-sm">{label}</p>
        ) : (
          <>
            <p className="text-sm">{t("等待第一条消息")}</p>
          </>
        )}
      </div>
    </div>
  );
}
