import { useCallback, useEffect, useState } from "react";
import { clearMemory, fetchMemory, type MemoryView } from "../api/memory";

/** What the backend remembers for this conversation; reload after each turn. */
export function useMemory(conversationId: string) {
  const [memory, setMemory] = useState<MemoryView | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const view = await fetchMemory(conversationId);
    if (view) setMemory(view);
    setLoaded(true);
    return view;
  }, [conversationId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const clear = useCallback(async () => {
    const ok = await clearMemory(conversationId);
    if (ok) await reload();
    return ok;
  }, [conversationId, reload]);

  return { memory, loaded, reload, clear };
}
