import { t } from "../../preferences";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { PromptLine } from "../../flow/facts";
import { DURATION, EASE_OUT } from "../../motion";

const SOURCE_TONE: Record<string, { chip: string; edge: string }> = {
  system: { chip: "bg-warn/15 text-warn", edge: "border-warn/60" },
  materials: { chip: "bg-accent/15 text-accent", edge: "border-accent/60" },
  recent: { chip: "bg-ok/15 text-ok", edge: "border-ok/60" },
  current: { chip: "bg-text/10 text-text", edge: "border-text/50" },
};

const SOURCE_LABEL: Record<string, string> = {
  system: "system",
  materials: "编号材料",
  recent: "最近",
  current: "新问题",
};

/**
 * The message list the model reads, one line per message, coloured by where
 * it came from. "Show full prompt" opens every message in full (G1): this is
 * exactly what was sent to the model, nothing more.
 */
export function PromptView({ lines }: { lines: PromptLine[] }) {
  const [full, setFull] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{t("模型这次读到的消息 · What the model reads")}</p>
        <button type="button" className="shrink-0 text-xs text-accent hover:underline" onClick={() => setFull(!full)}>
          {full ? t("收起 Collapse") : t("完整 Prompt · Full")}
        </button>
      </div>
      <ol className="flex flex-col gap-1">
        {lines.map((line, i) => {
          const tone = SOURCE_TONE[line.source] ?? SOURCE_TONE.recent;
          return (
            <li key={i} className={`flex min-w-0 flex-col gap-1 text-xs ${full ? `border-l-2 pl-2 ${tone.edge}` : ""}`}>
              <div className="flex min-w-0 items-start gap-2">
                <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono ${tone.chip}`}>
                  {t(SOURCE_LABEL[line.source] ?? line.role)}
                  {line.source === "recent" && ` · ${line.role}`}
                </span>
                {!full && <span className="min-w-0 truncate pt-0.5 text-muted">{line.preview}</span>}
              </div>
              <AnimatePresence initial={false}>
                {full && (
                  <motion.pre
                    className="overflow-hidden whitespace-pre-wrap break-words font-sans leading-relaxed text-muted"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: DURATION.enter, ease: EASE_OUT }}
                  >
                    {line.content}
                  </motion.pre>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
