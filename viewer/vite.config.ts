/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The engine (`uv run qramsim serve`, port 8765) owns all physics; the dev server
// proxies /api to it. The user guide is read from ../docs/user-guide at build time.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { chunkSizeWarningLimit: 1500 }, // KaTeX fonts and styles dominate the bundle
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8765" },
    fs: { allow: [".."] },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
