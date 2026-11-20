import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { configDefaults, defineConfig } from "vitest/config";
import site from "./content/site.json" with { type: "json" };

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// Writes the page title from content/site.json into index.html, so the
// title is present before any JavaScript runs and the name lives in one place.
function siteTitle(): Plugin {
  return {
    name: "site-title",
    // Pages that set their own <title> (such as the test-only slide preview)
    // keep it, so no page ends up with two.
    transformIndexHtml: (html) =>
      /<title>/i.test(html)
        ? []
        : [{ tag: "title", children: escapeHtml(site.name), injectTo: "head" }],
  };
}

export default defineConfig({
  plugins: [react(), siteTitle()],
  test: {
    environment: "jsdom",
    include: [
      "src/**/*.test.{ts,tsx}",
      "tests/unit/**/*.test.{ts,mjs}",
      "tests/node/**/*.test.ts",
    ],
    // Time-zone tests need TZ set at process start: npm run test:timezones.
    exclude: [...configDefaults.exclude, "**/*.tz.test.tsx"],
    setupFiles: ["src/test/setup.ts"],
  },
});
