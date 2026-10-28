import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { MemoryView } from "../api/memory";
import { elementBox, textBox, type Flight } from "../components/FlyLayer";
import { initialNotebook, notebookReady, notebookReducer } from "../flow/notebook";
import type { FlowEvent } from "../flow/turnState";
import { MEMORY_EXTRACT_STAGGER } from "../motion";

/** The visible element matching `selector` that comes last in the page. */
function lastVisible(selector: string): Element | null {
  const all = [...document.querySelectorAll(selector)].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
  });
  return all.at(-1) ?? null;
}

/**
 * Queue facts at displayed memorize completion. Each extraction starts 60 ms
 * after the previous one, then flies independently; reveal landed tags in order.
 */
export function useMemoryFlights(memory: MemoryView | null, loaded: boolean, turnId?: string) {
  const reduced = useReducedMotion();
  const [notebook, dispatch] = useReducer(notebookReducer, initialNotebook);
  const [flights, setFlights] = useState<Flight[]>([]);
  const launched = useRef(new Set<string>());
  const ready = notebookReady(notebook);
  const firstId = notebook.queue[0]?.id;

  useEffect(() => {
    if (loaded && memory) dispatch({ type: "sync", memory, turnId: turnId ?? null });
  }, [loaded, memory, turnId]);

  useEffect(() => {
    launched.current.clear();
    setFlights([]);
  }, [notebook.turnId, notebook.epoch]);

  useEffect(() => {
    if (!notebook.queue.length) { setFlights([]); return; }
    if (reduced) {
      setFlights([]);
      dispatch({ type: "reduce-motion" });
      return;
    }
    const pending = notebook.queue.filter((fact) => !launched.current.has(fact.id));
    if (!pending.length) return;
    const bubble = lastVisible('[data-chat-role="user"]');
    const target = lastVisible("[data-memory-notebook]");
    // An offscreen source/target cannot have a meaningful flight. Reveal only
    // after this displayed memorize event; there is no elapsed-time release.
    if (!bubble || !target) {
      dispatch({ type: "reduce-motion" });
      return;
    }
    const to = elementBox(target);
    const group = pending.map((fact, index) => {
      launched.current.add(fact.id);
      const quoted = textBox(bubble, fact.quote);
      return {
        id: fact.id, text: `${fact.field}: ${fact.value}`,
        fact: { field: fact.field, value: fact.value },
        from: quoted ?? elementBox(bubble), exact: quoted != null, to, delay: index * MEMORY_EXTRACT_STAGGER,
      };
    });
    setFlights((current) => [...current, ...group]);
  }, [notebook.queue, notebook.turnId, notebook.epoch, reduced]);

  // This short sequencing timer is gated by actual landings. It cannot reveal
  // facts merely because the backend finished or the user waited at an early step.
  useEffect(() => {
    if (!ready || reduced) return;
    const timer = window.setTimeout(() => dispatch({ type: "reveal" }), 100);
    return () => window.clearTimeout(timer);
  }, [ready, firstId, reduced]);

  const onFlowEvent = useCallback((event: FlowEvent) => {
    dispatch({ type: "shown", event, animate: !reduced });
  }, [reduced]);

  const onArrive = useCallback(
    (ids: string[]) => {
      const landed = new Set(ids);
      setFlights((current) => current.filter((flight) => !landed.has(flight.id)));
      ids.forEach((id) => dispatch({ type: "arrive", id }));
    },
    [],
  );

  return { facts: notebook.facts, flights, busy: notebook.queue.length > 0, onFlowEvent, onArrive };
}
