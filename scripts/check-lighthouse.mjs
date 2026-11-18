// Runs Lighthouse three times against the production build and checks the
// median of each metric against the budgets in docs/design/M0_DESIGN.md §2.3.
// Uses Lighthouse's default mobile profile (simulated slow 4G, slowed CPU).
// Usage: npm run build && node scripts/check-lighthouse.mjs
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { median, readMetrics } from "./lighthouse-metrics.mjs";

const PORT = 4174;
const URL_TO_TEST = `http://localhost:${String(PORT)}/`;
const RUNS = 3;
const STARTUP_TIMEOUT_MS = 30_000;
const REPORT_DIR = "lighthouse-reports";
const BIN = join("node_modules", ".bin");

const budgets = [
  { metric: "performance", label: "Performance score", min: 95 },
  { metric: "accessibility", label: "Accessibility score", min: 95 },
  { metric: "lcp", label: "Largest Contentful Paint (ms)", max: 2000 },
  { metric: "cls", label: "Cumulative Layout Shift", max: 0.1 },
];

const run = promisify(execFile);

async function waitForServer(server) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error("Preview server exited early.");
    try {
      if ((await fetch(URL_TO_TEST)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Preview server did not start within ${String(STARTUP_TIMEOUT_MS / 1000)} s.`,
  );
}

async function lighthouseRun(index) {
  const outputPath = join(REPORT_DIR, `run-${String(index)}.json`);
  await run(join(BIN, "lighthouse"), [
    URL_TO_TEST,
    "--only-categories=performance,accessibility",
    "--output=json",
    `--output-path=${outputPath}`,
    "--chrome-flags=--headless=new",
    "--quiet",
  ]);
  const report = JSON.parse(readFileSync(outputPath, "utf8"));
  return readMetrics(report, `Run ${String(index)}`);
}

function report(results) {
  let passed = true;
  console.log(
    `\nMetric | ${results.map((_, i) => `Run ${String(i + 1)}`).join(" | ")} | Median | Budget | Result`,
  );
  for (const budget of budgets) {
    const values = results.map((result) => result[budget.metric]);
    const value = median(values);
    const ok =
      budget.min !== undefined ? value >= budget.min : value <= budget.max;
    passed &&= ok;
    const limit =
      budget.min !== undefined
        ? `>= ${String(budget.min)}`
        : `<= ${String(budget.max)}`;
    const format = (n) =>
      budget.metric === "cls" ? n.toFixed(3) : n.toFixed(0);
    console.log(
      `${budget.label} | ${values.map(format).join(" | ")} | ${format(value)} | ${limit} | ${ok ? "pass" : "FAIL"}`,
    );
  }
  return passed;
}

if (!existsSync(join("dist", "index.html"))) {
  console.error("No production build found. Run npm run build first.");
  process.exit(1);
}
mkdirSync(REPORT_DIR, { recursive: true });

const server = spawn(
  join(BIN, "vite"),
  ["preview", "--port", String(PORT), "--strictPort"],
  {
    stdio: "ignore",
  },
);
const stopServer = () => {
  if (server.exitCode === null) server.kill("SIGTERM");
};
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopServer();
    process.exit(1);
  });
}

try {
  await waitForServer(server);
  const results = [];
  for (let index = 1; index <= RUNS; index += 1) {
    results.push(await lighthouseRun(index));
  }
  if (!report(results)) {
    console.error("\nLighthouse budgets not met.");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  stopServer();
}
