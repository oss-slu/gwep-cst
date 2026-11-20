import { defineConfig, devices } from "@playwright/test";

const port = 4173;
const previewPort = 4175;

// Tests run against the production build, so they check what ships.
export default defineConfig({
  testDir: "tests/e2e",
  // Console output while running, plus an HTML report in playwright-report/
  // that CI uploads when a test fails.
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: `http://localhost:${String(port)}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `npm run build && npm run preview -- --port ${String(port)} --strictPort`,
      url: `http://localhost:${String(port)}`,
      reuseExistingServer: false,
    },
    {
      // Test-only slide preview page (tests/visual), served by the dev server
      // and never part of the production build.
      command: `npm run dev -- --port ${String(previewPort)} --strictPort`,
      url: `http://localhost:${String(previewPort)}/tests/visual/slides.html`,
      reuseExistingServer: false,
    },
  ],
});
