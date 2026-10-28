import { strict as assert } from "node:assert";
import { test } from "node:test";
import { initialNotebook, notebookReady, notebookReducer } from "../src/flow/notebook.ts";
import type { MemoryFact, MemoryView } from "../src/api/memory.ts";
import type { FlowEvent } from "../src/flow/turnState.ts";

const old: MemoryFact = { id: "old", field: "Favorite color", value: "blue", quote: "I like blue", revision: 1 };
const facts: MemoryFact[] = [
  { id: "name", field: "Name", value: "Amin", quote: "My name is Amin", revision: 1 },
  { id: "cat", field: "Cat name", value: "Snowball", quote: "My cat is called Snowball", revision: 1 },
  { id: "age", field: "Cat age", value: "3 years old", quote: "she is three years old", revision: 1 },
];
const view = (items: MemoryFact[], epoch = 0): MemoryView => ({
  conversation_id: "chat", epoch, facts: items, pairs: [], recent_limit: 3, threshold: 0.45, embed_model: "test",
});
const ready = () => notebookReducer(initialNotebook, { type: "sync", memory: view([old]), turnId: "turn" });
const shown = (stage: "evidence" | "persist" | "memorize" = "memorize", saved = facts): FlowEvent => ({
  protocol: "test", turn_id: "turn", seq: 1, type: "stage_end", stage, status: "done", ms: 1, summary: { saved },
});
const newest = (state: ReturnType<typeof ready>) => [...state.facts].reverse().map((fact) => fact.id);

test("server completion and refreshes cannot reveal new tags at Evidence or Persist", () => {
  let state = ready();
  for (let i = 0; i < 20; i++) state = notebookReducer(state, { type: "sync", memory: view([old, ...facts]), turnId: "turn" });
  for (const stage of ["evidence", "persist"] as const) state = notebookReducer(state, { type: "shown", event: shown(stage), animate: true });
  assert.deepEqual(state.facts, [old]);
  assert.deepEqual(state.queue, []);
});

test("memorize completion queues three facts without revealing them", () => {
  const state = notebookReducer(ready(), { type: "shown", event: shown(), animate: true });
  assert.deepEqual(state.facts, [old]);
  assert.deepEqual(state.queue, facts);
});

test("the first extracted tag can reveal before later landings without reordering entries", () => {
  let state = notebookReducer(ready(), { type: "shown", event: shown(), animate: true });
  state = notebookReducer(state, { type: "arrive", id: "age" });
  assert.equal(notebookReady(state), false);
  assert.equal(notebookReducer(state, { type: "reveal" }), state);
  state = notebookReducer(state, { type: "arrive", id: "name" });
  assert.deepEqual(newest(state), ["old"]);
  assert.equal(notebookReady(state), true);
  state = notebookReducer(state, { type: "reveal" });
  assert.deepEqual(newest(state), ["name", "old"]);
  assert.deepEqual(state.queue.map((fact) => fact.id), ["cat", "age"]);
  assert.equal(notebookReady(state), false);
  assert.equal(notebookReducer(state, { type: "reveal" }), state);
  state = notebookReducer(state, { type: "arrive", id: "cat" });
  state = notebookReducer(state, { type: "reveal" });
  assert.deepEqual(newest(state), ["cat", "name", "old"]);
  state = notebookReducer(state, { type: "reveal" });
  assert.deepEqual(newest(state), ["age", "cat", "name", "old"]);
  assert.equal(state.queue.length, 0);
});

test("failed, started and unrelated events cannot enqueue a notebook update", () => {
  const state = ready();
  const failed = { ...shown(), status: "failed" } as FlowEvent;
  const started: FlowEvent = { protocol: "test", turn_id: "turn", seq: 2, type: "stage_start", stage: "memorize" };
  for (const event of [failed, started, shown("evidence"), shown("persist")]) {
    assert.equal(notebookReducer(state, { type: "shown", event, animate: true }), state);
  }
});

test("reduced motion still waits for displayed memorize completion and preserves order", () => {
  const state = ready();
  assert.equal(notebookReducer(state, { type: "shown", event: shown("evidence"), animate: false }), state);
  const complete = notebookReducer(state, { type: "shown", event: shown(), animate: false });
  assert.deepEqual(newest(complete), ["age", "cat", "name", "old"]);
  assert.equal(complete.queue.length, 0);
  const queued = notebookReducer(state, { type: "shown", event: shown(), animate: true });
  assert.deepEqual(notebookReducer(queued, { type: "reduce-motion" }).facts, complete.facts);
});

test("a corrected fact keeps its previous visible value until the new tag lands", () => {
  const replacement = { ...old, id: "new-color", field: " favorite   COLOR ", value: "green", revision: 2 };
  let state = notebookReducer(ready(), { type: "sync", memory: view([replacement]), turnId: "turn" });
  assert.deepEqual(state.facts, [old]);
  state = notebookReducer(state, { type: "shown", event: shown("memorize", [replacement]), animate: true });
  assert.deepEqual(state.facts, [old]);
  state = notebookReducer(state, { type: "arrive", id: replacement.id });
  state = notebookReducer(state, { type: "reveal" });
  assert.deepEqual(state.facts, [replacement]);
});

test("duplicate completion, replay and late arrival callbacks never duplicate tags", () => {
  const event = shown("memorize", [...facts, facts[0]]);
  let state = notebookReducer(ready(), { type: "shown", event, animate: true });
  state = notebookReducer(state, { type: "shown", event, animate: true });
  assert.equal(state.queue.length, 3);
  for (const fact of facts) state = notebookReducer(state, { type: "arrive", id: fact.id });
  for (let i = 0; i < facts.length; i++) state = notebookReducer(state, { type: "reveal" });
  assert.equal(notebookReducer(state, { type: "shown", event, animate: true }), state);
  assert.equal(notebookReducer(state, { type: "arrive", id: facts[0].id }), state);
});

test("history restore, a new turn and epoch clearing cancel stale flights safely", () => {
  const queued = notebookReducer(ready(), { type: "shown", event: shown(), animate: true });
  const restored = notebookReducer(queued, { type: "sync", memory: view([old, ...facts]), turnId: "next-turn" });
  assert.equal(restored.queue.length, 0);
  assert.deepEqual(restored.facts, [old, ...facts]);
  assert.equal(notebookReducer(restored, { type: "arrive", id: "name" }), restored);
  const cleared = notebookReducer(queued, { type: "sync", memory: view([], 1), turnId: null });
  assert.deepEqual(cleared.facts, []);
  assert.deepEqual(cleared.queue, []);
});

test("a delayed first memory response cannot expose a fact already queued for flight", () => {
  const queued = notebookReducer(initialNotebook, { type: "shown", event: shown(), animate: true });
  const hydrated = notebookReducer(queued, { type: "sync", memory: view([old, ...facts]), turnId: "turn" });
  assert.deepEqual(hydrated.facts, [old]);
  assert.deepEqual(hydrated.queue, facts);
});

test("a delayed previous server snapshot cannot erase landed tags on the next turn", () => {
  let state = notebookReducer(ready(), { type: "shown", event: shown(), animate: false });
  state = notebookReducer(state, { type: "sync", memory: view([old]), turnId: "next-turn" });
  assert.deepEqual(newest(state), ["age", "cat", "name", "old"]);
});
