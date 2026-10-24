import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// `npm run dev` loads the project's .env before starting Vite, so the ports
// come from there. The defaults match .env.example.
const frontendPort = Number(process.env.FRONTEND_PORT ?? 5173);
const backendPort = Number(process.env.BACKEND_PORT ?? 8787);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: frontendPort,
    strictPort: true,
    proxy: {
      "/api": `http://127.0.0.1:${backendPort}`,
    },
  },
});
