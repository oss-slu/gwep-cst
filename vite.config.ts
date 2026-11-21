import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import type { Connect, Plugin } from "vite";
import {
  adminHeaders,
  demoAllowancesApply,
} from "./scripts/cms/local-admin.ts";
import { parseHeadersFile } from "./scripts/headers.ts";
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
 * The content editor at /admin on the local dev and preview servers, set up
 * the way the host serves it: /admin and /admin/index.html redirect to
 * /admin/, and every /admin response, redirects included, carries the
 * headers public/_headers gives that path.
 *
 * Only when this server serves a disposable demo copy (npm run
 * cms:demo-copy) and listens on loopback does it also allow the local Decap
 * backend and 'unsafe-eval' (needed by Decap 3.17.3). A regular checkout,
 * or any server exposed to the network, gets exactly the deployed policy.
 */
function localAdmin(): Plugin {
  const middleware =
    (demo: boolean): Connect.NextHandleFunction =>
    (request, response, next) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const path = url.pathname;
      if (path !== "/admin" && !path.startsWith("/admin/")) {
        next();
        return;
      }
      const rules = parseHeadersFile(readFileSync("public/_headers", "utf8"));
      for (const [name, value] of Object.entries(
        adminHeaders(rules, path, demo),
      )) {
        response.setHeader(name, value);
      }
      if (path === "/admin" || path === "/admin/index.html") {
        response.statusCode = 307;
        response.setHeader("Location", `/admin/${url.search}`);
        response.end();
        return;
      }
      if (path === "/admin/") request.url = `/admin/index.html${url.search}`;
      next();
    };
  const install = async (
    server: {
      middlewares: Connect.Server;
      config: { root: string; logger: { info: (message: string) => void } };
    },
    host: string | boolean | undefined,
  ) => {
    const demo = await demoAllowancesApply(server.config.root, host);
    if (demo) {
      server.config.logger.info(
        "local-admin: disposable demo copy on loopback, so /admin allows the local Decap backend and 'unsafe-eval'",
      );
    }
    server.middlewares.use(middleware(demo));
  };
  return {
    name: "local-admin",
    configureServer: (server) => install(server, server.config.server.host),
    configurePreviewServer: (server) =>
      install(server, server.config.preview.host),
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
  // The dependency cache lives in each project folder, not in node_modules,
  // so a CMS demo copy (which links this node_modules) never shares or
  // invalidates this project's cache while both dev servers run.
  cacheDir: ".vite",
  // Pre-bundle the router when the dev server starts. Otherwise Vite finds
  // it on the first page load and re-optimizes mid-run, which briefly loads
  // two copies of React (seen on the test-only player page).
  optimizeDeps: { include: ["wouter", "wouter/memory-location"] },
  plugins: [
    react(),
    siteTitle(),
    localAdmin(),
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
