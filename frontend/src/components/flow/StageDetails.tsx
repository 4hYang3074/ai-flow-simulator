import { t, pick } from "../../preferences";
import { motion } from "motion/react";
import {
  checkAttempts,
  MATERIAL_KIND,
  MEMORIZE_NOTES,
  RECALL_NOTES,
  REJECT_REASONS,
  manifest,
  promptLines,
  recallCandidates,
  rejectedFacts,
  savedFacts,
  stageFacts,
} from "../../flow/facts";
import { PromptView } from "./PromptView";
import { CountUp } from "../CountUp";
import type { StageState } from "../../flow/turnState";
import { DURATION, EASE_OUT } from "../../motion";

/**
 * A stage's result, shown once it has one: the key numbers, plus the parts
 * that teach the most when seen directly (the similarity scores of memory
 * recall, the message list the model reads).
 */
export function StageDetails({ stage }: { stage: StageState }) {
  const facts = stageFacts(stage.id, stage.summary);
  const prompt = stage.id === "context" ? promptLines(stage.summary) : [];
  const candidates = stage.id === "memory_recall" ? recallCandidates(stage.summary) : [];
  const note = stage.id === "memory_recall" ? (stage.summary?.note as string | null | undefined) : null;
  const threshold = typeof stage.summary?.threshold === "number" ? stage.summary.threshold : null;
  const materials = stage.id === "evidence" ? manifest(stage.summary) : [];
  const attempts = stage.id === "context_check" ? checkAttempts(stage.summary) : [];
  const saved = stage.id === "memorize" ? savedFacts(stage.summary) : [];
  const rejected = stage.id === "memorize" ? rejectedFacts(stage.summary) : [];
  const memorizeNote = stage.id === "memorize" ? (stage.summary?.note as string | null | undefined) : null;

  if (!facts.length) return null;
  return (
    // A2 上浮淡入: the stage's result appears once it has one.
    <motion.div
      className="flex flex-col gap-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.enter, ease: EASE_OUT }}
    >
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-xl border border-border bg-surface-2 p-3 text-sm sm:grid-cols-2">
        {facts.map((f) => (
          <div key={f.label} className="flex min-w-0 flex-col">
            <dt className="text-xs text-muted">{t(f.label)}</dt>
            <dd className="truncate tabular-nums">{f.value}</dd>
          </div>
        ))}
      </dl>

      {note && RECALL_NOTES[note] && <p className="text-xs leading-relaxed text-muted">{t(RECALL_NOTES[note])}</p>}

      {candidates.length > 0 && threshold != null && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">{pick(`相似度检索（≥ ${threshold} 才会带回）`, `Similarity search (kept at or above ${threshold})`)}
          </p>
          <ol className="flex flex-col gap-2">
            {candidates.map((c, i) => (
              <li key={c.user_message_id} className="flex flex-col gap-1 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={c.picked ? "text-ok" : "text-muted"}>{c.picked ? t("✓ 带回") : t("✗ 不用")}</span>
                  <span className="min-w-0 flex-1 truncate">{c.question}</span>
                  <span className="text-muted">
                    <CountUp value={c.score} decimals={2} duration={0.6} />
                  </span>
                </div>
                <div className="relative h-1.5 overflow-hidden rounded-full bg-border">
                  <motion.span
                    className={`absolute inset-y-0 left-0 rounded-full ${c.picked ? "bg-ok" : "bg-muted"}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0, Math.min(1, c.score)) * 100}%` }}
                    transition={{ duration: 0.6, ease: EASE_OUT, delay: i * DURATION.stagger }}
                  />
                  <span className="absolute inset-y-0 w-0.5 bg-text/60" style={{ left: `${threshold * 100}%` }} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {attempts.length > 0 && (
        <ol className="flex flex-col gap-2">
          {attempts.map((a, i) => (
            <li
              key={i}
              className={`rounded-lg border px-3 py-2 text-xs ${a.sufficient ? "border-ok/40 bg-ok/5" : "border-border"}`}
            >
              <p>
                {a.sufficient ? "✓" : "✗"} {pick(`用最近 ${a.pairs} 轮判断：`, `Last ${a.pairs} turns: `)}{a.sufficient ? t("够了") : t("不够")}
                {a.invalid && t("（模型输出格式错误，按不够处理）")}
              </p>
              {a.references.length === 0 && !a.invalid && (
                <p className="mt-0.5 text-muted">{t("这句话没有指向前文的词 · nothing points back")}</p>
              )}
              {a.references.map((r, j) => (
                <p key={j} className="mt-0.5 text-muted">
                  「{r.phrase || "—"}」→ {r.quote ? `「${r.quote}」` : t("（模型没找到）")} {r.found ? t("✓ 前文里有") : t("✗ 前文里对不上")}
                </p>
              ))}
            </li>
          ))}
        </ol>
      )}

      {memorizeNote && MEMORIZE_NOTES[memorizeNote] && (
        <p className="text-xs leading-relaxed text-muted">{t(MEMORIZE_NOTES[memorizeNote])}</p>
      )}

      {(saved.length > 0 || rejected.length > 0) && (
        <ol className="flex flex-col gap-1.5">
          {saved.map((f) => (
            <li key={f.id} className="rounded-lg border border-ok/40 bg-ok/5 px-3 py-2 text-xs">
              <p>
                <span className="text-ok">✓ {f.field}</span>：{f.value}
                {f.revision > 1 && <span className="text-muted">{pick(` · 第 ${f.revision} 版`, ` · revision ${f.revision}`)}</span>}
              </p>
              <p className="mt-0.5 text-muted">{t("原文引用 Quote：「")}{f.quote}」</p>
            </li>
          ))}
          {rejected.map((r, i) => (
            <li key={`r${i}`} className="rounded-lg border border-border px-3 py-2 text-xs text-muted">
              <p>
                ✗ {r.field || "—"}：{r.value || "—"} · {t(REJECT_REASONS[r.reason] ?? r.reason)}
              </p>
              {r.quote && <p className="mt-0.5">{t("模型给的引用：「")}{r.quote}」</p>}
            </li>
          ))}
        </ol>
      )}

      {stage.id === "evidence" && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted">{t("这次给模型的编号材料 · Labelled materials in this prompt")}</p>
          {materials.length === 0 ? (
            <p className="text-xs text-muted">{t("没有：这一轮只靠最近的对话和新问题。· None this turn.")}</p>
          ) : (
            <ol className="flex flex-col gap-1">
              {materials.map((m) => (
                <li key={m.label} className="flex min-w-0 items-start gap-2 text-xs">
                  <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 font-mono text-accent">{m.label}</span>
                  <span className="shrink-0 text-muted">{MATERIAL_KIND[m.kind] ?? m.kind}</span>
                  <span className="min-w-0 truncate text-muted">{m.preview}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {prompt.length > 0 && <PromptView lines={prompt} />}
    </motion.div>
  );
}

