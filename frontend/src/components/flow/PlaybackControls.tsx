import { AnimatePresence, motion } from "motion/react";
import type { PlaybackSettings, Speed } from "../../hooks/usePlayback";
import { DURATION, EASE_IN, EASE_OUT } from "../../motion";

type Props = {
  settings: PlaybackSettings;
  onChange: (s: PlaybackSettings) => void;
  waiting: boolean;
  onNext: () => void;
};

const SPEEDS: Speed[] = [0.5, 1, 2];

export function PlaybackControls({ settings, onChange, waiting, onNext }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-2.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-muted">速度 Speed</span>
        <div className="relative flex rounded-md border border-border p-0.5" role="radiogroup" aria-label="速度 Speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={settings.speed === s}
              className="relative px-2 py-0.5 tabular-nums"
              onClick={() => onChange({ ...settings, speed: s })}
            >
              {settings.speed === s && (
                // C4 慢快慢: the highlight glides between options.
                <motion.span
                  layoutId="speed-highlight"
                  className="absolute inset-0 rounded bg-surface-2"
                  transition={{ duration: 0.3, ease: [0.45, 0, 0.55, 1] }}
                />
              )}
              <span className={`relative ${settings.speed === s ? "" : "text-muted"}`}>{s}×</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-muted" aria-hidden="true">单步 Step</span>
        {/* D7 开关滑动 */}
        <button
          type="button"
          role="switch"
          aria-label="单步 Step"
          aria-checked={settings.stepMode}
          onClick={() => onChange({ ...settings, stepMode: !settings.stepMode })}
          className={`relative h-5 w-9 rounded-full transition-colors ${settings.stepMode ? "bg-accent" : "bg-border"}`}
        >
          <motion.span
            className="absolute top-0.5 size-4 rounded-full bg-white shadow"
            animate={{ left: settings.stepMode ? 18 : 2 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
          />
        </button>
      </div>

      <AnimatePresence>
        {waiting && (
          <motion.button
            type="button"
            onClick={onNext}
            className="ml-auto rounded-md bg-accent px-3 py-1 font-medium text-white"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: DURATION.enter, ease: [0.34, 1.56, 0.64, 1] } }}
            exit={{ opacity: 0, scale: 0.85, transition: { duration: DURATION.exit, ease: EASE_IN } }}
            whileTap={{ scale: 0.92 }}
          >
            下一步 Next →
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
