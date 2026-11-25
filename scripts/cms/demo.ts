// Shared rules for the local CMS demo: a disposable clone where the editor
// can change content without touching the real repository. The editor's
// folder guard (admin/folder-guard.ts) checks the same marker and remotes.
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Written by cms:demo-copy inside the clone's .git folder, so it is never committed. */
export const MARKER = join(".git", "cms-demo-copy.json");
export const DEFAULT_COPY_NAME = "gwep-cst-cms-demo";

export interface Marker {
  readonly source: string;
  readonly commit: string;
  readonly created: string;
}

export async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd });
  return stdout.trim();
}
