export type Demo = {
  id: string;
  zh: string;
  en: string;
  explain: string;
  /** Start from an empty memory, so the demo shows what it is meant to. */
  fresh: boolean;
  messages: string[];
  englishMessages: string[];
};

// Scripted conversations that walk through each part of the pipeline. The
// next message is sent only after the workflow panel has finished showing the
// previous turn, so every step can be watched.
export const DEMOS: Demo[] = [
  {
    id: "memory",
    englishMessages: [
      "My name is Amin. My cat is called Snowball, and she is three years old.",
      "Recommend a Python book for beginners.",
      "Will it rain tomorrow?",
      "My favorite food is pizza.",
      "What is my cat called, and how old is she?",
    ],
    zh: "记忆是怎么工作的",
    en: "How memory works",
    explain: "先说几件关于自己的事，聊几句别的，再问回来：看短期记忆、长期记忆本和相似度检索怎么配合。会先清空记忆。",
    fresh: true,
    messages: [
      "我叫阿明，我的猫叫小白，它三岁了",
      "推荐一本适合新手的 Python 书",
      "明天要下雨吗？",
      "我最喜欢吃披萨",
      "我的猫叫什么名字？几岁了？",
    ],
  },
  {
    id: "routes",
    englishMessages: [
      "Hello",
      "What about the second one?",
      "Recommend two beginner-friendly databases in a numbered list.",
      "What are the advantages of the second one?",
      "Why?",
      "No, I meant databases suitable for caching.",
    ],
    zh: "五条路线巡礼",
    en: "Route tour",
    explain: "闲聊、需要澄清、普通问答、引用话题（序号和「为什么」）、纠正：每条路线走一遍。会先清空记忆。",
    fresh: true,
    messages: [
      "你好",
      "第二个呢？",
      "推荐两个适合新手的数据库，用编号列出",
      "第二个有什么优点？",
      "为什么？",
      "不对，我是说适合做缓存的",
    ],
  },
  {
    id: "context",
    englishMessages: [
      "I am considering learning Rust or Go.",
      "Recommend a Python book for beginners.",
      "Will it rain tomorrow?",
      "What should I eat for dinner?",
      "Which of those two languages is better for building web backends?",
      "How much does that one cost?",
    ],
    zh: "上下文不够时",
    en: "Not enough context",
    explain: "先聊一个话题，再岔开聊三件别的事，最后用「那两个」「它」指回去：看系统怎么从 3 轮扩到 5 轮，找不到时怎么反问而不是乱猜。会先清空记忆。",
    fresh: true,
    messages: [
      "我在考虑学 Rust 还是 Go",
      "推荐一本适合新手的 Python 书",
      "明天要下雨吗？",
      "今晚吃什么好？",
      "那两个里面哪个更适合写网页后端？",
      "它的价格大概多少？",
    ],
  },
  {
    id: "privacy",
    englishMessages: [
      "My phone number is 13812345678 and my email is amy@example.com. Write a short self-introduction for me.",
    ],
    zh: "隐私脱敏",
    en: "Privacy",
    explain: "带上手机号和邮箱：看它们在交给模型前被换成占位符，回答显示时再换回来。",
    fresh: false,
    messages: ["我的手机号是 13812345678，邮箱 amy@example.com，帮我写一句简短的自我介绍"],
  },
];
