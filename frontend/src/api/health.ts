// Mirrors backend/app/health.py `HealthReport`.

export type ModelStatus = {
  name: string;
  role: "chat" | "embedding";
  available: boolean;
};

export type HealthReport = {
  ollama_host: string;
  ollama_reachable: boolean;
  models: ModelStatus[];
  ready: boolean;
  problem: "ollama_unreachable" | "model_missing" | null;
};

/** null means the backend itself did not answer. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthReport | null> {
  try {
    const res = await fetch("/api/health", { signal });
    if (!res.ok) return null;
    return (await res.json()) as HealthReport;
  } catch {
    return null;
  }
}
