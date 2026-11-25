// @vitest-environment node
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The local CMS demo's disposable copy, made for real. The editor's folder
// guard, which refuses any other folder, is tested in
// tests/unit/admin-folder-guard.test.ts and tests/e2e/cms-editor.spec.ts.
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const run = promisify(execFile);
const COPY_SCRIPT = join(REPO, "scripts/cms-demo-copy.ts");

interface Result {
  code: number;
  stdout: string;
  stderr: string;
}

function node(script: string, args: string[], cwd: string): Promise<Result> {
  return run(process.execPath, [script, ...args], { cwd }).then(
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
        stderr: failure.stderr ?? "",
      };
    },
  );
}

const git = async (cwd: string, ...args: string[]) =>
  (await run("git", args, { cwd })).stdout.trim();

let root: string;
let source: string;
let copy: string;

/**
 * cms:demo-copy takes no arguments and always makes ../gwep-cst-cms-demo, so
 * each case clones this repository into its own temporary folder and runs
 * the script (this working copy's version) from that clone. Returns the
 * clone and where its demo copy goes.
 */
async function cloneAndCopy(name: string) {
  const folder = join(root, name);
  await mkdir(folder);
  const clone = join(folder, "gwep-cst");
  await git(folder, "clone", "--quiet", REPO, clone);
  await symlink(join(REPO, "node_modules"), join(clone, "node_modules"));
  const made = await node(COPY_SCRIPT, [], clone);
  expect(made.code, made.stderr).toBe(0);
  return { clone, copy: join(folder, "gwep-cst-cms-demo") };
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cms-demo-"));
  ({ clone: source, copy } = await cloneAndCopy("main"));
}, 120_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("npm run cms:demo-copy", () => {
  it("makes a clone of the current commit on main, with no remotes", async () => {
    expect(await git(copy, "remote")).toBe("");
    expect(await git(copy, "branch", "--show-current")).toBe("main");
    expect(await git(copy, "rev-parse", "HEAD")).toBe(
      await git(REPO, "rev-parse", "HEAD"),
    );
    expect(await git(copy, "status", "--porcelain")).toBe("");
  });

  it("writes a marker inside .git, sets a demo identity and excludes the node_modules link", async () => {
    const marker = JSON.parse(
      await readFile(join(copy, ".git/cms-demo-copy.json"), "utf8"),
    ) as {
      commit: string;
    };
    expect(marker.commit).toBe(await git(REPO, "rev-parse", "HEAD"));
    expect(await git(copy, "config", "user.email")).toBe("cms-demo@localhost");
    // Compared as real paths: macOS reaches temp folders through /var and
    // /private/var.
    expect(await realpath(await readlink(join(copy, "node_modules")))).toBe(
      await realpath(join(source, "node_modules")),
    );
    expect(await readFile(join(copy, ".git/info/exclude"), "utf8")).toMatch(
      /^node_modules$/m,
    );
  });

  it("refuses an existing destination", async () => {
    const again = await node(COPY_SCRIPT, [], source);
    expect(again.code).toBe(1);
    expect(again.stderr).toContain(`${copy} already exists`);
  });
});
