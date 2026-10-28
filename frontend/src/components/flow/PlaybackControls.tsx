import { t } from "../../preferences";
import { motion } from "motion/react";
import type { PlaybackSettings, Speed } from "../../hooks/usePlayback";
import { EASE_OUT } from "../../motion";

type Props = {
  settings: PlaybackSettings;
  onChange: (s: PlaybackSettings) => void;
  hasSteps: boolean;
  canPrevious: boolean;
  canNext: boolean;
  nextHint: string;
  onPrevious: () => void;
  onNext: () => void;
};

const SPEEDS: Speed[] = [0.5, 1, 2];

export function PlaybackControls({ settings, onChange, hasSteps, canPrevious, canNext, nextHint, onPrevious, onNext }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-2.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-muted">{t("速度 Speed")}</span>
        <div className="relative flex rounded-md border border-border p-0.5" role="radiogroup" aria-label={t("速度 Speed")}>
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
        <span className="text-muted" aria-hidden="true">{t("单步 Step")}</span>
        {/* D7 开关滑动 */}
        <button
          type="button"
          role="switch"
          aria-label={t("单步 Step")}
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

      {hasSteps && (
        <nav className="grid w-full grid-cols-2 gap-2" aria-label={t("步骤浏览")}>
          <motion.button
            type="button"
            onClick={onPrevious}
            disabled={!canPrevious}
            className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-border bg-surface px-3 py-2 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-40 hover:enabled:bg-surface-2"
            whileTap={canPrevious ? { scale: 0.96 } : undefined}
          >
            <span>← {t("上一步")}</span>
            <span className="text-xs font-normal text-muted">{canPrevious ? t("回看前一个步骤") : t("已经是第一步")}</span>
          </motion.button>
          <motion.button
            type="button"
            onClick={onNext}
            disabled={!canNext}
            className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-accent px-3 py-2 text-base font-semibold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-40"
            whileTap={canNext ? { scale: 0.96 } : undefined}
          >
            <span>{t("下一步")} →</span>
            <span className="text-xs font-normal">{nextHint}</span>
          </motion.button>
        </nav>
      )}
    </div>
  );
}
