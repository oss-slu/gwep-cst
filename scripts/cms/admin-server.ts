// The content editor at /admin on the local dev and preview servers, served
// the way the host serves it: /admin and /admin/index.html redirect to
// /admin/, and every /admin response, redirects included, carries exactly
// the headers public/_headers gives that path. No server adds anything to
// the editor's policy.
//
// The dev server serves the built editor (vite.admin.config.ts, built into
// .vite/admin on the first /admin request and again after admin/ changes)
// as plain files, not through its own module pipeline. That pipeline would
// add an inline React preamble the policy blocks, and Vite's live-reload
// client, which reloads the page when files change and so could interrupt
// the editor while it saves into the copy the dev server watches.
// public/admin/config.yml is still served live from public/.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import {
  build,
  type Connect,
  type Plugin,
  type PreviewServer,
  type ViteDevServer,
} from "vite";
import { effectiveHeaders, parseHeadersFile } from "../headers.ts";

/** Where the dev server builds the editor (inside the ignored .vite/). */
export const DEV_BUILD = ".vite/admin";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Sets the /admin headers and answers the host's redirects. Returns the
 * file asked for, relative to /admin/ ("index.html" for /admin/), or
 * undefined when the request is not for /admin or has been answered.
 */
function adminRequest(
  request: Connect.IncomingMessage,
  response: ServerResponse,
): string | undefined {
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.pathname;
  if (path !== "/admin" && !path.startsWith("/admin/")) return undefined;
  const rules = parseHeadersFile(readFileSync("public/_headers", "utf8"));
  for (const [name, value] of Object.entries(effectiveHeaders(rules, path))) {
    response.setHeader(name, value);
  }
  if (path === "/admin" || path === "/admin/index.html") {
    response.statusCode = 307;
    response.setHeader("Location", `/admin/${url.search}`);
    response.end();
    return undefined;
  }
  return path === "/admin/" ? "index.html" : path.slice("/admin/".length);
}

function devMiddleware(server: ViteDevServer): Connect.NextHandleFunction {
  const root = server.config.root;
  const output = resolve(root, DEV_BUILD);
  let built: Promise<void> | undefined;
  const buildEditor = () =>
    (built ??= build({
      configFile: resolve(root, "vite.admin.config.ts"),
      logLevel: "warn",
      build: { outDir: output, emptyOutDir: true },
    }).then(
      () => undefined,
      (error: unknown) => {
        built = undefined;
        throw error;
      },
    ));
  const source = resolve(root, "admin") + sep;
  for (const event of ["add", "change", "unlink"] as const) {
    server.watcher.on(event, (file: string) => {
      if (file.startsWith(source)) built = undefined;
    });
  }

  return (request, response, next) => {
    const file = adminRequest(request, response);
    if (file === undefined) {
      if (!response.writableEnded) next();
      return;
    }
    if (file === "config.yml") {
      next();
      return;
    }
    const path = resolve(output, decodeURIComponent(file));
    if (!path.startsWith(output + sep)) {
      response.statusCode = 404;
      response.end();
      return;
    }
    buildEditor()
      .then(() => readFile(path))
      .then(
        (body) => {
          response.setHeader(
            "Content-Type",
            CONTENT_TYPES[extname(path)] ?? "application/octet-stream",
          );
          response.setHeader("Cache-Control", "no-cache");
          response.end(body);
        },
        (error: unknown) => {
          const missing =
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT";
          if (!missing) server.config.logger.error(String(error));
          response.statusCode = missing ? 404 : 500;
          response.end(missing ? "" : "The editor could not be built.");
        },
      );
  };
}

function previewMiddleware(): Connect.NextHandleFunction {
  return (request, response, next) => {
    const file = adminRequest(request, response);
    if (file === "index.html") {
      const query = new URL(request.url ?? "/", "http://localhost").search;
      request.url = `/admin/index.html${query}`;
    }
    if (!response.writableEnded) next();
  };
}

export function localAdmin(): Plugin {
  return {
    name: "local-admin",
    configureServer: (server) => {
      server.middlewares.use(devMiddleware(server));
    },
    configurePreviewServer: (server: PreviewServer) => {
      server.middlewares.use(previewMiddleware());
    },
  };
}
