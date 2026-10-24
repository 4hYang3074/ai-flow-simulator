import { useEffect, useState } from "react";
import { fetchHealth, type HealthReport } from "../api/health";

export type HealthState =
  | { kind: "checking" }
  | { kind: "backend_offline" }
  | { kind: "report"; report: HealthReport };

// Poll often while something is wrong, so the pill turns green soon after the
// friend starts Ollama or finishes a pull; rarely once everything is ready.
const POLL_NOT_READY_MS = 4000;
const POLL_READY_MS = 15000;

export function useHealth(): HealthState {
  const [state, setState] = useState<HealthState>({ kind: "checking" });

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;

    const tick = async () => {
      const report = await fetchHealth(controller.signal);
      if (controller.signal.aborted) return;
      setState(report ? { kind: "report", report } : { kind: "backend_offline" });
      timer = window.setTimeout(tick, report?.ready ? POLL_READY_MS : POLL_NOT_READY_MS);
    };
    tick();

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  return state;
}
