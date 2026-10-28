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
  useLanguageSwitch();
  const health = useHealth();
  const { id, startNew } = useConversationId();
  return (
    <div className="flex h-full flex-col">
      <header className="flex min-h-16 flex-wrap shrink-0 items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-base font-semibold">{t("AI 流程模拟器")}</h1>

        </div>
        <div className="flex items-center gap-2"><StatusPill state={health} /><AppearanceControls /></div>
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
  const { isShown, flights, onFlowEvent, onArrive } = useMemoryFlights(memory, loaded);

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

  const demo = useDemo(send, clearAll);

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
          sending={sending}
          onSend={send}
          memory={memory}
          isFactShown={isShown}
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
