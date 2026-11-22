// @vitest-environment node
import { execFile } from "node:child_process";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { haveMediaTools, padPng, picture } from "./media-fixtures.ts";

// Runs the real `npm run build` in a disposable copy of the project with one
// invalid media file, to show the media check blocks the build before Vite
// starts. Needs ffmpeg and ffprobe on PATH (CI installs them).
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const run = promisify(execFile);
const tools = await haveMediaTools();
const required = process.env.CI !== undefined;

let copy: string | undefined;
afterAll(async () => {
  if (copy !== undefined) await rm(copy, { recursive: true, force: true });
});

/** Copies the project's files (tracked and new, not ignored) to a temp folder. */
async function disposableCopy(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "build-gate-"));
  const { stdout } = await run(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: REPO, maxBuffer: 10_000_000 },
  );
  for (const file of stdout.split("\0").filter((name) => name !== "")) {
    const from = join(REPO, file);
    if (
      !(await access(from).then(
        () => true,
        () => false,
      ))
    )
      continue;
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await copyFile(from, join(dir, file));
  }
  await symlink(join(REPO, "node_modules"), join(dir, "node_modules"));
  return dir;
}

describe.skipIf(!tools && !required)("the production build gate", () => {
  it("npm run build fails on invalid media, names the file and limit, and never starts Vite", async () => {
    copy = await disposableCopy();
    await mkdir(join(copy, "public/media/test"), { recursive: true });
    const file = join(copy, "public/media/test/too-big.png");
    await picture(file);
    await padPng(file, 2_000_001);

    const result = await run("npm", ["run", "build"], { cwd: copy }).then(
      (output) => ({ code: 0, ...output }),
      (error: unknown) => {
        // execFile rejects with the exit code and the captured output.
        const failure = error as {
          code?: number;
          stdout?: string;
          stderr?: string;
        };
        return {
          code: failure.code ?? 1,
          stdout: failure.stdout ?? "",
          stderr: failure.stderr ?? String(error),
        };
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.code).not.toBe(0);
    expect(output).toContain(
      "public/media/test/too-big.png: image is 2000001 bytes (2.00 MB), over the 2000000 bytes (2.00 MB) limit",
    );
    // The steps after validate-media never ran.
    expect(output).not.toContain("tsc --noEmit");
    expect(output).not.toMatch(/vite v\d/);
    expect(
      await access(join(copy, "dist")).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
  }, 120_000);

  it("npm run build fails on an invalid registered slide, names the file and field path, and never starts Vite", async () => {
    copy = await disposableCopy();
    const sessionFile = join(copy, "content/sessions/orientation.json");
    const session = JSON.parse(await readFile(sessionFile, "utf8")) as {
      slides: { heading?: string }[];
    };
    const firstSlide = session.slides[0];
    if (firstSlide === undefined)
      throw new Error("Expected at least one slide");
    firstSlide.heading = "";
    await writeFile(sessionFile, JSON.stringify(session, null, 2));

    const result = await run("npm", ["run", "build"], { cwd: copy }).then(
      (output) => ({ code: 0, ...output }),
      (error: unknown) => {
        const failure = error as {
          code?: number;
          stdout?: string;
          stderr?: string;
        };
        return {
          code: failure.code ?? 1,
          stdout: failure.stdout ?? "",
          stderr: failure.stderr ?? String(error),
        };
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.code).not.toBe(0);
    expect(output).toContain(
      "content/sessions/orientation.json: slides[0].heading: Heading must not be empty",
    );
    expect(output).not.toContain("tsc --noEmit");
    expect(output).not.toMatch(/vite v\d/);
    expect(
      await access(join(copy, "dist")).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
  }, 120_000);
});
