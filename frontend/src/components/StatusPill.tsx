import { t, pick } from "../preferences";
import { AnimatePresence, motion } from "motion/react";
import type { HealthState } from "../hooks/useHealth";
import { DURATION, EASE_IN, EASE_OUT } from "../motion";

type Tone = "muted" | "ok" | "warn" | "err";

// `short` is what fits next to the title on a phone.
type View = { key: string; tone: Tone; label: string; short: string; hint: string };

function viewFor(state: HealthState): View {
  if (state.kind === "checking") {
    return {
      key: "checking",
      tone: "muted",
      label: "检查中 · Checking",
      short: "检查中",
      hint: "正在连接后端 Connecting to the backend",
    };
  }
  if (state.kind === "backend_offline") {
    return {
      key: "backend",
      tone: "err",
      label: "后端未启动 · Backend offline",
      short: "后端未启动",
      hint: "在项目根目录运行 npm run dev · Run npm run dev in the project folder",
    };
  }
  const { report } = state;
  if (report.problem === "ollama_unreachable") {
    return {
      key: "ollama",
      tone: "err",
      label: "Ollama 未启动 · Not running",
      short: "Ollama 未启动",
      hint: `打开 Ollama 应用，或运行 ollama serve · Start Ollama (${report.ollama_host})`,
    };
  }
  const missing = report.models.filter((m) => !m.available).map((m) => m.name);
  if (missing.length) {
    return {
      key: "missing",
      tone: "warn",
      label: pick(`缺少模型 ${missing.join(", ")}`, `Missing ${missing.join(", ")}`),
      short: "缺少模型",
      hint: pick(`运行 npm run setup，或 ollama pull ${missing[0]}`, `Run npm run setup or ollama pull ${missing[0]}`),
    };
  }
  const chat = report.models.find((m) => m.role === "chat")?.name ?? "model";
  return {
    key: "ready",
    tone: "ok",
    label: pick(`${chat} 已就绪`, `${chat} ready`),
    short: "模型已就绪",
    hint: pick(`${chat} 可以使用`, `${chat} is ready`),
  };
}

const DOT: Record<Tone, string> = {
  muted: "bg-muted",
  ok: "bg-ok",
  warn: "bg-warn",
  err: "bg-err",
};

export function StatusPill({ state }: { state: HealthState }) {
  const view = viewFor(state);
  return (
    <div
      className="relative flex h-8 min-w-0 shrink-0 items-center overflow-hidden rounded-full border border-border bg-surface px-3 text-xs"
      title={t(view.hint)}
      role="status"
      aria-live="polite"
    >
      {/* A2 上浮淡入 for the new state, A9 quick fade-out for the old one. */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={view.key + view.label}
          className="flex min-w-0 items-center gap-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: { duration: DURATION.enter, ease: EASE_OUT } }}
          exit={{ opacity: 0, y: -6, transition: { duration: DURATION.exit, ease: EASE_IN } }}
        >
          <span className="relative flex size-2 shrink-0">
            {view.tone === "ok" && (
              // D6 脉冲: a soft ring that says "live".
              <motion.span
                className={`absolute inset-0 rounded-full ${DOT[view.tone]}`}
                animate={{ scale: [1, 2.4], opacity: [0.5, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
              />
            )}
            <span className={`relative size-2 rounded-full ${DOT[view.tone]}`} />
          </span>
          <span className="truncate sm:hidden">{t(view.short)}</span>
          <span className="hidden truncate sm:inline">{t(view.label)}</span>
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
