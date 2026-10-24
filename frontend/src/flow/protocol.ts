// Mirrors backend/app/events.py. Change both together.

export const STREAM_PROTOCOL = "flow-sim-stream-v1";

export const STAGE_IDS = [
  "receive",
  "redact",
  "route",
  "quick_reply",
  "correction",
  "reference",
  "memory_recall",
  "context",
  "evidence",
  "generate",
  "validate",
  "persist",
  "memorize",
] as const;
export type StageId = (typeof STAGE_IDS)[number];

export type RouteId = "pending" | "quick" | "basic" | "reference" | "correction" | "clarify";

export type ErrorCode = "invalid_message" | "busy" | "llm_unavailable" | "empty_reply" | "internal";

export type Usage = {
  prompt_tokens: number | null;
  output_tokens: number | null;
  tokens_per_second: number | null;
};

type Stamp = { protocol: string; turn_id: string; seq: number };

export type StreamEvent = Stamp &
  (
    | { type: "route"; route: RouteId; stages: StageId[] }
    | { type: "stage_start"; stage: StageId }
    | { type: "stage_end"; stage: StageId; status: "done" | "failed"; ms: number; summary: Record<string, unknown> }
    | { type: "token"; text: string }
    | { type: "final"; reply: string; message_id: string; total_ms: number; usage: Usage }
    | { type: "error"; stage: StageId | null; code: ErrorCode }
  );

const STAGES: ReadonlySet<string> = new Set(STAGE_IDS);
const TYPES: ReadonlySet<string> = new Set(["route", "stage_start", "stage_end", "token", "final", "error"]);

/**
 * One event, or null when it is not one of ours for this turn. Rejecting
 * rather than repairing, as production stream parsers do: an event from
 * another protocol or another turn must not leak into the turn on screen.
 */
export function parseStreamEvent(data: string, turnId: string): StreamEvent | null {
  let raw: any;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  if (raw.protocol !== STREAM_PROTOCOL || raw.turn_id !== turnId) return null;
  if (!Number.isInteger(raw.seq) || raw.seq < 1 || !TYPES.has(raw.type)) return null;
  if ((raw.type === "stage_start" || raw.type === "stage_end") && !STAGES.has(raw.stage)) return null;
  return raw as StreamEvent;
}

/** Ids accepted by the backend: `^[A-Za-z0-9_-]{8,64}$`. */
export function newId(): string {
  return crypto.randomUUID();
}
