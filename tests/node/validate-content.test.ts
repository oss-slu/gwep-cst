// @vitest-environment node
import { execFile } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The script always checks content/sessions/ in the folder it runs from, so
// each case runs it from its own small project folder.
const SCRIPT = fileURLToPath(
  new URL("../../scripts/validate-content.ts", import.meta.url),
);
const SESSIONS = "content/sessions";

function fixture(name: string): string {
  return fileURLToPath(
    new URL(`../fixtures/sessions/${name}`, import.meta.url),
  );
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runValidator(cwd: string): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile("node", [SCRIPT], { cwd }, (error, stdout, stderr) => {
      const code =
        error === null ? 0 : typeof error.code === "number" ? error.code : 1;
      resolve({ code, stdout, stderr });
    });
  });
}

/** Runs a test in a temporary project folder and always removes it. */
async function inTempProject(
  test: (project: string) => Promise<void>,
): Promise<void> {
  const project = await mkdtemp(join(tmpdir(), "validate-content-"));
  try {
    await test(project);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
}

describe("validate-content", () => {
  it("passes valid sessions", async () => {
    const result = await runValidator(fixture("valid"));
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("2 session files in content/sessions");
    expect(result.stderr).toBe("");
  });

  it("reports every invalid field with its file and path", async () => {
    const result = await runValidator(fixture("invalid-fields"));
    const file = `${SESSIONS}/orientation.json`;
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`${file}: number: `);
    expect(result.stderr).toContain(`${file}: Unrecognized key: "titel"`);
    expect(result.stderr).toContain(
      `${file}: slides[1].id: Slide id "welcome" is used more than once`,
    );
  });

  it("reports malformed JSON with the line and column on Node 24", async () => {
    const result = await runValidator(fixture("malformed"));
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(
      /content\/sessions\/broken\.json: Not valid JSON: .*\(line 4 column 3\)/,
    );
  });

  it("reports problems across files", async () => {
    const result = await runValidator(fixture("set-problems"));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      `${SESSIONS}/copy.json: slug: Slug "orientation" must match the file name "copy"`,
    );
    expect(result.stderr).toContain("number: Session number 9 is also used by");
  });

  it("passes an existing empty folder", async () => {
    const result = await runValidator(fixture("empty"));
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("0 session files in content/sessions");
  });

  it("fails when the session folder is missing and names it", async () => {
    await inTempProject(async (project) => {
      const result = await runValidator(project);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        `cannot read session folder "${SESSIONS}"`,
      );
      expect(result.stderr).toContain("ENOENT");
    });
  });

  it("fails when the session folder is unreadable and names it", async (context) => {
    await inTempProject(async (project) => {
      const folder = join(project, SESSIONS);
      await mkdir(folder, { recursive: true });
      await chmod(folder, 0o000);
      try {
        const stillReadable = await readdir(folder).then(
          () => true,
          () => false,
        );
        if (stillReadable) {
          context.skip(
            "Removing permissions has no effect for this account (for example root)",
          );
        }
        const result = await runValidator(project);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain(
          `cannot read session folder "${SESSIONS}"`,
        );
        expect(result.stderr).toContain("EACCES");
      } finally {
        await chmod(folder, 0o700);
      }
    });
  });

  it("rejects a symbolic link named like a session file", async () => {
    await inTempProject(async (project) => {
      const folder = join(project, SESSIONS);
      await mkdir(folder, { recursive: true });
      const target = join(project, "outside.txt");
      await copyFile(
        join(fixture("valid"), SESSIONS, "orientation.json"),
        target,
      );
      await symlink(target, join(folder, "orientation.json"));

      const result = await runValidator(project);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        `${SESSIONS}/orientation.json: Session files must be regular files, not symbolic links`,
      );
    });
  });

  it("rejects a folder named like a session file", async () => {
    await inTempProject(async (project) => {
      await mkdir(join(project, SESSIONS, "orientation.json"), {
        recursive: true,
      });

      const result = await runValidator(project);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        `${SESSIONS}/orientation.json: Session files must be regular files`,
      );
    });
  });
});
