import { defineConfig, devices } from "@playwright/test";

const port = 4173;

// Tests run against the production build, so they check what ships.
export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: `http://localhost:${String(port)}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${String(port)} --strictPort`,
    url: `http://localhost:${String(port)}`,
    reuseExistingServer: false,
  },
});
