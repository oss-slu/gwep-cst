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
  writeFile,
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
  it("passes valid sessions that use the registered slide types", async () => {
    const result = await runValidator(fixture("valid"));
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("2 session files in content/sessions");
    expect(result.stderr).toBe("");
  });

  it("rejects slides of unregistered types; there is no fallback schema", async () => {
    const result = await runValidator(fixture("unregistered-types"));
    const registered =
      "Registered types: title, calendar-day, calendar-month, calendar-year, weather, reveal, sounds";
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      `${SESSIONS}/childhood.json: slides[0].type: Unknown slide type "drag-drop". ${registered}`,
    );
    expect(result.stderr).toContain(
      `${SESSIONS}/orientation.json: slides[1].type: Unknown slide type "quiz". ${registered}`,
    );
  });

  it("reports invalid session fields with their file and path", async () => {
    const result = await runValidator(fixture("invalid-fields"));
    const file = `${SESSIONS}/orientation.json`;
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`${file}: number: `);
    expect(result.stderr).toContain(`${file}: Unrecognized key: "titel"`);
  });

  it("reports invalid data for a registered slide type at its field path", async () => {
    const result = await runValidator(fixture("invalid-slide"));
    const file = `${SESSIONS}/orientation.json`;
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      `${file}: slides[0].heading: Heading must not be empty`,
    );
    expect(result.stderr).toContain(
      `${file}: slides[1]: Unrecognized key: "date"`,
    );
    expect(result.stderr).toContain(
      `${file}: slides[2].id: Slide id must use lowercase letters, digits and single hyphens`,
    );
  });

  it("reports duplicate slide ids", async () => {
    const result = await runValidator(fixture("duplicate-ids"));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      `${SESSIONS}/orientation.json: slides[1].id: Slide id "day" is used more than once`,
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
    expect(result.stderr).toContain(
      `${SESSIONS}/orientation.json: number: Session number 9 is also used by ${SESSIONS}/copy.json`,
    );
  });

  it("checks the catalog against the session files", async () => {
    const result = await runValidator(fixture("catalog-problems"));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      `${SESSIONS}/orientation.json: number: Session number 3 does not match number 9 for "orientation" in content/catalog.json`,
    );
    expect(result.stderr).toContain(
      'content/catalog.json: sessions[0].available: Session "childhood" is marked available but has no file childhood.json',
    );
  });

  it("fails when the catalog is missing and names it", async () => {
    await inTempProject(async (project) => {
      await mkdir(join(project, SESSIONS), { recursive: true });
      const result = await runValidator(project);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "content/catalog.json: Cannot read file: ENOENT",
      );
    });
  });

  it("reports catalog schema problems at their path", async () => {
    await inTempProject(async (project) => {
      await mkdir(join(project, SESSIONS), { recursive: true });
      await writeFile(
        join(project, "content/catalog.json"),
        JSON.stringify({ sessions: [] }),
      );
      const result = await runValidator(project);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "content/catalog.json: sessions: The catalog must list all 14 sessions",
      );
    });
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
