import { useState } from "react";
import { motion } from "motion/react";
import { EASE_OUT } from "../motion";

type Box = { x: number; y: number; w: number; h: number };

export type Flight = {
  id: string;
  text: string;
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
 * 2. a copy of the fact surfaces right there, coming into focus (A5 模糊对焦);
 * 3. it travels along an arc to the notebook (C4 慢快慢), shrinking a little;
 * 4. on arrival it is removed and the notebook entry pops in 60 ms later.
 */
export function FlyLayer({ flights, onArrive }: { flights: Flight[]; onArrive: (id: string) => void }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50" aria-hidden="true">
      {flights.map((f) => (
        <Flyer key={f.id} flight={f} onArrive={onArrive} />
      ))}
    </div>
  );
}

function Flyer({ flight, onArrive }: { flight: Flight; onArrive: (id: string) => void }) {
  const [phase, setPhase] = useState<"emerge" | "fly">("emerge");
  const { from, to, delay } = flight;
  const sx = from.x;
  const sy = from.y - 22;
  const tx = to.x;
  const ty = to.y;
  const midX = (sx + tx) / 2;
  const midY = Math.min(sy, ty) - 80;

  return (
    <>
      {flight.exact && (
        <motion.span
          className="fixed rounded-md bg-accent/25 ring-2 ring-accent/60"
          style={{ left: from.x - 3, top: from.y - 2, width: from.w + 6, height: from.h + 4 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.6, times: [0, 0.2, 0.75, 1], delay }}
        />
      )}
      <motion.div
        className="fixed left-0 top-0 whitespace-nowrap rounded-full border border-accent/50 bg-surface px-2.5 py-0.5 text-xs shadow-lg"
        initial={{ x: sx, y: sy + 14, opacity: 0, filter: "blur(8px)", scale: 0.92 }}
        animate={
          phase === "emerge"
            ? { x: sx, y: sy, opacity: 1, filter: "blur(0px)", scale: 1 }
            : { x: [sx, midX, tx], y: [sy, midY, ty], scale: [1, 0.97, 0.85], opacity: [1, 1, 0.85] }
        }
        transition={
          phase === "emerge"
            ? { duration: 0.6, ease: EASE_OUT, delay: delay + 0.15 }
            : { duration: 0.85, ease: [0.45, 0, 0.55, 1], delay: 0.25 }
        }
        onAnimationComplete={() => (phase === "emerge" ? setPhase("fly") : onArrive(flight.id))}
      >
        {flight.text}
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
