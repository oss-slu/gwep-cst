import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Only the time-zone tests. scripts/test-timezones.ts runs this once per zone,
// in a separate process started with TZ set.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.tz.test.tsx"],
    setupFiles: ["src/test/setup.ts"],
  },
});
