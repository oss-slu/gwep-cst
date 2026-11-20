// Runs the time-zone tests once per zone, each in a new Vitest process started
// with TZ set, so the zone is in place before any code reads it.
// Takes no arguments. Usage: npm run test:timezones
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ZONES = ["America/Chicago", "UTC", "Pacific/Auckland"];
const VITEST = join("node_modules", "vitest", "vitest.mjs");

const failed: string[] = [];
for (const zone of ZONES) {
  console.log(`\ntest:timezones: TZ=${zone}`);
  const result = spawnSync(
    process.execPath,
    [VITEST, "run", "--config", "vitest.timezones.config.ts"],
    { stdio: "inherit", env: { ...process.env, TZ: zone } },
  );
  if (result.status !== 0) failed.push(zone);
}

if (failed.length > 0) {
  console.error(`\ntest:timezones: failed in ${failed.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`\ntest:timezones: passed in ${ZONES.join(", ")}`);
}
