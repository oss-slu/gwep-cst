// Fails when the JavaScript loaded by the first page view is over budget.
// Usage: node scripts/check-bundle-size.mjs [--max-kb 100]
// Sizes are gzip level 9, in kB (1 kB = 1000 bytes), as Vite reports them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = "dist";
const DEFAULT_MAX_KB = 100;

function readMaxKb(args) {
  const index = args.indexOf("--max-kb");
  if (index === -1) return DEFAULT_MAX_KB;
  const value = Number(args[index + 1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("--max-kb needs a positive number");
  }
  return value;
}

// Entry scripts and module preloads are what the browser fetches up front.
function initialScripts(html) {
  const tags = html.match(/<(script|link)\b[^>]*>/gi) ?? [];
  return tags
    .filter(
      (tag) => /type="module"/.test(tag) || /rel="modulepreload"/.test(tag),
    )
    .map((tag) => /(?:src|href)="([^"]+\.js)"/.exec(tag)?.[1])
    .filter((path) => path !== undefined);
}

const maxKb = readMaxKb(process.argv.slice(2));
const html = readFileSync(join(DIST, "index.html"), "utf8");
const scripts = initialScripts(html);
if (scripts.length === 0) {
  throw new Error(
    `No initial scripts found in ${DIST}/index.html. Run npm run build first.`,
  );
}

let totalKb = 0;
for (const path of scripts) {
  const kb =
    gzipSync(readFileSync(join(DIST, path)), { level: 9 }).length / 1000;
  totalKb += kb;
  console.log(`${path}  ${kb.toFixed(2)} kB gzip`);
}

console.log(
  `Initial JavaScript: ${totalKb.toFixed(2)} kB gzip (budget ${String(maxKb)} kB)`,
);
if (totalKb > maxKb) {
  console.error("Over budget.");
  process.exitCode = 1;
}
