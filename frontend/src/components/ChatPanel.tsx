import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { motion } from "motion/react";
import Markdown from "react-markdown";
import { Panel } from "./Panel";
import { MemoryDrawer } from "./MemoryDrawer";
import { MemoryNotebook } from "./MemoryNotebook";
import { DemoMenu } from "./DemoMenu";
import { DURATION, EASE_OUT, SHAKE } from "../motion";
import { ERRORS, ROUTES } from "../flow/stages";
import { MATERIAL_KIND } from "../flow/facts";
import type { ChatMessage } from "../hooks/useChat";
import type { MemoryView } from "../api/memory";
import type { Demo } from "../flow/demos";

type Props = {
  messages: ChatMessage[];
  sending: boolean;
  onSend: (text: string) => void;
  memory: MemoryView | null;
  /** False for facts still on their way to the notebook. */
  isFactShown: (id: string) => boolean;
  recalled: Map<string, number>;
  onClearMemory: () => Promise<boolean>;
  demo: { demo: Demo; index: number } | null;
  onStartDemo: (demo: Demo) => void;
  onStopDemo: () => void;
  canReplay: (messageId: string) => boolean;
  onReplay: (messageId: string) => void;
  onNewChat: () => void;
};

export function ChatPanel({
  messages,
  sending,
  onSend,
  memory,
  isFactShown,
  recalled,
  onClearMemory,
  demo,
  onStartDemo,
  onStopDemo,
  canReplay,
  onReplay,
  onNewChat,
}: Props) {
  const facts = (memory?.facts ?? []).filter((f) => isFactShown(f.id));
  const [draft, setDraft] = useState("");
  const [memoryOpen, setMemoryOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // Follow the reply as it streams, unless the reader scrolled up to look back.
  // Always jump down when history first loads or the reader sends a message.
  const shownCount = useRef(0);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const grew = messages.length > shownCount.current;
    const firstLoad = shownCount.current === 0;
    shownCount.current = messages.length;
    const justSent = grew && messages.at(-2)?.role === "user";
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (firstLoad || justSent || nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = () => {
    if (!draft.trim() || sending) return;
    onSend(draft);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter adds a line. Never send while an IME (Chinese
    // input) is still composing, or picking a character would send the message.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <Panel
      title="对话"
      subtitle="Chat"
      action={
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-2 disabled:opacity-40"
            onClick={onNewChat}
            disabled={sending}
            whileTap={{ scale: 0.94 }}
            title="开始新对话，旧对话仍保存在数据库里 · Start fresh; the old chat stays saved"
          >
            ＋ 新对话
          </motion.button>
          <DemoMenu running={demo} disabled={sending} onStart={onStartDemo} onStop={onStopDemo} />
          <motion.button
            type="button"
            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-surface-2"
            onClick={() => setMemoryOpen(true)}
            whileTap={{ scale: 0.94 }}
          >
            记忆 Memory
          </motion.button>
        </div>
      }
    >
      <MemoryDrawer
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        memory={memory}
        facts={facts}
        recalled={recalled}
        onClear={onClearMemory}
        busy={sending}
      />
      <MemoryNotebook facts={facts} onOpen={() => setMemoryOpen(true)} />
      <div ref={scroller} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 md:min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm">发一条消息，右边会显示 AI 处理它的每一步。</p>
            <p className="text-xs text-muted">Send a message to watch every step on the right.</p>
            <p className="mt-2 text-xs text-muted">不知道问什么？点右上角「示例 Demo」。· Not sure what to ask? Try a demo.</p>
          </div>
        ) : (
          messages.map((m) => (
            <Bubble
              key={m.id}
              message={m}
              onReplay={!sending && !demo && canReplay(m.id) ? () => onReplay(m.id) : undefined}
            />
          ))
        )}
      </div>
      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          className="max-h-40 min-h-[40px] min-w-0 flex-1 resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="输入消息 · Type a message"
          aria-label="消息 Message"
        />
        <motion.button
          type="submit"
          className="h-10 shrink-0 rounded-lg bg-accent px-4 text-sm font-medium text-white disabled:opacity-40"
          disabled={sending || !!demo || !draft.trim()}
          whileTap={{ scale: 0.92 }}
        >
          发送
        </motion.button>
      </form>
    </Panel>
  );
}

function Bubble({ message, onReplay }: { message: ChatMessage; onReplay?: () => void }) {
  const mine = message.role === "user";
  const waiting = message.status === "streaming" && !message.content;
  return (
    // A2 上浮淡入 for each new message.
    <motion.div
      data-chat-role={message.role}
      className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.enter, ease: EASE_OUT }}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
          mine ? "bg-accent text-white" : "border border-border bg-surface-2"
        }`}
      >
        {mine ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : waiting ? (
          <LoadingDots />
        ) : (
          <div className="md break-words">
            {/* Citations like [M1] show as small labels. */}
            <Markdown>{message.content.replace(/\[(M\d+)\]/g, " `$1`")}</Markdown>
            {message.status === "streaming" && <span className="stream-cursor" aria-hidden="true" />}
          </div>
        )}
      </div>
      {message.status === "error" && message.error && (
        // D5 摇头: the turn failed.
        <motion.p className="max-w-[85%] text-xs text-err" {...SHAKE}>
          {ERRORS[message.error]}
        </motion.p>
      )}
      {message.status === "done" && !mine && <ReplyBadges message={message} />}
      {message.status === "done" && (message.usage?.output_tokens != null || onReplay) && (
        <p className="text-[11px] text-muted">
          {[
            message.usage?.output_tokens != null && `${message.usage.output_tokens} tokens`,
            message.usage?.tokens_per_second != null && `${message.usage.tokens_per_second} tok/s`,
            message.totalMs != null && `${(message.totalMs / 1000).toFixed(1)}s`,
          ]
            .filter(Boolean)
            .join(" · ")}
          {onReplay && (
            <button type="button" onClick={onReplay} className="ml-2 text-accent hover:underline">
              ↺ 回放流程 Replay
            </button>
          )}
        </p>
      )}
    </motion.div>
  );
}

/**
 * What this answer was built from: the route it took and the labelled
 * materials the model was given. A4 弹出, one after another.
 */
function ReplyBadges({ message }: { message: ChatMessage }) {
  const badges: string[] = [];
  if (message.route && message.route !== "basic") badges.push(`路线 · ${ROUTES[message.route].zh}`);
  if (message.contextWindow === 5) badges.push("上下文 ×5 轮");
  for (const [kind, n] of Object.entries(message.materials ?? {})) {
    badges.push(`${MATERIAL_KIND[kind]?.split(" ")[0] ?? kind} ×${n}`);
  }
  if (!badges.length) return null;
  return (
    <div className="flex max-w-[85%] flex-wrap gap-1">
      {badges.map((b, i) => (
        <motion.span
          key={b}
          className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] text-accent"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1], delay: 0.15 + i * DURATION.stagger }}
        >
          {b}
        </motion.span>
      ))}
    </div>
  );
}

// G7 加载跳点: waiting for the model's first token.
function LoadingDots() {
  return (
    <span className="flex h-5 items-center gap-1" aria-label="正在生成 Generating">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-muted"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}
