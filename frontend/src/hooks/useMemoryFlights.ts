import { useCallback, useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { MemoryView } from "../api/memory";
import { elementBox, textBox, type Flight } from "../components/FlyLayer";
import { savedFacts } from "../flow/facts";
import type { FlowEvent } from "../flow/turnState";

// A fact that never gets its flight (a new turn replaced the panel, say)
// still appears after this long.
const RELEASE_AFTER_MS = 10_000;
const STAGGER_S = 0.18;

/** The visible element matching `selector` that comes last in the page. */
function lastVisible(selector: string): Element | null {
  const all = [...document.querySelectorAll(selector)].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  return all.at(-1) ?? null;
}

/**
 * Which long-term facts the notebook may show, and the flights that bring new
 * ones in. A fact is shown only once it has been "seen": everything present at
 * page load is seen at once, a new fact becomes seen when its flight lands.
 * Deciding by "seen" (rather than holding facts back after they appear) means
 * a new fact is hidden from its very first render, with no flash.
 */
export function useMemoryFlights(memory: MemoryView | null, loaded: boolean) {
  const reduced = useReducedMotion();
  const [seen, setSeen] = useState<Set<string> | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);

  const release = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setSeen((s) => new Set([...(s ?? []), ...ids]));
  }, []);

  // Facts present at page load are already in the notebook: no flights.
  useEffect(() => {
    if (loaded && memory && seen === null) setSeen(new Set(memory.facts.map((f) => f.id)));
  }, [loaded, memory, seen]);

  const unseen = seen ? (memory?.facts ?? []).filter((f) => !seen.has(f.id)).map((f) => f.id) : [];
  const unseenKey = unseen.join(",");

  // With reduced motion there is no flight: show new facts straight away.
  // Otherwise a safety net makes sure nothing stays hidden for long.
  useEffect(() => {
    if (!unseenKey) return;
    const ids = unseenKey.split(",");
    if (reduced) return release(ids);
    const t = window.setTimeout(() => release(ids), RELEASE_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [unseenKey, reduced, release]);

  /** Called when the workflow panel shows an event; memorize starts flights. */
  const onFlowEvent = useCallback(
    (event: FlowEvent) => {
      if (event.type !== "stage_end" || event.stage !== "memorize") return;
      const facts = savedFacts(event.summary);
      if (!facts.length || reduced) return;

      const bubble = lastVisible('[data-chat-role="user"]');
      const target = lastVisible("[data-memory-target]");
      if (!bubble || !target) return release(facts.map((f) => f.id));
      const to = elementBox(target);

      setFlights((current) => [
        ...current.filter((c) => !facts.some((f) => f.id === c.id)),
        ...facts.map((f, i) => {
          const quoted = textBox(bubble, f.quote);
          return {
            id: f.id,
            text: `${f.field}：${f.value}`,
            from: quoted ?? elementBox(bubble),
            exact: quoted != null,
            to: { x: to.x, y: to.y, w: 0, h: 0 },
            delay: i * STAGGER_S,
          };
        }),
      ]);
    },
    [reduced, release],
  );

  const onArrive = useCallback(
    (id: string) => {
      setFlights((current) => current.filter((f) => f.id !== id));
      release([id]);
    },
    [release],
  );

  const isShown = useCallback((id: string) => seen?.has(id) ?? false, [seen]);

  return { isShown, flights, onFlowEvent, onArrive };
}
