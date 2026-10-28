import { t, pick } from "../preferences";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DEMOS, type Demo } from "../flow/demos";
import { DURATION, EASE_IN } from "../motion";

type Props = {
  running: { demo: Demo; index: number } | null;
  disabled: boolean;
  onStart: (demo: Demo) => void;
  onStop: () => void;
};

/** Demo scripts: one click plays a whole conversation through the pipeline. */
export function DemoMenu({ running, disabled, onStart, onStop }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Close when clicking anywhere else.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  if (running) {
    return (
      <motion.button
        type="button"
        onClick={onStop}
        className="rounded-md bg-accent/15 px-2.5 py-1 text-xs text-accent"
        whileTap={{ scale: 0.94 }}
        title={t("停止示例 Stop demo")}
      >{pick("示例", "Demo")} {running.index + 1}/{running.demo.messages.length} · {pick("停止", "Stop")}
      </motion.button>
    );
  }

  return (
    <div ref={root} className="relative">
      <motion.button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-2 disabled:opacity-40"
        whileTap={{ scale: 0.94 }}
        aria-expanded={open}
      >{t("示例 Demo")}</motion.button>
      <AnimatePresence>
        {open && (
          // A4 弹出 from the button's corner.
          <motion.ul
            className="absolute right-0 top-full z-20 mt-2 flex w-72 max-w-[80vw] flex-col gap-1 rounded-xl border border-border bg-surface p-1.5 shadow-xl"
            style={{ transformOrigin: "top right" }}
            initial={{ opacity: 0, scale: 0.85, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.3, ease: [0.34, 1.56, 0.64, 1] } }}
            exit={{ opacity: 0, scale: 0.92, transition: { duration: DURATION.exit, ease: EASE_IN } }}
          >
            {DEMOS.map((demo) => (
              <li key={demo.id}>
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2 text-left hover:bg-surface-2"
                  onClick={() => {
                    setOpen(false);
                    onStart(demo);
                  }}
                >
                  <p className="text-sm">
                    {t(demo.zh)}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{t(demo.explain)}</p>
                  <p className="mt-1 text-[11px] text-muted">{demo.messages.length} {pick("条消息", "messages")}</p>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
