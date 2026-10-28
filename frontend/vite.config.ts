import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// `npm run dev` loads the project's .env before starting Vite, so the ports
// come from there. The defaults match .env.example.
const frontendPort = Number(process.env.FRONTEND_PORT ?? 5173);
const backendPort = Number(process.env.BACKEND_PORT ?? 8787);
// "localhost" keeps the page on this computer. Set FRONTEND_HOST=0.0.0.0 to
// let others on the same network open it; the backend stays on 127.0.0.1 and
// is reached only through this proxy.
const frontendHost = process.env.FRONTEND_HOST ?? "localhost";

export default defineConfig({
  // Keep one report source: serve docs in development and include it in builds.
  publicDir: "../docs",
  plugins: [react(), tailwindcss()],
  server: {
    host: frontendHost,
    port: frontendPort,
    strictPort: true,
    proxy: {
      "/api": `http://127.0.0.1:${backendPort}`,
    },
  },
});
