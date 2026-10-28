# AI Flow Simulator · AI 流程模拟器

一个教学用的 AI service 模拟器：左边聊天，中间显示 AI 正在处理的那一步并附带解释，右边是这一轮的完整流程。后端是真的在本机跑的流水线（不是写死的动画），模型是 Ollama 上的 Qwen3 4B，不连接任何云服务。

A teaching simulator: chat on the left; on the right, every stage a real local AI service runs for your message, explained as it happens. Everything runs on your machine through Ollama.

流程的设计参考了两个真实在线运行的 AI 服务（下文称系统 A、系统 B）。每一步的解释下面都写了「真实系统还会做什么」。

想先了解一个 AI 服务是怎么运作的？读 [中文教程](docs/ai-service-explained.html) / [English tutorial](docs/ai-service-explained.en.html)：用这个模拟器讲解 harness、规则、记忆，以及“判断不了就问”的规则。系统顶部的“教程报告”按钮会按界面语言在新标签页打开；报告顶部也可切换语言并保留正在阅读的章节。离线阅读请一起保留两份 HTML、`report.css`、`report.js` 和 `assets/` 配图。

## 快速开始 Quick start

第一次安装请看 [SETUP.md](SETUP.md)，也可以直接把它交给 AI 助手执行。装好以后：

```bash
npm run dev
```

然后打开 http://localhost:5173 。

## 界面导览 Tour

**左边：对话 Chat**

| 位置 | 作用 |
|---|---|
| 📒 记忆本 | 系统长期记住的事实（「猫的名字：小白」）。新事实会从你说的那句话里浮出来，飞进这里 |
| ＋ 新对话 | 开始一段全新的对话：聊天、流程和记忆本都从空白开始。旧对话不会删除，仍保存在 `data/flow-sim.db` |
| 示例 Demo | 一键播放一段预设对话，演示每条路线。下一条会等右边播放完才发送 |
| 记忆 Memory | 打开完整的记忆：长期事实（附原文引用）和所有对话记录；可以清空 |
| 回复下面的徽章 | 这个回答走了哪条路线、用了哪些记忆材料 |
| ↺ 回放流程 | 让右边重新播放那一轮的完整流程 |

**中间：当前步骤 Current step**

| 位置 | 作用 |
|---|---|
| 当前步骤卡片 | 正在进行的那一步：在做什么、真实的输入输出、真实系统还会做什么 |
| 速度 / 单步 | 本地步骤往往不到 1 毫秒，所以这里是放慢的回放：可以调速度，或打开「单步」每步暂停。显示的耗时都是真实值 |
| 放慢回放中… | 落后于实际进度时会如实提示；左边的文字永远是收到就显示（真的 streaming） |

**右边：完整流程 Full route**

本轮路线的全部步骤。每一步在中间完成后，会有一个「✓ 步骤名」小标签飘到这里对应的那一行，落地时那一行才打勾。点任意一步可以看它的真实数据（检查器），上下文那一步还能看完整 prompt。

## 一轮请求会经过哪些步骤 The stages

| 步骤 | 做什么 | 参考 |
|---|---|---|
| 接收与校验 Receive | 是不是空的、有没有超过 2000 字、上一条是不是还在跑 | 系统 A |
| 隐私脱敏 Redact | 手机号、邮箱等换成 `[PHONE_1]` 这类占位符；存进数据库的也是占位符 | 系统 A |
| 意图路由 Routing | 先用规则判断（闲聊、纠正、引用），规则判断不了的短句再问模型 | 系统 A、B |
| 快速通道 Fast Path | 「你好」「谢谢」直接用模板回答，0 次模型调用 | 系统 A |
| 纠正检测 Correction | 「不对，我是说…」：找出上一轮，告诉模型要改的是什么 | 系统 B |
| 引用话题 Reference | 「第二个」「那它…」：找出指的是什么；找不到就反问，不乱猜 | 系统 A、B |
| 记忆提取 Memory Recall | 最近 3 组对话 + 长期记忆本 + 用 embedding 找回更早的相关对话 | 系统 B |
| 上下文检查 Context Check | 最近 3 轮够不够理解这句话？不够就扩到 5 轮；还不够就直接问你，绝不靠猜。模型要指出「那两个」这类词并原文引用它指的内容，代码核对引用确实在前文里 | 系统 B |
| 上下文组装 Context | 把系统指令、编号材料 [M1]…、最近对话、新问题拼成模型要读的 prompt | 系统 B |
| 证据快照 Evidence | 记下模型到底看到了哪些材料，并给整个 prompt 算一个指纹 | 系统 B |
| LLM 生成 Generation | Qwen3 4B 一个 token 一个 token 地生成，实时送到左边 | 系统 A |
| 输出校验 Validation | 空回答就去掉历史重问一次；检查引用的 [M#] 是不是真的给过；把占位符换回原值 | 系统 A、B |
| 保存 Persist | 一问一答存进 SQLite，再算 embedding 供以后检索 | 系统 B |
| 长期记忆 Long-term Memory | 让模型挑出值得长期记住的事实；每条都要能对上原文引用，对不上就丢掉 | 系统 B |

### 路线 Routes

| 路线 | 例子 | 特点 |
|---|---|---|
| 闲聊快速通道 | 「你好」 | 不调用模型 |
| 普通问答 | 「什么是向量数据库？」 | 最完整的一条 |
| 引用话题 | 「第二个有什么优点？」「为什么？」 | 先解析指代 |
| 纠正回看 | 「不对，我是说 Redis」 | 带上被纠正的那一轮 |
| 需要澄清 | 「第二个呢？」（前面没有列表），或 5 轮里都找不到「它」指什么 | 直接反问，不调用回答模型 |

每轮都先走「判断中」的三步（接收、脱敏、路由），路由决定后，右边会把后面的步骤补上。

## 建议的体验顺序 Things to try

1. 点「示例 Demo → 上下文不够时」，看「上下文检查」怎么从 3 轮扩到 5 轮、找不到时怎么反问。
2. 点「示例 Demo → 记忆是怎么工作的」，看事实飞进记忆本，最后一句怎么把第一句找回来（看「记忆提取」那一步的相似度分数）。
3. 点「示例 Demo → 五条路线巡礼」，打开「详细」看每轮的路线怎么变。
4. 点「示例 Demo → 隐私脱敏」，在「隐私脱敏」和「输出校验」两步看手机号被换掉又换回来。
5. 打开「单步」，自己问一个问题，一步一步看。
6. 在「上下文组装」那一步点「完整 Prompt」：这就是模型这次读到的全部内容。

## 和真实系统的差别 What is simplified

- 没有登录、权限和多用户；对话 id 存在浏览器里。
- 记忆存在本地 SQLite（`data/flow-sim.db`），没有 Redis 缓存。
- 长期记忆每轮同步提取；系统 B 是后台任务，并且要用户同意才运行。
- 规则（指代词、纠正用语）只覆盖常见说法；判断用了哪条规则会显示在「意图路由」里。
- 上下文检查靠 4B 小模型找指代并引用原文，代码只能核对「引用确实在前文里」，不能保证它就是对的那一段；小模型有时会判得偏严，多问一句。
- 脱敏用的是简单的正则表达式，真实系统会用专门的个人信息识别工具。

## 目录 Layout

```text
backend/                 Python 3.12 + FastAPI（用 uv 管理）
  app/main.py            接口：/api/chat/stream (SSE)、/api/conversations/{id}/memory、/clear、/api/health
  app/events.py          步骤和路线的固定清单、SSE 事件格式
  app/pipeline/          每个步骤一个文件，runner.py 按路线依次执行
  app/store.py           SQLite：对话、embedding、长期事实
  app/memory.py          短期记忆和相似度检索
  app/routing.py         路由规则
  app/redaction.py       脱敏
  app/summary.py         长期事实的提取格式和校验
  tests/                 pytest
frontend/                Vite + React + Tailwind + Motion
  src/flow/stages.ts     每一步的中英文标题和解释
  src/hooks/usePlayback.ts  右边的放慢回放
  src/components/        聊天、记忆本、飞行动画、流程卡片和路线图
scripts/                 npm run setup / npm run dev
data/                    SQLite 数据文件（不进 git）
```

## 常用命令 Commands

| 命令 | 作用 |
|---|---|
| `npm run setup` | 安装后端依赖、检查 Ollama、拉取模型（可以重复运行） |
| `npm run dev` | 同时启动后端和前端 |
| `npm test` | 运行后端测试 |
| `npm run build` | 前端类型检查和打包 |

设置在 `.env`（参考 `.env.example`）：模型名、端口、数据库位置。改后端代码时可以设 `BACKEND_RELOAD=1` 让它自动重启。

## 进度 Status

- [x] P0 骨架：健康检查、左右分栏
- [x] P1 最短链路：聊天和流式回答（真实 token streaming，SSE）
- [x] P2 workflow 显示：当前步骤卡片、路线视图、亮灯、速度与单步控制
- [x] P3 记忆：SQLite、成对短期记忆、向量检索、记忆面板
- [x] P4 路由、脱敏、快速通道、纠正、引用话题、澄清
- [x] P5 长期记忆：带原文引用校验的事实、记忆本、飞入动画
- [x] P6 检查器、证据快照与输出校验、示例剧本、回放
- [x] P7 打磨：错误状态、骨架屏、数字滚动、减少动态效果
- [ ] P8 工具调用路线（按计划不做）
