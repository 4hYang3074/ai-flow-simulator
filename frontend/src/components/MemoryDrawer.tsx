import { memoryField, memoryValue } from "../flow/memoryDisplay";
import { t, pick } from "../preferences";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { MemoryFact, MemoryView } from "../api/memory";
import { POP_IN } from "./MemoryNotebook";
import { DURATION, EASE_IN, EASE_OUT } from "../motion";

type Props = {
  open: boolean;
  onClose: () => void;
  memory: MemoryView | null;
  /** Long-term facts to show (those still flying are left out). */
  facts: MemoryFact[];
  /** Scores from the latest recall, by user message id, to highlight hits. */
  recalled: Map<string, number>;
  onClear: () => Promise<boolean>;
  busy: boolean;
};

/**
 * Everything the conversation remembers, as the backend has it: which pairs
 * are replayed word for word (recent) and which can only come back through
 * similarity search (searchable). Slides in over the chat (A3).
 */
export function MemoryDrawer({ open, onClose, memory, facts, recalled, onClear, busy }: Props) {
  const [confirming, setConfirming] = useState(false);

  // A second click within a few seconds confirms; otherwise it lapses.
  useEffect(() => {
    if (!confirming) return;
    const t = window.setTimeout(() => setConfirming(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirming]);

  const pairs = memory?.pairs ?? [];

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          className="absolute inset-0 z-10 flex flex-col bg-surface"
          initial={{ x: "100%" }}
          animate={{ x: 0, transition: { duration: DURATION.enter, ease: EASE_OUT } }}
          exit={{ x: "100%", transition: { duration: DURATION.exit, ease: EASE_IN } }}
          aria-label={t("记忆 Memory")}
        >
          <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
            <h3 className="text-sm font-semibold">{t("记忆")}<span className="font-normal text-muted">Memory · epoch {memory?.epoch ?? 0}</span>
            </h3>
            <button type="button" className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2" onClick={onClose}>{t("关闭 Close")}</button>
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:min-h-0">
            <h4 className="mb-1 text-xs font-semibold">{t("长期记忆 Long-term facts")}</h4>
            <p className="mb-3 text-xs leading-relaxed text-muted">{t("模型从你的话里提取、并能对上原文引用的事实。每一轮都会带给模型。· Extracted facts, each backed by an exact quote, given to the model every turn.")}</p>
            <ol data-memory-target className="mb-6 flex min-h-6 flex-col gap-1.5">
              {facts.length === 0 && <li className="text-xs text-muted">{t("还没有。· None yet.")}</li>}
              <AnimatePresence initial={false}>
                {[...facts].reverse().map((f) => (
                  <motion.li
                    key={f.id}
                    layout
                    className="rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-xs"
                    {...POP_IN}
                  >
                    <p>
                      <span className="text-muted">{memoryField(f.field)}{pick("：", ": ")}</span>
                      {memoryValue(f.field, f.value)}
                      {f.revision > 1 && <span className="text-muted">{pick(` · 第 ${f.revision} 版`, ` · revision ${f.revision}`)}</span>}
                    </p>
                    <p className="mt-0.5 truncate text-muted">「{f.quote}」</p>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>

            <h4 className="mb-1 text-xs font-semibold">{t("对话记录 Conversation pairs")}</h4>
            <p className="mb-4 text-xs leading-relaxed text-muted">{pick(`最近 ${memory?.recent_limit ?? 3} 组问答会原样放进 prompt。更早的通过相似度检索找回，阈值为 ${memory?.threshold ?? "—"}。`, `The latest ${memory?.recent_limit ?? 3} pairs are replayed as-is. Older pairs are retrieved by similarity at threshold ${memory?.threshold ?? "—"}.`)}
            </p>
            {pairs.length === 0 ? (
              <p className="text-sm text-muted">{t("还没有记忆。· Nothing remembered yet.")}</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {[...pairs].reverse().map((p, i) => {
                  const score = recalled.get(p.user_message_id);
                  return (
                    // B1 依次出现
                    <motion.li
                      key={p.user_message_id}
                      className={`rounded-xl border p-3 text-xs ${score != null ? "border-accent bg-accent/5" : "border-border"}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: DURATION.enter, ease: EASE_OUT, delay: i * DURATION.stagger }}
                    >
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 ${p.in_recent ? "bg-ok/15 text-ok" : "bg-surface-2 text-muted"}`}
                        >
                          {p.in_recent ? t("短期 Recent") : t("可检索 Searchable")}
                        </span>
                        {!p.embedded && <span className="rounded bg-warn/15 px-1.5 py-0.5 text-warn">{t("未建索引")}</span>}
                        {score != null && (
                          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">{t("本轮召回 ·")}{score.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <p className="truncate">
                        <span className="text-muted">Q </span>
                        {p.question}
                      </p>
                      <p className="truncate text-muted">
                        <span>A </span>
                        {p.answer}
                      </p>
                    </motion.li>
                  );
                })}
              </ol>
            )}
          </div>

          <footer className="border-t border-border p-3">
            <motion.button
              type="button"
              disabled={busy || (pairs.length === 0 && facts.length === 0)}
              onClick={async () => {
                if (!confirming) return setConfirming(true);
                setConfirming(false);
                await onClear();
              }}
              className={`w-full rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-40 ${
                confirming ? "bg-err text-white" : "border border-err/50 text-err"
              }`}
              whileTap={{ scale: 0.97 }}
            >
              {confirming ? t("再点一次确认清空 · Click again to confirm") : t("清空记忆 · Clear memory")}
            </motion.button>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">{t("清空会开始新的 history epoch：旧记录仍在数据库文件里，但之后不会再被读取。· Clearing starts a new epoch; old rows stay in the file but are never read again.")}</p>
          </footer>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
