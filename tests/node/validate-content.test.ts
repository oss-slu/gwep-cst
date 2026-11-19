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
import { describe, expect, it } from "vitest";

const FIXTURES = "tests/fixtures/sessions";

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runValidator(folder: string): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      "node",
      ["scripts/validate-content.ts", folder],
      (error, stdout, stderr) => {
        const code =
          error === null ? 0 : typeof error.code === "number" ? error.code : 1;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

describe("validate-content", () => {
  it("passes valid sessions", async () => {
    const result = await runValidator(`${FIXTURES}/valid`);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("2 session files");
    expect(result.stderr).toBe("");
  });

  it("reports every invalid field with its file and path", async () => {
    const result = await runValidator(`${FIXTURES}/invalid-fields`);
    const file = `${FIXTURES}/invalid-fields/orientation.json`;
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`${file}: number: `);
    expect(result.stderr).toContain(
      `${file}: : Unrecognized key: "titel"`.replace(": : ", ": "),
    );
    expect(result.stderr).toContain(
      `${file}: slides[1].id: Slide id "welcome" is used more than once`,
    );
  });

  it("reports malformed JSON with the line and column on Node 24", async () => {
    const result = await runValidator(`${FIXTURES}/malformed`);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(
      /tests\/fixtures\/sessions\/malformed\/broken\.json: Not valid JSON: .*\(line 4 column 3\)/,
    );
  });

  it("reports problems across files", async () => {
    const result = await runValidator(`${FIXTURES}/set-problems`);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      `${FIXTURES}/set-problems/copy.json: slug: Slug "orientation" must match the file name "copy"`,
    );
    expect(result.stderr).toContain("number: Session number 9 is also used by");
  });

  it("rejects a symbolic link named like a session file", async () => {
    const folder = await mkdtemp(join(tmpdir(), "sessions-"));
    try {
      const target = join(folder, "outside.txt");
      await copyFile(`${FIXTURES}/valid/orientation.json`, target);
      await symlink(target, join(folder, "orientation.json"));

      const result = await runValidator(folder);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        `${join(folder, "orientation.json")}: Session files must be regular files, not symbolic links`,
      );
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it("rejects a folder named like a session file", async () => {
    const folder = await mkdtemp(join(tmpdir(), "sessions-"));
    try {
      await mkdir(join(folder, "orientation.json"));

      const result = await runValidator(folder);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        `${join(folder, "orientation.json")}: Session files must be regular files`,
      );
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it("passes an existing empty folder", async () => {
    const result = await runValidator(`${FIXTURES}/empty`);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("0 session files");
  });

  it("fails on a missing folder and names it", async () => {
    const result = await runValidator(`${FIXTURES}/does-not-exist`);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      `cannot read session folder "${FIXTURES}/does-not-exist"`,
    );
    expect(result.stderr).toContain("ENOENT");
  });

  it("fails on an unreadable folder and names it", async (context) => {
    const folder = await mkdtemp(join(tmpdir(), "sessions-"));
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
      const result = await runValidator(folder);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(`cannot read session folder "${folder}"`);
      expect(result.stderr).toContain("EACCES");
    } finally {
      await chmod(folder, 0o700);
      await rm(folder, { recursive: true, force: true });
    }
  });
});
