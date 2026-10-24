// npm run setup: everything after `npm install`, safe to run again.
//
// 1. create .env from .env.example if it is missing
// 2. uv sync: download Python 3.12 if needed and install the backend
// 3. check Ollama is running
// 4. pull whichever of the two models is missing
//
// Each step skips itself when already done and stops with a clear next step
// when it cannot continue.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { BACKEND_DIR, ENV_EXAMPLE, ENV_FILE, loadEnv } from "./env.mjs";

const step = (n, zh, en) => console.log(`\n[${n}/4] ${zh} · ${en}`);
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (lines) => {
  console.error("");
  for (const line of lines) console.error(`  ✗ ${line}`);
  process.exit(1);
};

const has = (cmd) => spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;

// 1. .env
step(1, "配置文件", "Config file");
if (existsSync(ENV_FILE)) {
  ok(".env 已存在 · already exists");
} else {
  copyFileSync(ENV_EXAMPLE, ENV_FILE);
  ok("已从 .env.example 创建 .env · created from .env.example");
}
const env = loadEnv();

// 2. Python backend
step(2, "安装后端依赖", "Backend dependencies (uv sync)");
if (!has("uv")) {
  fail([
    "找不到 uv · uv not found",
    "Windows: winget install --id astral-sh.uv --exact",
    "macOS:   brew install uv",
    "装完后重新打开终端 · Reopen the terminal after installing",
  ]);
}
if (spawnSync("uv", ["sync"], { cwd: BACKEND_DIR, stdio: "inherit" }).status !== 0) {
  fail(["uv sync 失败，请查看上面的报错 · uv sync failed, see the error above"]);
}
ok("后端依赖已就绪 · backend ready");

// 3. Ollama
step(3, "检查 Ollama", "Check Ollama");
let installed;
try {
  const res = await fetch(`${env.ollamaHost}/api/tags`, { signal: AbortSignal.timeout(3000) });
  installed = new Set((await res.json()).models.map((m) => m.name));
} catch {
  fail(
    has("ollama")
      ? [
          `Ollama 已安装但没有运行 · Ollama is installed but not running (${env.ollamaHost})`,
          "打开 Ollama 应用，或运行 ollama serve · Open the Ollama app, or run: ollama serve",
          "然后再运行 npm run setup · Then run npm run setup again",
        ]
      : [
          "找不到 Ollama · Ollama not found",
          "Windows: winget install --id Ollama.Ollama --exact",
          "macOS:   brew install ollama",
          "或从 https://ollama.com 下载 · or download from https://ollama.com",
        ],
  );
}
ok(`Ollama 正在运行 · running at ${env.ollamaHost}`);

// 4. Models
step(4, "下载模型", "Models");
const canonical = (name) => (name.includes(":") ? name : `${name}:latest`);
for (const model of [env.chatModel, env.embedModel]) {
  if (installed.has(canonical(model))) {
    ok(`${model} 已下载 · already downloaded`);
    continue;
  }
  if (!has("ollama")) {
    fail([`缺少模型 ${model}，需要 ollama 命令来下载 · ${model} is missing and the ollama command is needed to pull it`]);
  }
  console.log(`  ↓ ollama pull ${model}`);
  if (spawnSync("ollama", ["pull", model], { stdio: "inherit" }).status !== 0) {
    fail([`下载 ${model} 失败，重新运行会从断点继续 · Pulling ${model} failed; running again resumes it`]);
  }
  ok(`${model} 下载完成 · downloaded`);
}

console.log("\n全部就绪 · All set. 运行 · Run: npm run dev\n");
