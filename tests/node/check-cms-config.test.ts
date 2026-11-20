// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildCmsConfig,
  CONFIG_PATH,
  serializeCmsConfig,
} from "../../scripts/cms/config.ts";

const SCRIPT = fileURLToPath(
  new URL("../../scripts/check-cms-config.ts", import.meta.url),
);

function runCheck(
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile("node", [SCRIPT], { cwd }, (error, stdout, stderr) => {
      const code =
        error === null ? 0 : typeof error.code === "number" ? error.code : 1;
      resolve({ code, stdout, stderr });
    });
  });
}

/** Runs the check from a temporary project, optionally with a config file. */
async function checkWithConfig(contents?: string) {
  const project = await mkdtemp(join(tmpdir(), "cms-check-"));
  try {
    if (contents !== undefined) {
      await mkdir(join(project, "public/admin"), { recursive: true });
      await writeFile(join(project, CONFIG_PATH), contents, "utf8");
    }
    return await runCheck(project);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
}

describe("cms:check", () => {
  const fresh = serializeCmsConfig(buildCmsConfig());

  it("passes when the committed config is up to date", async () => {
    const result = await checkWithConfig(fresh);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("is up to date");
  });

  it("fails when the committed config is stale", async () => {
    const stale = fresh.replace('"label": "Session title"', '"label": "Title"');
    expect(stale).not.toBe(fresh);
    const result = await checkWithConfig(stale);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      `${CONFIG_PATH} is out of date with the slide registry`,
    );
    expect(result.stderr).toContain("Run npm run cms:generate");
  });

  it("fails when only whitespace differs", async () => {
    const result = await checkWithConfig(`${fresh}\n`);
    expect(result.code).toBe(1);
  });

  it("fails when the config is missing", async () => {
    const result = await checkWithConfig();
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`cannot read ${CONFIG_PATH}`);
  });
});
