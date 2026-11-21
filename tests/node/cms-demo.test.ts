// @vitest-environment node
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { request as httpRequest } from "node:http";
import {
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  unlink,
} from "node:fs/promises";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demoAllowancesApply } from "../../scripts/cms/local-admin.ts";

// The local CMS demo's safeguards, run for real: the disposable copy, the
// launcher's checks, and the write boundary of decap-server in git mode.
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const run = promisify(execFile);
const COPY_SCRIPT = join(REPO, "scripts/cms-demo-copy.ts");
const LOCAL_SCRIPT = join(REPO, "scripts/cms-local.ts");

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
let copy: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cms-demo-"));
  copy = join(root, "copy");
  const made = await node(COPY_SCRIPT, [copy], REPO);
  expect(made.code, made.stderr).toBe(0);
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
    expect(await readlink(join(copy, "node_modules"))).toBe(
      join(REPO, "node_modules"),
    );
    expect(await readFile(join(copy, ".git/info/exclude"), "utf8")).toMatch(
      /^node_modules$/m,
    );
  });

  it("refuses a destination inside this repository, such as a stray '#'", async () => {
    for (const destination of ["#", join(REPO, "content", "copy")]) {
      const result = await node(COPY_SCRIPT, [destination], REPO);
      expect(result.code, destination).toBe(1);
      expect(result.stderr, destination).toContain("is inside this repository");
    }
  });

  it("refuses an existing destination", async () => {
    const again = await node(COPY_SCRIPT, [copy], REPO);
    expect(again.code).toBe(1);
    expect(again.stderr).toContain(`${copy} already exists`);
  });
});

describe("npm run cms:local refuses unsafe folders", () => {
  it("in the real repository", async () => {
    const result = await node(LOCAL_SCRIPT, [], REPO);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("was not made by npm run cms:demo-copy");
  });

  it("in a subfolder of the copy", async () => {
    const result = await node(LOCAL_SCRIPT, [], join(copy, "content"));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "Start the CMS from the root of the demo copy",
    );
  });

  it("in a copy that has a git remote", async () => {
    const other = join(root, "with-remote");
    expect((await node(COPY_SCRIPT, [other], REPO)).code).toBe(0);
    await git(
      other,
      "remote",
      "add",
      "origin",
      "https://github.com/oss-slu/gwep-cst.git",
    );
    const result = await node(LOCAL_SCRIPT, [], other);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("The demo copy has git remotes (origin)");
  });

  it("in a copy without its marker", async () => {
    const other = join(root, "no-marker");
    expect((await node(COPY_SCRIPT, [other], REPO)).code).toBe(0);
    await unlink(join(other, ".git/cms-demo-copy.json"));
    const result = await node(LOCAL_SCRIPT, [], other);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("was not made by npm run cms:demo-copy");
  });

  it("outside any git repository", async () => {
    const plain = join(root, "plain");
    await mkdir(plain);
    const result = await node(LOCAL_SCRIPT, [], plain);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("is not a git repository");
  });
});

describe("the local editor allowances (vite.config.ts)", () => {
  it("apply only to a disposable copy served on loopback", async () => {
    expect(await demoAllowancesApply(copy, undefined)).toBe(true);
    expect(await demoAllowancesApply(copy, "localhost")).toBe(true);
    // Exposed to the network: never.
    expect(await demoAllowancesApply(copy, true)).toBe(false);
    expect(await demoAllowancesApply(copy, "0.0.0.0")).toBe(false);
    // A regular checkout: never.
    expect(await demoAllowancesApply(REPO, undefined)).toBe(false);
  });
});

describe("the local backend in git mode", () => {
  let server: ChildProcess | undefined;

  beforeAll(async () => {
    server = spawn(process.execPath, [LOCAL_SCRIPT], { cwd: copy });
    await new Promise<void>((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => {
        reject(new Error(`decap-server did not start:\n${output}`));
      }, 30_000);
      const watch = (chunk: Buffer) => {
        output += chunk.toString();
        if (output.includes("listening on 127.0.0.1:8081")) {
          clearTimeout(timer);
          resolve();
        }
      };
      server?.stdout?.on("data", watch);
      server?.stderr?.on("data", watch);
    });
  }, 60_000);

  afterAll(() => {
    server?.kill("SIGTERM");
  });

  /**
   * POSTs with node:http, which (unlike fetch) sends a Host header as given,
   * so the DNS-rebinding check can be tested.
   */
  const post = (
    headers: Record<string, string>,
    body: unknown,
    address = "127.0.0.1",
  ): Promise<{ status: number; json: () => Promise<unknown> }> =>
    new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const request = httpRequest(
        {
          host: address,
          port: 8081,
          path: "/api/v1",
          method: "POST",
          timeout: 3000,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
            ...headers,
          },
        },
        (response) => {
          let text = "";
          response.on("data", (chunk: Buffer) => {
            text += chunk.toString();
          });
          response.on("end", () => {
            resolve({
              status: response.statusCode ?? 0,
              json: () => Promise.resolve(JSON.parse(text) as unknown),
            });
          });
        },
      );
      request.on("timeout", () => {
        request.destroy(new Error("timeout"));
      });
      request.on("error", reject);
      request.end(payload);
    });

  const write = {
    action: "persistEntry",
    params: {
      branch: "main",
      dataFiles: [
        {
          slug: "orientation",
          path: "content/sessions/orientation.json",
          raw: '{"hacked":true}',
        },
      ],
      assets: [],
      options: {
        collectionName: "sessions",
        status: "draft",
        commitMessage: "hack",
      },
    },
  };

  async function snapshot() {
    return {
      refs: await git(
        copy,
        "for-each-ref",
        "--format=%(refname) %(objectname)",
      ),
      status: await git(copy, "status", "--porcelain"),
      session: await readFile(
        join(copy, "content/sessions/orientation.json"),
        "utf8",
      ),
    };
  }

  it("answers the local site's exact origin", async () => {
    const response = await post(
      { Origin: "http://localhost:5173" },
      { action: "info" },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ type: "local_git" });
  });

  it("rejects writes from other origins and hosts, leaving files and git refs unchanged", async () => {
    const before = await snapshot();
    for (const [headers, message] of [
      [
        { Origin: "https://evil.example" },
        "Origin https://evil.example is not allowed",
      ],
      [
        { Origin: "http://localhost:3000" },
        "Origin http://localhost:3000 is not allowed",
      ],
      [
        { Origin: "http://localhost:5173", Host: "evil.example:8081" },
        "Host evil.example:8081 is not allowed",
      ],
    ] as const) {
      const response = await post(headers, write);
      expect(response.status, message).toBe(403);
      expect(JSON.stringify(await response.json())).toContain(message);
    }
    expect(await snapshot()).toEqual(before);
  });

  it("is not reachable on this machine's network address", async () => {
    const address = Object.values(networkInterfaces())
      .flat()
      .find((entry) => entry?.family === "IPv4" && !entry.internal)?.address;
    if (address === undefined) return; // no network interface to try
    await expect(
      post({ Origin: "http://localhost:5173" }, { action: "info" }, address),
    ).rejects.toThrow();
  });
});
