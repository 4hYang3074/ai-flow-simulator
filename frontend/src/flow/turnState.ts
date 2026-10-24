import type { ErrorCode, RouteId, StageId, StreamEvent } from "./protocol";

/** Added by the page when the connection drops before the turn ended. */
type ConnectionLost = { protocol: string; turn_id: string; seq: number; type: "error"; stage: null; code: "network" };

/** The events that move the workflow panel. Tokens go to the chat only. */
export type FlowEvent = Exclude<StreamEvent, { type: "token" }> | ConnectionLost;

export type StageStatus = "pending" | "active" | "done" | "failed";

export type StageState = {
  id: StageId;
  status: StageStatus;
  ms?: number;
  summary?: Record<string, unknown>;
};

export type TurnState = {
  turnId: string;
  route: RouteId | null;
  stages: StageState[];
  status: "running" | "done" | "failed";
  totalMs?: number;
  errorCode?: ErrorCode | "network";
};

export function initialTurn(turnId: string): TurnState {
  return { turnId, route: null, stages: [], status: "running" };
}

export function applyEvent(turn: TurnState, event: FlowEvent): TurnState {
  switch (event.type) {
    case "route":
      // A route can change mid-turn ("pending" to "basic", "reference" to
      // "clarify"); stages already shown keep their state.
      return {
        ...turn,
        route: event.route,
        stages: event.stages.map((id) => turn.stages.find((s) => s.id === id) ?? { id, status: "pending" }),
      };
    case "stage_start":
      return { ...turn, stages: turn.stages.map((s) => (s.id === event.stage ? { ...s, status: "active" } : s)) };
    case "stage_end":
      return {
        ...turn,
        stages: turn.stages.map((s) =>
          s.id === event.stage ? { ...s, status: event.status, ms: event.ms, summary: event.summary } : s,
        ),
      };
    case "final":
      return { ...turn, status: "done", totalMs: event.total_ms };
    case "error":
      return { ...turn, status: "failed", errorCode: event.code };
  }
}

/** The stage to explain: the one running, else the last one that finished. */
export function focusStage(turn: TurnState): StageState | undefined {
  return (
    turn.stages.find((s) => s.status === "active") ??
    [...turn.stages].reverse().find((s) => s.status !== "pending")
  );
}
