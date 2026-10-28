import { memoryField, memoryValue } from "../flow/memoryDisplay";
import { pick } from "../preferences";
import { useEffect } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { EASE_OUT } from "../motion";

type Box = { x: number; y: number; w: number; h: number };

const EXTRACT_DURATION = 0.14;
const FLIGHT_DURATION = 1;

export type Flight = {
  id: string;
  text: string;
  fact?: { field: string; value: string };
  /** Where the fact was said: the quoted words in the chat bubble. */
  from: Box;
  /** Whether `from` is the exact quote (highlighted) or just the bubble. */
  exact: boolean;
  /** Where it lands: the notebook. */
  to: Box;
  delay: number;
};

/**
 * Facts flying from the chat into the memory notebook:
 * 1. the quoted words light up in the bubble;
 * 2. tags surface beside the message with 60 ms staggered starts;
 * 3. each tag flies for one second as soon as its own extraction finishes;
 * 4. landing acknowledgements let the notebook reveal tags in order.
 */
export function FlyLayer({ flights, onArrive }: { flights: Flight[]; onArrive: (ids: string[]) => void }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50" aria-hidden="true">
      <AnimatePresence>
        {flights.map((flight) => <Flyer key={flight.id} flight={flight} onArrive={onArrive} />)}
      </AnimatePresence>
    </div>
  );
}

function Flyer({ flight, onArrive }: { flight: Flight; onArrive: (ids: string[]) => void }) {
  const { from, to, delay } = flight;
  const sx = Math.max(8, Math.min(from.x, window.innerWidth - to.w - 8));
  const sy = from.y - 12;
  const tx = to.x;
  const ty = to.y;
  const lift = Math.min(24, Math.hypot(tx - sx, ty - sy) * 0.06);
  const progress = useMotionValue(0);
  const x = useTransform(progress, (p) => sx + (tx - sx) * p);
  const y = useTransform(progress, (p) => sy + (ty - sy) * p - 4 * lift * p * (1 - p));

  // Animate one progress value along a continuous curve. Separate x/y waypoint
  // segments can brake at the midpoint; this keeps one fast-to-slow trajectory
  // and updates transforms without triggering React renders on every frame.
  useEffect(() => {
    const controls = animate(progress, 1, {
      delay: delay + EXTRACT_DURATION,
      duration: FLIGHT_DURATION,
      ease: EASE_OUT,
      onComplete: () => onArrive([flight.id]),
    });
    return () => controls.stop();
  }, [progress, flight, delay, onArrive]);

  return (
    <>
      {flight.exact && (
        <motion.span
          key={flight.id}
          className="fixed rounded-md bg-accent/25 ring-2 ring-accent/60"
          style={{ left: flight.from.x - 3, top: flight.from.y - 2, width: flight.from.w + 6, height: flight.from.h + 4 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 0.45, delay, times: [0, 0.2, 0.75, 1] }}
        />
      )}
      <motion.div
        className="fixed left-0 top-0 max-w-full truncate rounded-full border border-accent/50 bg-surface px-2.5 py-0.5 text-xs shadow-lg"
        style={{ maxWidth: to.w, x, y, willChange: "transform" }}
        initial={{ opacity: 0, filter: "blur(2px)", scale: 0.985, translateY: 4 }}
        animate={{ opacity: 1, filter: "blur(0px)", scale: 1, translateY: 0 }}
        transition={{ duration: EXTRACT_DURATION, delay, ease: EASE_OUT }}
        exit={{ opacity: 0, transition: { duration: 0.1, ease: EASE_OUT } }}
      >
        {flight.fact ? `${memoryField(flight.fact.field)}${pick("：", ": ")}${memoryValue(flight.fact.field, flight.fact.value)}` : flight.text}
      </motion.div>
    </>
  );
}

/** Viewport box of `text` inside `root`, or null if it is not there verbatim. */
export function textBox(root: Element, text: string): Box | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const at = node.textContent?.indexOf(text) ?? -1;
    if (at >= 0) {
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + text.length);
      const r = range.getClientRects()[0];
      if (r) return { x: r.left, y: r.top, w: r.width, h: r.height };
    }
  }
  return null;
}

export function elementBox(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}
