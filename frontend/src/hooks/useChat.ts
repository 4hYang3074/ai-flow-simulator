import { useCallback, useRef, useState } from "react";
import { streamChatTurn } from "../api/chat";
import { newId, type ErrorCode, type RouteId, type Usage } from "../flow/protocol";
import type { FlowEvent } from "../flow/turnState";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "streaming" | "done" | "error";
  error?: ErrorCode | "network";
  usage?: Usage;
  totalMs?: number;
  /** The route the turn took, and how many labelled materials of each kind
   * the model was given, for the badges under the reply. */
  route?: RouteId;
  materials?: Record<string, number>;
  /** Recent exchanges replayed word for word: 3, or 5 when 3 were not enough. */
  contextWindow?: number;
};

/** Labelled materials per kind, from the evidence stage's manifest. */
function materialCounts(events: FlowEvent[]): Record<string, number> {
  const end = events.find((e) => e.type === "stage_end" && e.stage === "evidence");
  const manifest = end?.type === "stage_end" && Array.isArray(end.summary.manifest) ? end.summary.manifest : [];
  const counts: Record<string, number> = {};
  for (const m of manifest) if (m && typeof m.kind === "string") counts[m.kind] = (counts[m.kind] ?? 0) + 1;
  return counts;
}

/** How many recent exchanges the context check settled on. */
function contextWindow(events: FlowEvent[]): number | undefined {
  const end = events.find((e) => e.type === "stage_end" && e.stage === "context_check");
  const w = end?.type === "stage_end" ? end.summary.window : undefined;
  return typeof w === "number" ? w : undefined;
}

/**
 * Everything the backend reported for the latest turn, in arrival order. The
 * workflow panel replays it at a readable pace; the chat never waits for that.
 */
export type FlowLog = {
  turnId: string;
  events: FlowEvent[];
  /** Tokens received so far, counted live (not paced). */
  tokens: number;
  /** True when this is a past turn being shown again. */
  replay?: boolean;
};

export function useChat(conversationId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [flow, setFlow] = useState<FlowLog | null>(null);
  const [sending, setSending] = useState(false);
  // Read by `send`, so a demo's timer never acts on a stale "not sending".
  const sendingRef = useRef(false);
  // Each answered turn's events, by reply message id, for replay.
  const logs = useRef(new Map<string, FlowLog>());
  const replays = useRef(0);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);

      const turnId = newId();
      const replyId = newId();
      const patchReply = (patch: (m: ChatMessage) => Partial<ChatMessage>) =>
        setMessages((all) => all.map((m) => (m.id === replyId ? { ...m, ...patch(m) } : m)));
      const patchFlow = (patch: (f: FlowLog) => FlowLog) =>
        setFlow((f) => (f && f.turnId === turnId ? patch(f) : f));

      setMessages((all) => [
        ...all,
        { id: newId(), role: "user", content: message, status: "done" },
        { id: replyId, role: "assistant", content: "", status: "streaming" },
      ]);
      setFlow({ turnId, events: [], tokens: 0 });

      let ended = false;
      const seen: FlowEvent[] = [];
      const outcome = await streamChatTurn(
        { conversation_id: conversationId, turn_id: turnId, message },
        (event) => {
          if (event.type === "token") {
            // Shown the moment it arrives: this is the model's real output speed.
            patchReply((m) => ({ content: m.content + event.text }));
            patchFlow((f) => ({ ...f, tokens: f.tokens + 1 }));
            return;
          }
          seen.push(event);
          patchFlow((f) => ({ ...f, events: [...f.events, event] }));
          if (event.type === "final") {
            ended = true;
            const route = [...seen].reverse().find((e) => e.type === "route");
            // The final reply is authoritative; the tokens were a live preview.
            patchReply(() => ({
              content: event.reply,
              status: "done",
              usage: event.usage,
              totalMs: event.total_ms,
              route: route?.type === "route" ? route.route : undefined,
              materials: materialCounts(seen),
              contextWindow: contextWindow(seen),
            }));
          } else if (event.type === "error") {
            ended = true;
            patchReply(() => ({ status: "error", error: event.code }));
          }
        },
      );
      if (!ended) {
        patchReply(() => ({ status: "error", error: outcome.kind === "http_error" ? "internal" : "network" }));
        // Close the workflow too, so it does not wait forever for an end.
        patchFlow((f) => ({
          ...f,
          events: [...f.events, { protocol: "", turn_id: turnId, seq: 0, type: "error", stage: null, code: "network" }],
        }));
      }
      setFlow((f) => {
        if (f && f.turnId === turnId) logs.current.set(replyId, f);
        return f;
      });
      sendingRef.current = false;
      setSending(false);
    },
    [conversationId],
  );

  /** Show a past turn's workflow again, from the start. */
  const replay = useCallback((messageId: string) => {
    const log = logs.current.get(messageId);
    if (!log || sendingRef.current) return;
    replays.current += 1;
    setFlow({ ...log, turnId: `${log.turnId}-replay-${replays.current}`, replay: true });
  }, []);

  const canReplay = useCallback((messageId: string) => logs.current.has(messageId), []);

  /** Show earlier pairs (from memory) as chat history after a reload. */
  const seed = useCallback((pairs: { question: string; answer: string }[]) => {
    setMessages((current) =>
      current.length
        ? current
        : pairs.flatMap((p) => [
            { id: newId(), role: "user" as const, content: p.question, status: "done" as const },
            { id: newId(), role: "assistant" as const, content: p.answer, status: "done" as const },
          ]),
    );
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setFlow(null);
    logs.current.clear();
  }, []);

  return { messages, flow, sending, send, seed, reset, replay, canReplay };
}
