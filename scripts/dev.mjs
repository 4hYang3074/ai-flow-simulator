// npm run dev: start the backend and the frontend together.
// Ctrl+C stops both; if either one exits, the other is stopped too.

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { BACKEND_DIR, ENV_FILE, FRONTEND_DIR, ROOT, loadEnv } from "./env.mjs";

if (!existsSync(ENV_FILE) || !existsSync(join(BACKEND_DIR, ".venv"))) {
  console.error("还没有完成安装，请先运行 npm run setup · Run npm run setup first");
  process.exit(1);
}
const env = loadEnv();

/** True when something already answers on this port. */
const inUse = (port) =>
  new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port: Number(port) });
    socket.setTimeout(500);
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("timeout", () => (socket.destroy(), resolve(false)));
    socket.once("error", () => resolve(false));
  });

// Windows lets a second server bind a port that is already taken, and then
// requests reach whichever one answers: an old backend left running would
// silently serve old code. Refuse to start instead.
for (const [name, port] of [["后端 backend", env.backendPort], ["前端 frontend", env.frontendPort]]) {
  if (await inUse(port)) {
    console.error(
      `端口 ${port} 已被占用（${name}）。可能是上一次的 npm run dev 没有关掉：关掉它，或在 .env 里换一个端口。\n` +
        `Port ${port} (${name}) is already in use, probably by an earlier npm run dev. Stop it or change the port in .env.`,
    );
    process.exit(1);
  }
}

// Auto-reload on backend file changes is opt-in (BACKEND_RELOAD=1): on
// Windows its restart can hang and end the whole dev session, and someone
// just using the simulator never edits the code.
const reload = process.env.BACKEND_RELOAD === "1" ? ["--reload"] : [];

const children = [
  spawn(
    "uv",
    ["run", "uvicorn", "app.main:app", ...reload, "--host", "127.0.0.1", "--port", env.backendPort],
    { cwd: BACKEND_DIR, stdio: "inherit" },
  ),
  // Run Vite's own entry with this Node, so no shell is needed on Windows.
  spawn(process.execPath, [join(ROOT, "node_modules", "vite", "bin", "vite.js")], {
    cwd: FRONTEND_DIR,
    stdio: "inherit",
  }),
];

console.log(`\n打开 · Open: http://localhost:${env.frontendPort}`);
if (process.env.FRONTEND_HOST === "0.0.0.0") {
  // Shared on the network: list the addresses others can use.
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254"))
    .map((a) => `http://${a.address}:${env.frontendPort}`);
  console.log(`同一网络里的其他人可以打开 · Others on the same network: ${lan.join("  ")}`);
}
console.log("");

/** Stop a child and everything it started (uvicorn's reloader has workers). */
const killTree = (child) => {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
};

let stopping = false;
const stopAll = (code) => {
  if (stopping) return;
  stopping = true;
  children.forEach(killTree);
  process.exitCode = code;
};

for (const child of children) {
  child.on("exit", (code) => stopAll(code ?? 0));
  child.on("error", (err) => {
    console.error(`无法启动 · Could not start: ${err.message}`);
    stopAll(1);
  });
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
process.on("exit", () => children.forEach(killTree));
