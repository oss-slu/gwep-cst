// Writes public/admin/config.yml from the slide registry. Takes no arguments.
// Usage: npm run cms:generate
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  buildCmsConfig,
  CONFIG_PATH,
  serializeCmsConfig,
} from "./cms/config.ts";

await mkdir(dirname(CONFIG_PATH), { recursive: true });
await writeFile(CONFIG_PATH, serializeCmsConfig(buildCmsConfig()), "utf8");
console.log(`cms:generate: wrote ${CONFIG_PATH}`);
