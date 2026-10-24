import { AnimatePresence, motion } from "motion/react";
import type { MemoryFact } from "../api/memory";

const SHOWN = 6;

/** A4 弹出 with a little overshoot; the 60 ms delay lets the flying copy land first. */
export const POP_IN = {
  initial: { opacity: 0, scale: 0.6, y: 6 },
  animate: { opacity: 1, scale: 1, y: 0 },
  transition: { duration: 0.45, ease: [0.34, 1.56, 0.64, 1] as const, delay: 0.06 },
};

type Props = { facts: MemoryFact[]; onOpen: () => void };

/**
 * The long-term memory notebook, always in view at the top of the chat. New
 * facts fly here from the chat (see FlyLayer) and pop in once they land.
 * `data-memory-target` marks where flying facts aim.
 */
export function MemoryNotebook({ facts, onOpen }: Props) {
  const newest = [...facts].reverse();
  const shown = newest.slice(0, SHOWN);
  const more = newest.length - shown.length;

  return (
    <div className="flex items-start gap-2 border-b border-border px-4 py-2.5">
      <button type="button" onClick={onOpen} className="mt-0.5 shrink-0 text-xs text-muted hover:text-text">
        📒 记忆本
      </button>
      <div data-memory-target className="flex min-h-6 min-w-0 flex-1 flex-wrap gap-1.5">
        {facts.length === 0 && (
          <span className="py-0.5 text-xs text-muted">
            你说过的重要事情会记在这里 · Facts you share land here
          </span>
        )}
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((f) => (
            <motion.button
              key={f.id}
              type="button"
              layout
              onClick={onOpen}
              title={`原文引用：「${f.quote}」`}
              className="max-w-full truncate rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs"
              {...POP_IN}
              exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
            >
              <span className="text-muted">{f.field}：</span>
              {f.value}
            </motion.button>
          ))}
          {more > 0 && (
            <motion.button
              key="more"
              layout
              type="button"
              onClick={onOpen}
              className="rounded-full px-2 py-0.5 text-xs text-muted hover:bg-surface-2"
            >
              +{more}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
