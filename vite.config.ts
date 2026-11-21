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

/**
 * Test-only build mode (vite build --mode request-fixture). It adds the
 * sessions in tests/fixtures/requests/sessions/ to the app's session loaders,
 * so browser tests can show that opening one session never downloads
 * another. It writes to its own folder, with a manifest the tests use to name
 * each chunk. The production build never includes these files.
 */
const REQUEST_FIXTURE_MODE = "request-fixture";

function requestFixtureSessions(): Plugin {
  const pattern = '"/content/sessions/*.json"';
  return {
    name: "request-fixture-sessions",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith("/src/content/session-loaders.ts")) return;
      if (!code.includes(pattern)) {
        throw new Error(
          `session-loaders.ts no longer uses the glob ${pattern}`,
        );
      }
      return code.replace(
        pattern,
        `[${pattern}, "/tests/fixtures/requests/sessions/*.json"]`,
      );
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    siteTitle(),
    ...(mode === REQUEST_FIXTURE_MODE ? [requestFixtureSessions()] : []),
  ],
  ...(mode === REQUEST_FIXTURE_MODE && {
    build: { outDir: "dist-request-fixture", manifest: true },
  }),
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
}));
