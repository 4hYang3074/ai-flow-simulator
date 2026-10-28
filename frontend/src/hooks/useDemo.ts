import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguageSwitch } from "../preferences";
import type { Demo } from "../flow/demos";
import type { FlowEvent } from "../flow/turnState";

// Pause between the panel finishing one turn and the next message.
const GAP_MS = 1500;

/**
 * Plays a demo script: sends each message once the workflow panel has shown
 * the previous turn's end, and stops on an error or when asked.
 */
export function useDemo(send: (text: string) => void, clearMemory: () => Promise<boolean>, presentationBusy = false) {
  const { language } = useLanguageSwitch();
  const [running, setRunning] = useState<{ demo: Demo; index: number } | null>(null);
  const [awaitingPresentation, setAwaitingPresentation] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const runningRef = useRef(running);
  runningRef.current = running;

  const stop = useCallback(() => {
    window.clearTimeout(timer.current);
    setAwaitingPresentation(false);
    setRunning(null);
  }, []);

  const start = useCallback(
    async (demo: Demo) => {
      stop();
      if (demo.fresh) await clearMemory();
      // Snapshot the language once: later UI switches must not mix this script.
      const script = { ...demo, messages: language === "en" ? demo.englishMessages : demo.messages };
      setRunning({ demo: script, index: 0 });
      send(script.messages[0]);
    },
    [send, clearMemory, stop, language],
  );

  const scheduleNext = useCallback(
    () => {
      const current = runningRef.current;
      if (!current) return;
      const next = current.index + 1;
      if (next >= current.demo.messages.length) return stop();
      timer.current = window.setTimeout(() => {
        setRunning({ demo: current.demo, index: next });
        send(current.demo.messages[next]);
      }, GAP_MS);
    },
    [send, stop],
  );

  /** Do not replace the turn while its saved facts are still landing. */
  const onFlowEvent = useCallback((event: FlowEvent) => {
    if (!runningRef.current) return;
    if (event.type === "error") return stop();
    if (event.type !== "final") return;
    if (presentationBusy) setAwaitingPresentation(true);
    else scheduleNext();
  }, [presentationBusy, scheduleNext, stop]);

  useEffect(() => {
    if (!awaitingPresentation || presentationBusy) return;
    setAwaitingPresentation(false);
    scheduleNext();
  }, [awaitingPresentation, presentationBusy, scheduleNext]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { running, start, stop, onFlowEvent };
}
