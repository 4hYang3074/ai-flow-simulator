import { useCallback, useState } from "react";
import { newId } from "../flow/protocol";

const KEY = "flow-sim:conversation";

function save(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Storage blocked: the id still works for this page.
  }
}

/**
 * The conversation this browser is on, kept across reloads so memory (stored
 * in the backend's SQLite file) lines up with the page. Storage can be blocked
 * or empty; then a fresh id is used and nothing breaks. `startNew` switches to
 * a fresh conversation; the old one stays in the database.
 */
export function useConversationId(): { id: string; startNew: () => void } {
  const [id, setId] = useState(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) return saved;
    } catch {
      // Fall through to a fresh id.
    }
    const fresh = newId();
    save(fresh);
    return fresh;
  });

  const startNew = useCallback(() => {
    const fresh = newId();
    save(fresh);
    setId(fresh);
  }, []);

  return { id, startNew };
}
