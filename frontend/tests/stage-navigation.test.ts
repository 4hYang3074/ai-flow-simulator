import { strict as assert } from "node:assert";
import { test } from "node:test";
import { stageNavigation, type TurnState } from "../src/flow/turnState.ts";

const paused: TurnState = {
  turnId: "turn-one", route: "pending", status: "running",
  stages: [
    { id: "receive", status: "done", summary: { chars: 2 } },
    { id: "redact", status: "done", summary: { redacted: "Hello" } },
    { id: "route", status: "pending" },
  ],
};

test("first step cannot go back or preview a pending step", () => {
  const first: TurnState = { ...paused, stages: [paused.stages[0], { id: "redact", status: "pending" }] };
  const nav = stageNavigation(first, null);
  assert.equal(nav.focus?.id, "receive");
  assert.equal(nav.previous, undefined);
  assert.equal(nav.next, undefined);
});

test("back and forward browse shown steps without changing execution state or results", () => {
  const snapshot = structuredClone(paused);
  const current = stageNavigation(paused, null);
  assert.equal(current.previous?.id, "receive");
  const back = stageNavigation(paused, { turnId: paused.turnId, stageId: "receive" });
  assert.equal(back.isReviewing, true);
  assert.equal(back.focus?.summary?.chars, 2);
  assert.equal(back.next?.id, "redact");
  const forward = stageNavigation(paused, { turnId: paused.turnId, stageId: back.next!.id });
  assert.equal(forward.isReviewing, false);
  assert.equal(forward.next, undefined);
  assert.deepEqual(paused, snapshot);
});

test("a new turn discards the old browsing position", () => {
  const newer: TurnState = { ...paused, turnId: "turn-two" };
  assert.equal(stageNavigation(newer, { turnId: paused.turnId, stageId: "receive" }).focus?.id, "redact");
});

test("route expansion preserves browsing and pending or removed selections fall back safely", () => {
  const expanded: TurnState = { ...paused, route: "quick", stages: [
    ...paused.stages.slice(0, 2), { id: "route", status: "done" },
    { id: "quick_reply", status: "active" }, { id: "persist", status: "pending" },
  ] };
  assert.equal(stageNavigation(expanded, { turnId: paused.turnId, stageId: "receive" }).next?.id, "redact");
  assert.equal(stageNavigation(expanded, { turnId: paused.turnId, stageId: "persist" }).focus?.id, "quick_reply");
  assert.equal(stageNavigation(expanded, { turnId: paused.turnId, stageId: "memorize" }).focus?.id, "quick_reply");
});

test("completed and failed turns remain browsable with no next step beyond the end", () => {
  for (const status of ["done", "failed"] as const) {
    const ended: TurnState = { ...paused, status, stages: [paused.stages[0], { id: "redact", status }] };
    assert.equal(stageNavigation(ended, null).next, undefined);
    assert.equal(stageNavigation(ended, null).previous?.id, "receive");
    assert.equal(stageNavigation(ended, { turnId: paused.turnId, stageId: "receive" }).next?.id, "redact");
  }
  assert.equal(stageNavigation(null, null).focus, undefined);
});
