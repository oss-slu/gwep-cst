// Shared rules for the local CMS demo: a disposable clone where Decap can
// edit content without touching the real repository.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Written by cms:demo-copy inside the clone's .git folder, so it is never committed. */
export const MARKER = join(".git", "cms-demo-copy.json");
export const DEFAULT_COPY_NAME = "gwep-cst-cms-demo";
export const CMS_PORT = 8081;
export const SITE_PORT = 5173;

export interface Marker {
  readonly source: string;
  readonly commit: string;
  readonly created: string;
}

export async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd });
  return stdout.trim();
}

/**
 * Why a folder is not a safe place to run the local CMS, or undefined if it
 * is: it must be the root of a clone made by cms:demo-copy, with no remotes,
 * so nothing it writes can reach GitHub or the real working copy.
 */
export async function unsafeReason(
  folder: string,
): Promise<string | undefined> {
  let root: string;
  try {
    root = await git(folder, "rev-parse", "--show-toplevel");
  } catch {
    return `${folder} is not a git repository. Run npm run cms:demo-copy and start the CMS inside the copy.`;
  }
  const [realRoot, realFolder] = await Promise.all([
    git(root, "rev-parse", "--path-format=absolute", "--git-dir"),
    git(folder, "rev-parse", "--path-format=absolute", "--git-dir"),
  ]);
  if (
    realRoot !== realFolder ||
    (await git(folder, "rev-parse", "--show-prefix")) !== ""
  ) {
    return `Start the CMS from the root of the demo copy (${root}).`;
  }
  let marker: Marker;
  try {
    marker = JSON.parse(await readFile(join(root, MARKER), "utf8")) as Marker;
  } catch {
    return `${root} was not made by npm run cms:demo-copy (no ${MARKER}). The CMS only runs in a disposable copy.`;
  }
  try {
    await git(root, "cat-file", "-e", `${marker.commit}^{commit}`);
  } catch {
    return `${MARKER} names commit ${marker.commit}, which this repository does not have.`;
  }
  const remotes = await git(root, "remote");
  if (remotes !== "") {
    return `The demo copy has git remotes (${remotes.split("\n").join(", ")}); it must have none.`;
  }
  return undefined;
}
