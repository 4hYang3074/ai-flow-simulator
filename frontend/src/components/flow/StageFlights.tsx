import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { StageId } from "../../flow/protocol";
import { STAGES } from "../../flow/stages";
import type { FlowEvent } from "../../flow/turnState";
import { EASE_OUT } from "../../motion";

type Box = { x: number; y: number };

type Flight = { key: string; stage: StageId; ok: boolean; from: Box; to: Box };

// Let the finished card be read for a moment before its label leaves.
const LEAVE_AFTER_MS = 300;
const FLY_S = 0.7;

function visibleBox(selector: string): Box | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const onScreen = r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
  return onScreen ? { x: r.left, y: r.top } : null;
}

/**
 * When a stage finishes on the current-step card, a small label of it flies
 * to that stage's row in the full-route panel; the row is ticked only when
 * the label lands. Without motion (or with the row off screen) it lands at once.
 */
export function useStageFlights(turnId: string | undefined) {
  const reduced = useReducedMotion();
  const [landed, setLanded] = useState<Set<StageId>>(new Set());
  const [flights, setFlights] = useState<Flight[]>([]);
  const timers = useRef<number[]>([]);

  const land = useCallback((stage: StageId) => setLanded((s) => new Set(s).add(stage)), []);

  // A new turn (or replay) starts with nothing landed.
  useEffect(() => {
    setLanded(new Set());
    setFlights([]);
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  }, [turnId]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const onEvent = useCallback(
    (event: FlowEvent) => {
      if (event.type === "final" || event.type === "error") {
        // Whatever is still in the air lands with the end of the turn.
        timers.current.push(
          window.setTimeout(() => setLanded((s) => new Set([...s, ...STAGE_LIST])), (FLY_S + 0.5) * 1000),
        );
        return;
      }
      if (event.type !== "stage_end") return;
      const stage = event.stage;
      const ok = event.status === "done";
      if (reduced) return land(stage);
      timers.current.push(
        window.setTimeout(() => {
          const from = visibleBox("[data-card-badge]");
          const to = visibleBox(`[data-stage-row="${stage}"]`);
          if (!from || !to) return land(stage);
          setFlights((f) => [...f, { key: `${stage}-${Date.now()}`, stage, ok, from, to }]);
        }, LEAVE_AFTER_MS),
      );
    },
    [reduced, land],
  );

  const arrive = useCallback(
    (key: string, stage: StageId) => {
      setFlights((f) => f.filter((x) => x.key !== key));
      land(stage);
    },
    [land],
  );

  return { landed, flights, onEvent, arrive };
}

const STAGE_LIST = Object.keys(STAGES) as StageId[];

export function StageFlightLayer({
  flights,
  onArrive,
}: {
  flights: Flight[];
  onArrive: (key: string, stage: StageId) => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-40" aria-hidden="true">
      {flights.map((f) => (
        <motion.div
          key={f.key}
          className={`fixed left-0 top-0 flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-surface px-2.5 py-0.5 text-xs shadow-lg ${
            f.ok ? "border-ok/50 text-ok" : "border-err/50 text-err"
          }`}
          initial={{ x: f.from.x, y: f.from.y, opacity: 0, scale: 0.9 }}
          animate={{ x: f.to.x, y: f.to.y, opacity: [0, 1, 1, 0.9], scale: [0.9, 1, 1, 0.95] }}
          transition={{ duration: FLY_S, ease: EASE_OUT, times: [0, 0.15, 0.85, 1] }}
          onAnimationComplete={() => onArrive(f.key, f.stage)}
        >
          {f.ok ? "✓" : "✗"} {STAGES[f.stage].zh}
        </motion.div>
      ))}
    </div>
  );
}
