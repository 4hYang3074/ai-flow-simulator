import { useCallback, useEffect, useRef, useState } from "react";
import type { FlowLog } from "./useChat";
import { applyEvent, initialTurn, type FlowEvent, type TurnState } from "../flow/turnState";
import type { StageId } from "../flow/protocol";

export type Speed = 0.5 | 1 | 2;

export type PlaybackSettings = {
  speed: Speed;
  /** Pause after each finished stage until the viewer presses Next. */
  stepMode: boolean;
};

// Local stages often finish in under a millisecond; nobody can read that.
// The panel keeps each stage on screen at least this long (at 1x speed): as
// "running" after it starts, and as "done" with its result after it ends.
// The real durations are still what the panel prints.
const HOLD_ACTIVE_MS = 900;
const HOLD_DONE_MS = 1100;
// When the backend has already moved past the stage on screen, holds shrink
// so the panel catches up instead of drifting further behind the chat.
const CATCH_UP = 0.6;

/**
 * Replays a turn's events into the workflow panel at a readable pace.
 *
 * Events are applied in order. After a stage starts or ends, the next event
 * waits until the hold has passed; if the backend is slower than the hold
 * (the model generating), nothing extra is added. Only this panel is paced:
 * the chat shows tokens as they arrive.
 */
export function usePlayback(
  flow: FlowLog | null,
  settings: PlaybackSettings,
  /** Told about each event at the moment the panel shows it. */
  onShown?: (event: FlowEvent) => void,
) {
  const onShownRef = useRef(onShown);
  onShownRef.current = onShown;
  const [turn, setTurn] = useState<TurnState | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [applied, setApplied] = useState(0);

  const events = useRef(flow?.events ?? []);
  events.current = flow?.events ?? [];
  const cursor = useRef(0);
  const holdUntil = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const lastStage = useRef<string | undefined>(undefined);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const waitingRef = useRef(waiting);
  waitingRef.current = waiting;

  const pump = useCallback(() => {
    window.clearTimeout(timer.current);
    while (cursor.current < events.current.length) {
      if (waitingRef.current) return;
      const now = performance.now();
      if (now < holdUntil.current) {
        timer.current = window.setTimeout(pump, holdUntil.current - now);
        return;
      }
      const event = events.current[cursor.current++];
      setTurn((t) => (t ? applyEvent(t, event) : t));
      setApplied(cursor.current);
      onShownRef.current?.(event);

      const { speed, stepMode } = settingsRef.current;
      const ahead = events.current.slice(cursor.current).some((e) => e.type === "stage_start");
      const scale = (ahead ? CATCH_UP : 1) / speed;
      if (event.type === "route") lastStage.current = event.stages.at(-1);
      if (event.type === "stage_start") holdUntil.current = now + HOLD_ACTIVE_MS * scale;
      if (event.type === "stage_end") {
        holdUntil.current = now + HOLD_DONE_MS * scale;
        if (stepMode && event.status === "done" && event.stage !== lastStage.current) {
          waitingRef.current = true;
          setWaiting(true);
          return;
        }
      }
    }
  }, []);

  // A new turn starts the panel over, dropping whatever was still queued.
  useEffect(() => {
    window.clearTimeout(timer.current);
    cursor.current = 0;
    holdUntil.current = 0;
    lastStage.current = undefined;
    waitingRef.current = false;
    setWaiting(false);
    setApplied(0);
    setTurn(flow ? initialTurn(flow.turnId) : null);
  }, [flow?.turnId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    pump();
  }, [flow?.events.length, flow?.turnId, waiting, pump]);

  // Turning step mode off releases a paused panel.
  useEffect(() => {
    if (!settings.stepMode && waitingRef.current) {
      waitingRef.current = false;
      setWaiting(false);
    }
  }, [settings.stepMode]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const next = useCallback(() => {
    waitingRef.current = false;
    setWaiting(false);
  }, []);

  // Where the backend really is, unpaced, so the panel can say when it is
  // showing a replay that lags behind.
  const all = flow?.events ?? [];
  const lagging = applied < all.length;
  let actualStage: StageId | null = null;
  for (const e of all) if (e.type === "stage_start" || e.type === "stage_end") actualStage = e.stage;
  const actualFinished = all.some((e) => e.type === "final" || e.type === "error");

  return { turn, waiting, next, lagging, actualStage, actualFinished };
}
