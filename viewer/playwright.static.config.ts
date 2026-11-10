import { defineConfig, devices } from "@playwright/test";

// The static site, served with no backend (`pnpm build:static` first). The first run in
// a browser profile downloads Pyodide from its CDN, hence the long timeouts.
const channel = process.env.PW_CHANNEL ?? (process.platform === "darwin" ? "chrome" : undefined);

export default defineConfig({
  testDir: "e2e-static",
  timeout: 300_000,
  retries: 0,
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, channel: channel || undefined },
    },
  ],
  webServer: {
    command: "pnpm exec vite preview --outDir dist-static --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
