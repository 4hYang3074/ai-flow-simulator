import { STAGES } from "../../flow/stages";
import type { StageId } from "../../flow/protocol";
import { t } from "../../preferences";

/** Shared teaching copy, deliberately separate from the live stage inspector. */
export function StageExplanation({ stage, compact = false }: { stage: StageId; compact?: boolean }) {
  const copy = STAGES[stage];
  return (
    <div className="flex flex-col gap-4">
      <p className={`rounded-xl border-l-4 border-accent bg-accent/5 p-4 font-medium leading-relaxed ${compact ? "text-sm" : "text-base"}`}>
        {t(copy.explain)}
      </p>
      <section className="flex flex-col gap-1.5">
        <h3 className="text-sm font-semibold text-accent">{t("为什么需要这一步")}</h3>
        <p className="text-sm leading-relaxed">{t(copy.why)}</p>
      </section>
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-4">
        <h3 className="text-sm font-semibold">{t("教学示例（不是本轮实际结果）")}</h3>
        <dl className="flex flex-col gap-3 text-sm leading-relaxed">
          <div>
            <dt className="mb-1 text-sm font-medium text-muted">{t("假设你发送")}</dt>
            <dd className="whitespace-pre-wrap break-words">{t(copy.example.input)}</dd>
          </div>
          <div>
            <dt className="mb-1 text-sm font-medium text-muted">{t("系统会怎样处理")}</dt>
            <dd className="whitespace-pre-wrap break-words">{t(copy.example.result)}</dd>
          </div>
        </dl>
      </section>
      <aside className="border-l-2 border-warn/50 pl-3 text-sm leading-relaxed">
        <p className="mb-1 font-semibold text-warn">{t("记住这一点")}</p>
        <p>{t(copy.note)}</p>
      </aside>
    </div>
  );
}
