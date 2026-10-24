import { createSseParser } from "../flow/sse";
import { parseStreamEvent, type StreamEvent } from "../flow/protocol";

export type ChatTurnRequest = {
  conversation_id: string;
  turn_id: string;
  message: string;
};

export type StreamOutcome =
  | { kind: "ended" }
  | { kind: "http_error"; status: number }
  | { kind: "interrupted" };

/**
 * One streamed turn: POST the message, read the SSE body as it arrives and
 * hand each checked event to `onEvent` the moment it is parsed. Nothing is
 * buffered or re-timed here; a token reaches the page when the model makes it.
 */
export async function streamChatTurn(
  body: ChatTurnRequest,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<StreamOutcome> {
  let res: Response;
  try {
    res = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    return { kind: "interrupted" };
  }
  if (!res.ok || !res.body) return { kind: "http_error", status: res.status };

  const parser = createSseParser((data) => {
    const event = parseStreamEvent(data, body.turn_id);
    if (event) onEvent(event);
  });
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.push(value);
    }
    parser.end();
    return { kind: "ended" };
  } catch {
    return { kind: "interrupted" };
  }
}
