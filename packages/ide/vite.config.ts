import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// VITE_RUNTIME_ADDR: host:port of the Speth's Screens runtime the IDE talks to.
// Default is localhost:3001 (local dev binary). Set to localhost:8080 (or
// panel-ip:8080) to point the IDE at a running container instead.
const runtimeAddr = process.env.VITE_RUNTIME_ADDR ?? "localhost:3001";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    strictPort: false,
    proxy: {
      "/api": `http://${runtimeAddr}`,
      "/ws": { target: `ws://${runtimeAddr}`, ws: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
