import { useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Panel } from "./Panel";
import { StepCard } from "./flow/StepCard";
import { RouteTimeline } from "./flow/RouteTimeline";
import { PlaybackControls } from "./flow/PlaybackControls";
import { ERRORS, STAGES } from "../flow/stages";
import { focusStage, type FlowEvent } from "../flow/turnState";
import { usePlayback, type PlaybackSettings } from "../hooks/usePlayback";
import type { FlowLog } from "../hooks/useChat";
import { DURATION, EASE_IN, EASE_OUT } from "../motion";

const GHOST_STEPS = 4;

type View = "current" | "details";

type Props = { flow: FlowLog | null; onShown?: (event: FlowEvent) => void };

export function FlowPanel({ flow, onShown }: Props) {
  const [view, setView] = useState<View>("current");
  const [settings, setSettings] = useState<PlaybackSettings>({ speed: 1, stepMode: false });
  const { turn, waiting, next, lagging, actualStage, actualFinished } = usePlayback(flow, settings, onShown);
  const focus = turn ? focusStage(turn) : undefined;

  return (
    <Panel
      title="处理流程"
      subtitle="Workflow"
      action={
        <div className="flex items-center gap-2">
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
          <motion.button
            type="button"
            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-muted"
            disabled={!turn?.stages.length}
            onClick={() => setView(view === "current" ? "details" : "current")}
            whileTap={{ scale: 0.94 }}
          >
            {view === "current" ? "详细 Details" : "当前 Current"}
          </motion.button>
        </div>
      }
    >
      {!turn ? (
        <Idle />
      ) : !turn.stages.length ? (
        turn.status === "failed" && turn.errorCode ? (
          <p className="m-4 rounded-xl border border-err/40 bg-err/10 p-3 text-sm text-err">{ERRORS[turn.errorCode]}</p>
        ) : (
          <Idle label="开始处理… · Starting…" />
        )
      ) : (
        // One LayoutGroup around both views, so the badge of the stage in
        // focus can travel between the card and its timeline row.
        <LayoutGroup>
          <AnimatePresence initial={false}>
            {lagging && (
              // Honest about pacing: the panel is a slowed replay, and this
              // says where the backend really is.
              <motion.p
                className="mx-4 mt-3 overflow-hidden rounded-lg bg-surface-2 px-3 text-xs text-muted"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1, paddingTop: 6, paddingBottom: 6 }}
                exit={{ height: 0, opacity: 0, paddingTop: 0, paddingBottom: 0 }}
                transition={{ duration: DURATION.exit, ease: EASE_OUT }}
              >
                放慢回放中，实际
                {actualFinished
                  ? "已经完成"
                  : `已到「${actualStage ? STAGES[actualStage].zh : "…"}」`}{" "}
                · Slowed replay —{" "}
                {actualFinished ? "already finished" : `actually at ${actualStage ? STAGES[actualStage].en : "…"}`}
              </motion.p>
            )}
          </AnimatePresence>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={view}
              className="flex flex-1 flex-col md:min-h-0"
              // The old view is gone almost at once and the new one fades in
              // just after, so the two layers of text never read on top of
              // each other while the shared badge travels.
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: DURATION.enter, ease: EASE_OUT, delay: 0.1 } }}
              exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_IN } }}
            >
              {view === "current" && focus ? (
                <StepCard turn={turn} focus={focus} liveTokens={flow?.tokens ?? 0} />
              ) : (
                <RouteTimeline turn={turn} focus={focus} />
              )}
            </motion.div>
          </AnimatePresence>
        </LayoutGroup>
      )}
      <PlaybackControls settings={settings} onChange={setSettings} waiting={waiting} onNext={next} />
    </Panel>
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
