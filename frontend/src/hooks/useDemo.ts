import { useCallback, useEffect, useRef, useState } from "react";
import type { Demo } from "../flow/demos";
import type { FlowEvent } from "../flow/turnState";

// Pause between the panel finishing one turn and the next message.
const GAP_MS = 1500;

/**
 * Plays a demo script: sends each message once the workflow panel has shown
 * the previous turn's end, and stops on an error or when asked.
 */
export function useDemo(send: (text: string) => void, clearMemory: () => Promise<boolean>) {
  const [running, setRunning] = useState<{ demo: Demo; index: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const runningRef = useRef(running);
  runningRef.current = running;

  const stop = useCallback(() => {
    window.clearTimeout(timer.current);
    setRunning(null);
  }, []);

  const start = useCallback(
    async (demo: Demo) => {
      stop();
      if (demo.fresh) await clearMemory();
      setRunning({ demo, index: 0 });
      send(demo.messages[0]);
    },
    [send, clearMemory, stop],
  );

  /** Told about each event as the workflow panel shows it. */
  const onFlowEvent = useCallback(
    (event: FlowEvent) => {
      const current = runningRef.current;
      if (!current) return;
      if (event.type === "error") return stop();
      if (event.type !== "final") return;
      const next = current.index + 1;
      if (next >= current.demo.messages.length) return stop();
      timer.current = window.setTimeout(() => {
        setRunning({ demo: current.demo, index: next });
        send(current.demo.messages[next]);
      }, GAP_MS);
    },
    [send, stop],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { running, start, stop, onFlowEvent };
}
