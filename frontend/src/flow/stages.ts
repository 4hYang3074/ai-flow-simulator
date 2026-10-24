import type { ErrorCode, RouteId, StageId } from "./protocol";

export const ROUTES: Record<RouteId, { zh: string; en: string; explain: string }> = {
  pending: {
    zh: "判断中",
    en: "Deciding",
    explain: "每一轮都先走这三步。走到「意图路由」才知道后面要走哪条路线，到时会补上后面的步骤。",
  },
  quick: {
    zh: "闲聊快速通道",
    en: "Fast Path",
    explain: "打招呼、道谢这类话用模板直接回答，不调用模型，也不放进可检索的记忆。",
  },
  basic: {
    zh: "普通问答",
    en: "Basic Q&A",
    explain: "最常见的路线：找记忆、拼 prompt、让模型回答、检查、保存。",
  },
  reference: {
    zh: "引用话题",
    en: "Reference",
    explain: "你在指前面说过的东西（「那个」「第二个」），先弄清楚指的是什么，再交给模型。",
  },
  correction: {
    zh: "纠正回看",
    en: "Correction",
    explain: "你说上一个回答不对，先把上一轮找出来，让模型知道要改的是哪里。",
  },
  clarify: {
    zh: "需要澄清",
    en: "Clarify",
    explain: "你指的东西在最近 3 轮、再扩到 5 轮的对话里都找不到。系统不乱猜，直接反问你，不调用回答模型。",
  },
};

export type StageCopy = {
  zh: string;
  en: string;
  /** What this step does, in plain words. Key terms stay in English. */
  explain: string;
  /** What a production service does here that this demo leaves out. */
  realWorld: string;
};

// Titles and explanations for every stage, including the ones later phases
// switch on. "In production" notes describe two real AI services this demo is modelled on.
export const STAGES: Record<StageId, StageCopy> = {
  receive: {
    zh: "接收与校验",
    en: "Receive",
    explain: "先检查这条消息能不能处理：是不是空的、有没有超过 2000 字、上一条是不是还在跑。",
    realWorld: "真实系统还会验证登录身份，并按用户限流（rate limit）。",
  },
  redact: {
    zh: "隐私脱敏",
    en: "Redact PII",
    explain: "把手机号、邮箱这类个人信息（PII）换成占位符，再交给模型。",
    realWorld: "真实系统用一个「保险箱」记下每次替换，回答出来后再换回去。",
  },
  route: {
    zh: "意图路由",
    en: "Intent Routing",
    explain: "判断这句话属于哪一类：闲聊、普通提问、引用前文还是纠正。先用规则（rule），规则判断不了再问小模型。",
    realWorld: "规则在前、模型在后，能省下大部分模型调用，也更好预测。",
  },
  quick_reply: {
    zh: "快速通道",
    en: "Fast Path",
    explain: "「你好」「谢谢」这种话直接用模板回答，一次模型都不调用。",
    realWorld: "真实的聊天服务就是这样处理闲聊：0 次模型调用，几毫秒回完。",
  },
  correction: {
    zh: "纠正检测",
    en: "Correction",
    explain: "发现你在说「不对」「我是说」，就把上一轮的问题和回答找出来重新看。",
    realWorld: "真实系统规定纠正内容绝不能因为篇幅被截掉。",
  },
  reference: {
    zh: "引用话题",
    en: "Reference Resolution",
    explain: "发现「那个」「刚才那个」这类指代，找出它指的是哪个话题；指代不明就反问你。",
    realWorld: "宁可反问，也不乱猜：猜错比多问一句代价大。",
  },
  memory_recall: {
    zh: "记忆提取",
    en: "Memory Recall",
    explain: "从三层记忆里找相关内容：最近几轮对话、长期摘要、用 embedding 做的语义检索。",
    realWorld: "真实系统把最近对话缓存在 Redis，摘要里每条事实都要能指回原文。",
  },
  context_check: {
    zh: "上下文检查",
    en: "Context Check",
    explain: "先看最近 3 轮对话够不够理解你这句话：让模型指出你话里指向前文的词（「那两个」「它」），并原文引用它指的内容，代码核对引用确实在前文里。3 轮不够就扩到 5 轮；5 轮还不够，就直接问你，绝不靠猜。",
    realWorld: "完整的新问题（例如「什么是向量数据库？」）、找到了列表项的「第二个」、纠正上一轮，这几种不用检查。",
  },
  context: {
    zh: "上下文组装",
    en: "Context Assembly",
    explain: "把要给模型看的东西拼成一个消息列表（prompt）：系统指令、最近的对话、你的新问题。模型本身不记得任何事，每次都要重新给。",
    realWorld: "真实系统会按 token 预算挑选，超出就从最不重要的内容开始删。",
  },
  evidence: {
    zh: "证据快照",
    en: "Evidence Snapshot",
    explain: "给放进 prompt 的每条材料编号，记下模型这次到底看到了什么。",
    realWorld: "真实系统会冻结这份清单，之后的修改不会影响已经在跑的回答。",
  },
  generate: {
    zh: "LLM 生成",
    en: "Generation",
    explain: "把消息列表交给本地的 Qwen3 4B。模型一次生成一个 token，每个 token 一出来就送到左边，所以文字是一点点出现的（streaming）。",
    realWorld: "真实系统在这里还会让模型调用工具（tool calling），最多 3 轮。",
  },
  validate: {
    zh: "输出校验",
    en: "Output Validation",
    explain: "检查回答：是不是空的、引用的编号是不是真的给过模型。",
    realWorld: "真实系统遇到空回答，会去掉历史再问一次。",
  },
  persist: {
    zh: "保存",
    en: "Persist",
    explain: "回答完整以后，把这一问一答作为一对存进 SQLite，再给它算一个 embedding，以后才能靠相似度找回来。",
    realWorld: "只在成功后保存，失败的回合不会留下半截对话。存的是脱敏后的文字。",
  },
  memorize: {
    zh: "长期记忆",
    en: "Long-term Memory",
    explain: "让模型从你的话里挑出值得长期记住的事实（名字、喜好、限制…），每条都必须原文引用你的话，引用对不上就丢掉。留下的事实会写进左边的「记忆本」，以后每一轮都会带给模型。",
    realWorld: "真实系统把它做成独立的后台任务，要用户同意才运行；同一项事实有新说法时，旧的标记为被取代而不是删除。",
  },
};

export const ERRORS: Record<ErrorCode | "network", string> = {
  invalid_message: "消息是空的，或者超过了 2000 字 · Message is empty or over 2,000 characters",
  busy: "上一条还在处理，请稍等 · The previous message is still running",
  llm_unavailable:
    "模型调用失败：Ollama 没有运行，或者模型还没下载（看右上角的状态）· The model call failed: Ollama is not running or the model is not downloaded (see the status at the top right)",
  empty_reply: "模型没有返回任何内容 · The model returned nothing",
  internal: "系统出错了，请看后端终端的报错 · Something went wrong; check the backend log",
  network: "连接中断了 · The connection was lost",
};
