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

test("normal playback starts at the first displayed step without jumping to pending steps", () => {
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

test("route expansion preserves browsing and pending selections; removed selections fall back safely", () => {
  const expanded: TurnState = { ...paused, route: "quick", stages: [
    ...paused.stages.slice(0, 2), { id: "route", status: "done" },
    { id: "quick_reply", status: "active" }, { id: "persist", status: "pending" },
  ] };
  assert.equal(stageNavigation(expanded, { turnId: paused.turnId, stageId: "receive" }).next?.id, "redact");
  const preview = stageNavigation(expanded, { turnId: paused.turnId, stageId: "persist" });
  assert.equal(preview.focus?.id, "persist");
  assert.equal(preview.isPreview, true);
  assert.equal(preview.next, undefined);
  assert.equal(stageNavigation(expanded, { turnId: paused.turnId, stageId: "memorize" }).focus?.id, "quick_reply");
});

test("selecting a future row previews its explanation without results or progress mutations", () => {
  const snapshot = structuredClone(paused);
  const nav = stageNavigation(paused, { turnId: paused.turnId, stageId: "route" });
  assert.equal(nav.focus?.id, "route");
  assert.equal(nav.focus?.status, "pending");
  assert.equal(nav.focus?.summary, undefined);
  assert.equal(nav.isPreview, true);
  assert.equal(nav.isReviewing, true);
  assert.equal(nav.previous?.id, "redact");
  assert.equal(nav.next, undefined);
  assert.deepEqual(paused, snapshot);
});

test("preview navigation can inspect later pending steps without releasing playback", () => {
  const expanded: TurnState = { ...paused, route: "quick", stages: [
    ...paused.stages, { id: "quick_reply", status: "pending" }, { id: "persist", status: "pending" },
  ] };
  const snapshot = structuredClone(expanded);
  const firstPreview = stageNavigation(expanded, { turnId: expanded.turnId, stageId: "route" });
  assert.equal(firstPreview.next?.id, "quick_reply");
  const secondPreview = stageNavigation(expanded, { turnId: expanded.turnId, stageId: firstPreview.next!.id });
  assert.equal(secondPreview.isPreview, true);
  assert.equal(secondPreview.next?.id, "persist");
  assert.equal(secondPreview.previous?.id, "route");
  assert.deepEqual(expanded, snapshot);
});

test("selection stays on its row while display progress changes; a removed preview is cleared", () => {
  const selection = { turnId: paused.turnId, stageId: "route" as const };
  const advanced: TurnState = { ...paused, stages: [
    ...paused.stages.slice(0, 2), { id: "route", status: "done", summary: { route: "quick" } },
    { id: "quick_reply", status: "active" },
  ] };
  const nav = stageNavigation(advanced, selection);
  assert.equal(nav.focus?.id, "route");
  assert.equal(nav.isPreview, false);
  assert.equal(nav.focus?.summary?.route, "quick");
  const changed: TurnState = { ...advanced, route: "clarify", stages: [advanced.stages[0], { id: "persist", status: "active" }] };
  assert.equal(stageNavigation(changed, selection).focus?.id, "persist");
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
