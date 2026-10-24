import type { StageId } from "./protocol";

export type Fact = { label: string; value: string };

type Summary = Record<string, unknown> | undefined;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const ms = (v: unknown) => (num(v) == null ? "—" : `${Math.round(num(v)!)} ms`);
const plain = (v: unknown) => (v == null || v === "" ? "—" : String(v));
const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);
const list = (v: unknown) => (Array.isArray(v) && v.length ? v.join(", ") : "无 none");

const DECIDED_BY: Record<string, string> = {
  rule: "规则 Rule",
  model: "模型 Model",
  default: "默认 Default",
};

const RULES: Record<string, string> = {
  small_talk: "闲聊 small talk",
  correction_cue: "纠正用语 correction cue",
  ordinal_cue: "序号 list position",
  reference_cue: "指代词 pointer",
  topic_shift: "换话题 topic shift",
};

const SMALL_TALK: Record<string, string> = {
  greeting: "打招呼 greeting",
  thanks: "道谢 thanks",
  goodbye: "道别 goodbye",
  ack: "回应 acknowledgement",
};

const CLARIFY_REASONS: Record<string, string> = {
  no_history: "前面没有对话 nothing earlier",
  no_list: "上一个回答里没有列表 no list in the last answer",
  out_of_range: "序号超出列表长度 position past the end",
};

/** The few numbers worth showing from a stage's `summary`, in plain words. */
export function stageFacts(stage: StageId, summary: Summary): Fact[] {
  if (!summary) return [];
  switch (stage) {
    case "receive":
      return [{ label: "字数 Characters", value: `${plain(summary.chars)} / ${plain(summary.limit)}` }];
    case "redact": {
      const found = (summary.found ?? {}) as Record<string, number>;
      const kinds = Object.entries(found).map(([k, n]) => `${k} × ${n}`);
      return [
        { label: "找到的个人信息 Found", value: kinds.length ? kinds.join(", ") : "无 none" },
        { label: "替换后 Redacted", value: plain(summary.redacted_preview) },
      ];
    }
    case "route": {
      const facts: Fact[] = [
        { label: "判定方式 Decided by", value: DECIDED_BY[String(summary.decided_by)] ?? plain(summary.decided_by) },
        { label: "路线 Route", value: plain(summary.route) },
      ];
      if (summary.rule) facts.push({ label: "命中规则 Rule", value: RULES[String(summary.rule)] ?? String(summary.rule) });
      if (summary.matched) facts.push({ label: "命中文字 Matched", value: `「${summary.matched}」` });
      if (summary.decided_by === "model") {
        facts.push({ label: "模型理由 Reason", value: summary.model_invalid ? "输出无效，改用默认 invalid, fell back" : plain(summary.model_reason) });
        facts.push({ label: "模型耗时 Model time", value: ms(summary.model_ms) });
      }
      return facts;
    }
    case "quick_reply":
      return [
        { label: "类型 Kind", value: SMALL_TALK[String(summary.kind)] ?? plain(summary.kind) },
        { label: "模型调用 Model calls", value: plain(summary.model_calls) },
      ];
    case "correction":
      return [
        { label: "纠正用语 Cue", value: summary.cue ? `「${summary.cue}」` : "—" },
        { label: "上一轮问题 Previous question", value: plain(summary.previous_question) },
        { label: "上一轮回答 Previous answer", value: plain(summary.previous_answer) },
        { label: "材料编号 Label", value: plain(summary.label) },
      ];
    case "reference":
      if (!summary.resolved) {
        return [
          { label: "指代 Pointer", value: summary.cue ? `「${summary.cue}」` : "—" },
          { label: "结果 Result", value: "找不到，改为反问 · not found, asking" },
          { label: "原因 Reason", value: CLARIFY_REASONS[String(summary.reason)] ?? plain(summary.reason) },
          { label: "模型调用 Model calls", value: "0" },
        ];
      }
      return [
        { label: "指代 Pointer", value: summary.cue ? `「${summary.cue}」` : "—" },
        {
          label: "指向 Points at",
          value:
            summary.target === "list_item"
              ? `上一个回答的第 ${summary.index} 项（共 ${summary.list_size} 项）`
              : "上一轮对话 the previous exchange",
        },
        { label: "解析结果 Resolved", value: plain(summary.resolved_text) },
        { label: "材料编号 Label", value: plain(summary.label) },
      ];
    case "memory_recall":
      return [
        { label: "短期记忆 Recent", value: `${count(summary.recent_pairs)} / ${plain(summary.recent_limit)} 组` },
        { label: "更早的对话 Older", value: `${plain(summary.older_pairs)} 组` },
        { label: "相似度阈值 Threshold", value: plain(summary.threshold) },
        { label: "向量化耗时 Embedding", value: ms(summary.embed_ms) },
      ];
    case "context_check": {
      const attempts = Array.isArray(summary.attempts) ? summary.attempts : [];
      if (summary.checked_by === "skipped") {
        return [
          { label: "结果 Result", value: "不用检查 · not needed" },
          { label: "原因 Reason", value: SKIP_REASONS[String(summary.skip_reason)] ?? plain(summary.skip_reason) },
        ];
      }
      return [
        { label: "结果 Result", value: CHECK_OUTCOMES[String(summary.outcome)] ?? plain(summary.outcome) },
        { label: "检查过的轮数 Tried", value: attempts.map((a: { pairs: number }) => `${a.pairs} 轮`).join(" → ") || "—" },
        { label: "最终用的轮数 Window", value: `${plain(summary.window)} 轮` },
      ];
    }
    case "context":
      return [
        { label: "带编号的材料 Materials", value: `${count(summary.materials)} 条` },
        { label: "最近的对话 Recent", value: `${plain(summary.recent_pairs)} 组` },
        { label: "消息总数 Messages", value: plain(summary.total_messages) },
        { label: "Prompt 字数 Characters", value: plain(summary.prompt_chars) },
      ];
    case "evidence":
      return [
        { label: "材料 Materials", value: `${count(summary.manifest)} 条` },
        { label: "消息数 Messages", value: plain(summary.prompt_messages) },
        { label: "Prompt 指纹 SHA-256", value: typeof summary.prompt_sha256 === "string" ? `${summary.prompt_sha256.slice(0, 16)}…` : "—" },
      ];
    case "generate":
      return [
        { label: "模型 Model", value: plain(summary.model) },
        { label: "首个 token First token", value: ms(summary.first_token_ms) },
        { label: "输入 tokens Prompt", value: plain(summary.prompt_tokens) },
        { label: "输出 tokens Output", value: plain(summary.output_tokens) },
        { label: "速度 Speed", value: num(summary.tokens_per_second) == null ? "—" : `${summary.tokens_per_second} tok/s` },
      ];
    case "validate":
      return [
        { label: "空回答重试 Retried", value: summary.retried_without_history ? "是 · 去掉历史重问了一次" : "否 no" },
        { label: "有效引用 Valid citations", value: list(summary.citations_valid) },
        { label: "无效引用 Invalid citations", value: list(summary.citations_invalid) },
        { label: "写错的标签 Mangled (removed)", value: list(summary.citations_malformed) },
        { label: "还原的占位符 Restored", value: plain(summary.placeholders_restored) },
      ];
    case "memorize":
      return [
        { label: "新记住的事实 Saved", value: `${count(summary.saved)} 条` },
        { label: "被取代的旧事实 Superseded", value: `${count(summary.superseded)} 条` },
        { label: "引用对不上被丢掉 Rejected", value: `${count(summary.rejected)} 条` },
        { label: "记忆本总数 Notebook", value: summary.total_facts == null ? "—" : `${summary.total_facts} 条` },
        { label: "模型耗时 Model time", value: ms(summary.model_ms) },
      ];
    case "persist":
      return [
        { label: "已保存 Stored", value: `${plain(summary.stored_pairs)} 组问答` },
        {
          label: "向量索引 Embedding",
          value: summary.embedded
            ? `已建立 · ${plain(summary.dimensions)} 维`
            : summary.skipped
              ? "不建立：闲聊和反问不进可检索记忆"
              : "未建立 · not indexed",
        },
      ];
    default:
      return [];
  }
}

export type PromptLine = { role: string; source: string; preview: string; content: string };

/** The message list the model read, when the stage reports it. */
export function promptLines(summary: Summary): PromptLine[] {
  const raw = summary?.messages;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => !!m && typeof m.role === "string" && typeof m.preview === "string")
    .map((m) => ({
      role: m.role,
      source: typeof m.source === "string" ? m.source : m.role,
      preview: m.preview,
      content: typeof m.content === "string" ? m.content : m.preview,
    }));
}

export type Candidate = { question: string; score: number; picked: boolean; user_message_id: string };

export function recallCandidates(summary: Summary): Candidate[] {
  const raw = summary?.candidates;
  if (!Array.isArray(raw)) return [];
  return raw.filter((c) => !!c && typeof c.question === "string" && typeof c.score === "number");
}

export type ManifestEntry = { label: string; kind: string; preview: string; chars: number };

export function manifest(summary: Summary): ManifestEntry[] {
  const raw = summary?.manifest;
  if (!Array.isArray(raw)) return [];
  return raw.filter((m) => !!m && typeof m.label === "string");
}

export type SavedFact = { id: string; field: string; value: string; quote: string; revision: number };

export function savedFacts(summary: Summary): SavedFact[] {
  const raw = summary?.saved;
  if (!Array.isArray(raw)) return [];
  return raw.filter((f) => !!f && typeof f.id === "string" && typeof f.value === "string");
}

export type RejectedFact = { field?: string; value?: string; quote?: string; reason: string };

export function rejectedFacts(summary: Summary): RejectedFact[] {
  const raw = summary?.rejected;
  return Array.isArray(raw) ? raw.filter((r) => !!r && typeof r.reason === "string") : [];
}

export const REJECT_REASONS: Record<string, string> = {
  quote_not_in_message: "引用不在原文里",
  missing_part: "缺少内容",
  too_long: "太长",
  duplicate_field: "重复",
  too_many: "太多",
  invalid_json: "模型输出格式错误",
  from_question: "来自问句，不是陈述",
  unknown_value: "值是「未知」",
};

export const MEMORIZE_NOTES: Record<string, string> = {
  nothing_lasting: "这句话里没有需要长期记住的事。· Nothing worth keeping long term.",
  model_unavailable: "模型不可用，这一轮没有提取。· Model unavailable; nothing extracted.",
};

const SKIP_REASONS: Record<string, string> = {
  no_history: "这是第一句话，前面没有对话",
  resolved_by_rule: "「第几个」已经按规则在列表里找到了",
  correction: "纠正指的就是上一轮",
  standalone: "这是一个完整的新问题",
};

const CHECK_OUTCOMES: Record<string, string> = {
  sufficient: "3 轮就够了 · enough",
  expanded: "3 轮不够，扩到 5 轮后够了 · widened to 5",
  clarify: "5 轮也不够，改为反问 · asking instead",
  unchecked: "模型不可用，没检查 · not checked",
};

export type CheckAttempt = {
  pairs: number;
  sufficient: boolean;
  invalid?: boolean;
  references: { phrase: string; quote: string; found: boolean }[];
};

export function checkAttempts(summary: Summary): CheckAttempt[] {
  const raw = summary?.attempts;
  return Array.isArray(raw) ? raw.filter((a) => !!a && typeof a.pairs === "number") : [];
}

export const RECALL_NOTES: Record<string, string> = {
  no_older_pairs: "还没有更早的对话可以检索：目前的对话都在短期记忆里。· Nothing older to search yet.",
  embed_unavailable: "向量模型不可用，这一轮只用短期记忆。· Embedding model unavailable; recent memory only.",
};

export const MATERIAL_KIND: Record<string, string> = {
  memory: "召回记忆 memory",
  reference: "引用 reference",
  correction: "纠正 correction",
  summary: "长期摘要 summary",
};
