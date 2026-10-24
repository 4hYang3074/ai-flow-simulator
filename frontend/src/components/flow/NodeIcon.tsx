import { motion } from "motion/react";
import type { StageStatus } from "../../flow/turnState";
import { EASE_OUT } from "../../motion";

const FILL: Record<StageStatus, string> = {
  pending: "bg-surface border-2 border-border",
  active: "bg-accent",
  done: "bg-ok",
  failed: "bg-err",
};

/** The light on each stage: ring, pulsing, ticked or crossed. */
export function NodeIcon({ status }: { status: StageStatus }) {
  return (
    <span className="relative flex size-5 shrink-0 items-center justify-center">
      {status === "active" && (
        // D6 脉冲: rings spreading out from the stage running now.
        <motion.span
          className="absolute inset-0 rounded-full bg-accent"
          initial={{ scale: 1, opacity: 0.45 }}
          animate={{ scale: 2.2, opacity: 0 }}
          transition={{ duration: 1.3, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <motion.span
        className={`relative flex size-5 items-center justify-center rounded-full ${FILL[status]}`}
        animate={{ scale: status === "active" ? 1.08 : 1 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
      >
        {(status === "done" || status === "failed") && (
          <svg viewBox="0 0 20 20" className="size-3.5 text-white" fill="none" aria-hidden="true">
            {/* G5 描线: the tick or cross is drawn in, as if by a pen. */}
            <motion.path
              d={status === "done" ? "M5 10.5l3.2 3L15 6.5" : "M6.5 6.5l7 7M13.5 6.5l-7 7"}
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
            />
          </svg>
        )}
      </motion.span>
    </span>
  );
}
