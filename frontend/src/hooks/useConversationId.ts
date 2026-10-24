import { useState } from "react";
import { newId } from "../flow/protocol";

const KEY = "flow-sim:conversation";

/**
 * The conversation this browser is on, kept across reloads so memory (stored
 * in the backend's SQLite file) lines up with the page. Storage can be blocked
 * or empty; then a fresh id is used and nothing breaks.
 */
export function useConversationId(): string {
  const [id] = useState(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) return saved;
      const fresh = newId();
      localStorage.setItem(KEY, fresh);
      return fresh;
    } catch {
      return newId();
    }
  });
  return id;
}
