# AI Flow Simulator — 安装指南 Setup Guide

> **给人看的**：把这个文件交给你的 AI 助手（Claude Code、Codex、Cursor 等），对它说：「按照 SETUP.md 帮我把这个项目装好并跑起来」。
>
> **给 AI 助手看的**：下面是按顺序执行的步骤。每一步都先**检查**，已满足就跳过；未满足才安装。每步做完都要运行「验证」命令确认成功，再进入下一步。

---

## 0. 规则（AI 助手必须遵守）

1. **安装任何软件之前，先告诉用户要装什么、多大，得到同意再装。**
2. 只安装本文列出的工具，不修改其他系统设置。
3. 所有命令都在**项目根目录**（本文件所在的文件夹）执行，除非步骤里另有说明。
4. 某一步失败时，先看第 6 节「常见问题」；仍然解决不了，就停下来，把**完整报错**给用户看，不要猜着改。
5. 本项目完全在本机运行，不需要任何 API key、账号或云服务。如果有步骤要求输入密钥，说明出错了。

## 1. 需要什么

| 工具 | 用途 | 最低版本 |
|---|---|---|
| Node.js (LTS) | 前端，以及运行 `npm` 脚本 | 20.19（或 22.12 以上） |
| uv | 管理 Python 后端；会自动下载 Python 3.12，**不需要另外装 Python** | 0.5 |
| Ollama | 在本机运行 AI 模型 | 0.6 |

硬件建议：内存 ≥ 8 GB，磁盘空余 ≥ 5 GB（两个模型合计约 3.1 GB）。有独立显卡更快，没有也能跑，只是回答慢一些。

## 2. 检查已安装的工具

逐条运行，记录哪些命令报「找不到命令」：

```bash
node -v
```

```bash
uv --version
```

```bash
ollama --version
```

- 三条都正常输出版本号，并且版本不低于第 1 节的最低版本：跳到第 4 节。
- 有任何一条失败或版本过低：只为缺少的工具执行第 3 节。

## 3. 安装缺少的工具

### Windows（使用系统自带的 winget）

只运行缺少的那一行：

```powershell
winget install --id OpenJS.NodeJS.LTS --exact --accept-source-agreements --accept-package-agreements
```

```powershell
winget install --id astral-sh.uv --exact --accept-source-agreements --accept-package-agreements
```

```powershell
winget install --id Ollama.Ollama --exact --accept-source-agreements --accept-package-agreements
```

装完后，当前终端还看不到新命令。刷新 PATH（或者关掉终端重新打开）：

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

### macOS（使用 Homebrew）

没有 Homebrew 的话，先请用户从 https://brew.sh 安装。然后运行：

```bash
brew install node uv ollama
```

### Linux

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Node.js 请用发行版的包管理器安装，或者使用 https://nodejs.org 的 LTS 版本。

**验证**：重新执行第 2 节的三条命令，三条都必须输出版本号。

## 4. 启动 Ollama 并下载模型

先确认 Ollama 服务在运行：

```bash
ollama list
```

- 输出一个表格（哪怕是空的）：服务正常。
- 报 `could not connect to ollama` 或类似错误：Windows/macOS 从开始菜单或启动台打开 **Ollama** 应用；Linux 运行 `ollama serve`（另开一个终端，保持运行）。然后再执行一次 `ollama list`。

下载两个模型（只需一次，约 3.1 GB；`npm run setup` 也会自动做这一步）：

```bash
ollama pull qwen3:4b-instruct
```

```bash
ollama pull qwen3-embedding:0.6b
```

**验证**：`ollama list` 的输出里同时出现 `qwen3:4b-instruct` 和 `qwen3-embedding:0.6b`。

## 5. 安装项目依赖并启动

在项目根目录依次执行：

```bash
npm install
```

```bash
npm run setup
```

```bash
npm run dev
```

| 命令 | 做什么 |
|---|---|
| `npm install` | 安装前端依赖（JavaScript） |
| `npm run setup` | 用 `uv sync` 下载 Python 3.12 和后端依赖；检查 Ollama 是否在运行；缺哪个模型就拉哪个。可以重复运行，已完成的部分会跳过 |
| `npm run dev` | 同时启动后端和前端。按 `Ctrl+C` 两个一起停止 |

**验证**：

1. 终端里出现前端地址（默认 `http://localhost:5173`），用浏览器打开。
2. 页面右上角显示绿色的「qwen3:4b-instruct 已就绪 · Ready」。
3. 在左侧聊天框输入「你好」，右侧 workflow 开始依次亮起各个步骤，左侧出现回答。
4. 再输入「我的猫叫小白」，回答完以后，「猫的名字：小白」会飞进左上角的「📒 记忆本」。

四项都通过，安装完成。端口、模型名和数据库位置可以在 `.env` 中修改（参考 `.env.example`）。对话和记忆保存在 `data/flow-sim.db`；想从头开始，可以在页面上点「记忆 Memory → 清空记忆」，或者在停止 `npm run dev` 后删除这个文件。

装好后，可以让用户读 [README.md](README.md) 里的「界面导览」和「建议的体验顺序」。

## 6. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| `winget` 找不到 | Windows 版本较旧，或者没有「应用安装程序」 | 让用户从 Microsoft Store 安装「App Installer / 应用安装程序」，或者到各官网手动下载：nodejs.org、docs.astral.sh/uv、ollama.com |
| 安装后命令仍然找不到 | 终端 PATH 没刷新 | 执行第 3 节的 PATH 刷新命令，或者重开终端 |
| `ollama pull` 很慢或中断 | 网络问题 | 重新运行同一条命令，会从断点继续 |
| `npm install` 报网络错误 | 访问 npm 源较慢 | 请用户决定是否切换镜像源，例如 `npm config set registry https://registry.npmmirror.com`。**这是全局设置，须用户同意** |
| `uv sync` 下载 Python 失败 | 网络问题 | 重试 `npm run setup`；仍然失败就把报错给用户看 |
| `npm run dev` 提示「端口 … 已被占用」（或 `EADDRINUSE`） | 上一次的 `npm run dev` 没关掉，或者别的程序占了端口 | 关掉之前的终端窗口（或结束占用端口的程序），或者在 `.env` 里换一个端口 |
| 回答非常慢 | 模型在 CPU 上跑 | 回答期间运行 `ollama ps`，看 `PROCESSOR` 一列。显示 `100% CPU` 说明没用上显卡：可以接受，只是慢；或者更新显卡驱动后重试 |
| 页面右上角显示「Ollama 未启动 · Not running」或「缺少模型 · Missing …」 | Ollama 没启动，或者模型没下载 | 回到第 4 节，或者重新运行 `npm run setup` |
| 页面右上角显示「后端未启动 · Backend offline」 | 后端没跑起来，或者启动时报错 | 看 `npm run dev` 终端里的报错；确认已经运行过 `npm run setup` |

## 7. 卸载（可选）

- 删除项目文件夹即可清除项目本身，包括 `.venv`、`node_modules` 和 `data/` 里的对话记录。
- 删除模型：`ollama rm qwen3:4b-instruct` 和 `ollama rm qwen3-embedding:0.6b`。
- 工具本身用系统的卸载方式移除（Windows：`winget uninstall --id <上面的 ID>`）。**删除前先向用户确认。**
