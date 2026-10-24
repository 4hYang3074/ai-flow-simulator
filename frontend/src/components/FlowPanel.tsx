import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Panel } from "./Panel";
import { StepCard } from "./flow/StepCard";
import { RouteTimeline } from "./flow/RouteTimeline";
import { PlaybackControls } from "./flow/PlaybackControls";
import { StageFlightLayer, useStageFlights } from "./flow/StageFlights";
import { ERRORS, STAGES } from "../flow/stages";
import { focusStage, type FlowEvent } from "../flow/turnState";
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
  const [settings, setSettings] = useState<PlaybackSettings>({ speed: 1, stepMode: false });
  const flights = useStageFlights(flow?.turnId);
  const shown = useCallback(
    (event: FlowEvent) => {
      flights.onEvent(event);
      onShown?.(event);
    },
    [flights, onShown],
  );
  const { turn, waiting, next, lagging, actualStage, actualFinished } = usePlayback(flow, settings, shown);
  const focus = turn ? focusStage(turn) : undefined;

  const replayBadge = (
    <AnimatePresence>
      {flow?.replay && (
        <motion.span
          className="rounded-full bg-warn/15 px-2 py-0.5 text-xs text-warn"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: DURATION.exit }}
        >
          ↺ 回放 Replay
        </motion.span>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <Panel title="当前步骤" subtitle="Current step" action={replayBadge}>
        {!turn ? (
          <Idle />
        ) : !turn.stages.length ? (
          turn.status === "failed" && turn.errorCode ? (
            <p className="m-4 rounded-xl border border-err/40 bg-err/10 p-3 text-sm text-err">{ERRORS[turn.errorCode]}</p>
          ) : (
            <Idle label="开始处理… · Starting…" />
          )
        ) : (
          <>
            <AnimatePresence initial={false}>
              {lagging && (
                // Honest about pacing: the panel is a slowed replay, and this
                // says where the backend really is.
                <motion.p
                  className="mx-4 mt-3 rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-muted"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: DURATION.exit, ease: EASE_OUT }}
                >
                  放慢回放中，实际
                  {actualFinished ? "已经完成" : `已到「${actualStage ? STAGES[actualStage].zh : "…"}」`} · Slowed
                  replay — {actualFinished ? "already finished" : `actually at ${actualStage ? STAGES[actualStage].en : "…"}`}
                </motion.p>
              )}
            </AnimatePresence>
            {focus && <StepCard turn={turn} focus={focus} liveTokens={flow?.tokens ?? 0} />}
          </>
        )}
        <PlaybackControls settings={settings} onChange={setSettings} waiting={waiting} onNext={next} />
      </Panel>

      <Panel title="完整流程" subtitle="Full route" className="md:col-span-2 xl:col-span-1">
        {turn && turn.stages.length ? (
          <RouteTimeline turn={turn} focus={focus} landed={flights.landed} />
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-muted">
            每一步完成后会飘到这里的正确位置 · Finished steps land here
          </div>
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
            <p className="text-sm">等待第一条消息</p>
            <p className="text-xs text-muted">Waiting for the first message</p>
          </>
        )}
      </div>
    </div>
  );
}
