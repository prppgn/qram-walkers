import { defineConfig, devices } from "@playwright/test";

// Starts the engine API and the Vite dev server, then drives the app in Chromium.
// On macOS the bundled Chromium of this Playwright version is refused by recent
// systems (code signature), so the installed Google Chrome is used there (temporary
// profile); set PW_CHANNEL to override, or to "" for the bundled browser.
const channel = process.env.PW_CHANNEL ?? (process.platform === "darwin" ? "chrome" : undefined);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, channel: channel || undefined },
    },
  ],
  webServer: [
    {
      command: "uv run qramsim serve --port 8765 --quiet",
      cwd: "../engine",
      url: "http://127.0.0.1:8765/api/health",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm dev --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
