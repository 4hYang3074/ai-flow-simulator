import type { MemoryFact, MemoryView } from "../api/memory";
import type { FlowEvent } from "./turnState";

export type NotebookState = {
  initialized: boolean;
  epoch: number | null;
  turnId: string | null;
  /** Oldest first; the notebook renders newest at the front. */
  facts: MemoryFact[];
  queue: MemoryFact[];
  arrived: string[];
};

export const initialNotebook: NotebookState = {
  initialized: false, epoch: null, turnId: null, facts: [], queue: [], arrived: [],
};

type Action =
  | { type: "sync"; memory: MemoryView; turnId: string | null }
  | { type: "shown"; event: FlowEvent; animate: boolean }
  | { type: "arrive"; id: string }
  | { type: "reveal" }
  | { type: "reduce-motion" };

const fieldKey = (field: string) => field.trim().toLowerCase().replace(/\s+/g, " ");

function insert(facts: MemoryFact[], next: MemoryFact): MemoryFact[] {
  return [...facts.filter((fact) => fact.id !== next.id && fieldKey(fact.field) !== fieldKey(next.field)), next];
}

function revealQueued(state: NotebookState): NotebookState {
  return { ...state, facts: state.queue.reduce(insert, state.facts), queue: [], arrived: [] };
}

export function notebookReady(state: NotebookState): boolean {
  return state.queue.length > 0 && state.arrived.includes(state.queue[0].id);
}

/** A server refresh cannot reveal this turn's facts before the teaching event. */
export function notebookReducer(state: NotebookState, action: Action): NotebookState {
  if (action.type === "sync") {
    const { memory, turnId } = action;
    // Load history on initial load, clear, or leaving/replaying a turn.
    // A replay restores existing facts; it does not write or reinsert them.
    if (!state.initialized) {
      const known = new Set([...state.facts, ...state.queue].map((fact) => fact.id));
      return {
        ...state, initialized: true, epoch: memory.epoch, turnId,
        facts: [...memory.facts.filter((fact) => !known.has(fact.id)), ...state.facts],
      };
    }
    if (state.epoch !== memory.epoch) {
      return { initialized: true, epoch: memory.epoch, turnId, facts: memory.facts, queue: [], arrived: [] };
    }
    if (state.turnId !== null && state.turnId !== turnId) {
      // Keep confirmed local facts if the last server refresh is still delayed.
      let facts = state.queue.reduce(insert, state.facts);
      for (const fact of memory.facts) {
        const current = facts.find((item) => fieldKey(item.field) === fieldKey(fact.field));
        if (!current || (current.id !== fact.id && current.revision <= fact.revision)) facts = insert(facts, fact);
      }
      return { ...state, turnId, facts, queue: [], arrived: [] };
    }
    return state.turnId === turnId ? state : { ...state, turnId };
  }
  if (action.type === "shown") {
    const { event } = action;
    if (event.type !== "stage_end" || event.stage !== "memorize" || event.status !== "done") return state;
    const raw = Array.isArray(event.summary.saved) ? event.summary.saved : [];
    const known = new Set([...state.facts, ...state.queue].map((fact) => fact.id));
    const added: MemoryFact[] = [];
    for (const fact of raw) {
      if (!fact || typeof fact.id !== "string" || typeof fact.field !== "string" ||
          typeof fact.value !== "string" || typeof fact.quote !== "string" || typeof fact.revision !== "number" || known.has(fact.id)) continue;
      known.add(fact.id);
      added.push(fact);
    }
    if (!added.length) return state;
    const queued = { ...state, queue: [...state.queue, ...added] };
    return action.animate ? queued : revealQueued(queued);
  }
  if (action.type === "reduce-motion") return state.queue.length ? revealQueued(state) : state;
  if (action.type === "arrive") {
    if (!state.queue.some((fact) => fact.id === action.id) || state.arrived.includes(action.id)) return state;
    return { ...state, arrived: [...state.arrived, action.id] };
  }
  // A landed head can reveal immediately, without waiting for later flights.
  // Out-of-order callbacks still cannot reorder notebook entries.
  if (!notebookReady(state)) return state;
  return {
    ...state, facts: insert(state.facts, state.queue[0]), queue: state.queue.slice(1),
    arrived: state.arrived.filter((id) => id !== state.queue[0].id),
  };
}
