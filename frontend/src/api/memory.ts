// Mirrors backend/app/main.py `MemoryView`.

export type MemoryPair = {
  user_message_id: string;
  question: string;
  answer: string;
  embedded: boolean;
  in_recent: boolean;
};

export type MemoryFact = {
  id: string;
  field: string;
  value: string;
  quote: string;
  revision: number;
};

export type MemoryView = {
  conversation_id: string;
  epoch: number;
  recent_limit: number;
  threshold: number;
  embed_model: string;
  facts: MemoryFact[];
  pairs: MemoryPair[];
};

export async function fetchMemory(conversationId: string): Promise<MemoryView | null> {
  try {
    const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/memory`);
    return res.ok ? ((await res.json()) as MemoryView) : null;
  } catch {
    return null;
  }
}

export async function clearMemory(conversationId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/clear`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}
