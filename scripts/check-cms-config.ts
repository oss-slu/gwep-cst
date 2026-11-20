// Fails if public/admin/config.yml is missing or differs from what the slide
// registry generates. Takes no arguments. Usage: npm run cms:check
import { readFile } from "node:fs/promises";
import {
  buildCmsConfig,
  CONFIG_PATH,
  serializeCmsConfig,
} from "./cms/config.ts";

const expected = serializeCmsConfig(buildCmsConfig());

let committed: string;
try {
  committed = await readFile(CONFIG_PATH, "utf8");
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`cms:check: cannot read ${CONFIG_PATH}: ${reason}`);
  console.error("Run npm run cms:generate and commit the result.");
  process.exit(1);
}

if (committed === expected) {
  console.log(`cms:check: ${CONFIG_PATH} is up to date.`);
} else {
  console.error(
    `cms:check: ${CONFIG_PATH} is out of date with the slide registry.`,
  );
  console.error("Run npm run cms:generate and commit the result.");
  process.exitCode = 1;
}
