import { AppearanceControls, useLanguageSwitch, t } from "./preferences";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { FlowPanel } from "./components/FlowPanel";
import { FlyLayer } from "./components/FlyLayer";
import { StatusPill } from "./components/StatusPill";
import { recallCandidates } from "./flow/facts";
import type { FlowEvent } from "./flow/turnState";
import { useChat, type FlowLog } from "./hooks/useChat";
import { useConversationId } from "./hooks/useConversationId";
import { useDemo } from "./hooks/useDemo";
import { useHealth } from "./hooks/useHealth";
import { useMemory } from "./hooks/useMemory";
import { useMemoryFlights } from "./hooks/useMemoryFlights";

/** Scores of the pairs the latest turn's recall brought back. */
function recalledScores(flow: FlowLog | null): Map<string, number> {
  const end = flow?.events.find((e) => e.type === "stage_end" && e.stage === "memory_recall");
  const summary = end && end.type === "stage_end" ? end.summary : undefined;
  return new Map(recallCandidates(summary).filter((c) => c.picked).map((c) => [c.user_message_id, c.score]));
}

export default function App() {
  const { language } = useLanguageSwitch();
  const health = useHealth();
  const { id, startNew } = useConversationId();
  return (
    <div className="flex h-full flex-col">
      <header className="flex min-h-16 flex-wrap shrink-0 items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-base font-semibold">{t("AI 流程模拟器")}</h1>

        </div>
        <div className="flex max-w-full flex-wrap items-center justify-end gap-2 py-2">
          <a
            href={`${import.meta.env.BASE_URL}ai-service-explained${language === "en" ? ".en" : ""}.html`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3 text-sm font-medium hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            title={t("教程报告（在新标签页打开）")}
            aria-label={t("教程报告（在新标签页打开）")}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 5v15M3 4c3-1 6-1 9 1 3-2 6-2 9-1v15c-3-1-6-1-9 1-3-2-6-2-9-1Z" /></svg>
            <span>{t("教程报告")}</span>
            <span className="text-xs text-muted" aria-hidden="true">↗</span>
          </a>
          <StatusPill state={health} />
          <AppearanceControls />
        </div>
      </header>
      {/* Keyed by the conversation: a new chat starts every panel, memory
          view, replay and demo from scratch. */}
      <Conversation key={id} conversationId={id} onNewChat={startNew} />
    </div>
  );
}

function Conversation({ conversationId, onNewChat }: { conversationId: string; onNewChat: () => void }) {
  const { messages, flow, sending, send, seed, reset, replay, canReplay } = useChat(conversationId);
  const { memory, loaded, reload, clear } = useMemory(conversationId);
  const { facts: notebookFacts, flights, busy: memoryAnimating, onFlowEvent, onArrive } = useMemoryFlights(memory, loaded, flow?.turnId);

  // After a reload, show what the conversation already holds.
  const seeded = useRef(false);
  useEffect(() => {
    if (!loaded || seeded.current) return;
    seeded.current = true;
    if (memory?.pairs.length) seed(memory.pairs);
  }, [loaded, memory, seed]);

  // Each finished turn changes what is remembered.
  const wasSending = useRef(false);
  useEffect(() => {
    if (wasSending.current && !sending) reload();
    wasSending.current = sending;
  }, [sending, reload]);

  const recalled = useMemo(() => recalledScores(flow), [flow]);

  const clearAll = useCallback(async () => {
    const ok = await clear();
    if (ok) reset();
    return ok;
  }, [clear, reset]);

  const demo = useDemo(send, clearAll, memoryAnimating);

  // The workflow panel reports each event as it shows it: new facts start
  // flying, and a running demo moves on once a turn has been shown.
  const onShown = useCallback(
    (event: FlowEvent) => {
      onFlowEvent(event);
      if (!flow?.replay) demo.onFlowEvent(event);
    },
    [onFlowEvent, demo, flow?.replay],
  );

  return (
    <>
      {/* Three panels: chat, the current step, the full route. */}
      <main className="grid flex-1 grid-cols-1 gap-4 px-4 pb-4 md:min-h-0 md:grid-cols-2 md:grid-rows-[minmax(0,3fr)_minmax(0,2fr)] md:px-6 md:pb-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] xl:grid-rows-1">
        <ChatPanel
          messages={messages}
          sending={sending || memoryAnimating}
          onSend={send}
          memory={memory}
          notebookFacts={notebookFacts}
          recalled={recalled}
          onClearMemory={clearAll}
          demo={demo.running}
          onStartDemo={demo.start}
          onStopDemo={demo.stop}
          canReplay={canReplay}
          onReplay={replay}
          onNewChat={() => {
            demo.stop();
            onNewChat();
          }}
        />
        <FlowPanel flow={flow} onShown={onShown} />
      </main>
      <FlyLayer flights={flights} onArrive={onArrive} />
    </>
  );
}
