// Shared by setup.mjs and dev.mjs: project paths and settings from .env.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const BACKEND_DIR = join(ROOT, "backend");
export const FRONTEND_DIR = join(ROOT, "frontend");
export const ENV_FILE = join(ROOT, ".env");
export const ENV_EXAMPLE = join(ROOT, ".env.example");

/** Load .env into process.env. Variables already set in the shell win. */
export function loadEnv() {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  return {
    ollamaHost: process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434",
    chatModel: process.env.CHAT_MODEL ?? "qwen3:4b-instruct",
    embedModel: process.env.EMBED_MODEL ?? "qwen3-embedding:0.6b",
    backendPort: process.env.BACKEND_PORT ?? "8787",
    frontendPort: process.env.FRONTEND_PORT ?? "5173",
  };
}
