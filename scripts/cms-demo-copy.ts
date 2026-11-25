// Makes a disposable copy of this repository for the local CMS demo: a clone
// of the current commit on a local "main" branch, with no git remotes, the
// project's node_modules linked in, a demo-only git identity, and a marker
// that the editor's folder guard (admin/folder-guard.ts) requires before it
// opens a folder.
// It takes no arguments: the copy is always ../gwep-cst-cms-demo, next to the
// repository it is run from, so no typed path can place it anywhere else.
// Usage: npm run cms:demo-copy
import { appendFile, lstat, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DEFAULT_COPY_NAME, MARKER, git, type Marker } from "./cms/demo.ts";

const source = await git(process.cwd(), "rev-parse", "--show-toplevel");
const destination = join(dirname(source), DEFAULT_COPY_NAME);

const exists = await lstat(destination).then(
  () => true,
  () => false,
);
if (exists) {
  console.error(
    `cms:demo-copy: ${destination} already exists. Delete it first to start a fresh copy:\n  rm -rf "${destination}"`,
  );
  process.exit(1);
}

const commit = await git(source, "rev-parse", "HEAD");
await git(
  dirname(destination),
  "clone",
  "--quiet",
  "--no-hardlinks",
  source,
  destination,
);
await git(destination, "checkout", "--quiet", "-B", "main", commit);
for (const remote of (await git(destination, "remote"))
  .split("\n")
  .filter(Boolean)) {
  await git(destination, "remote", "remove", remote);
}
// Any commit made in the copy (by hand, or by the editor's optional "Commit
// Changes to Git" setting) uses this identity, not yours.
await git(destination, "config", "user.name", "CMS demo");
await git(destination, "config", "user.email", "cms-demo@localhost");
await symlink(join(source, "node_modules"), join(destination, "node_modules"));
// The .gitignore entry "node_modules/" matches only a folder, not this
// link, so exclude it here: a commit of every change must never include it.
await appendFile(
  join(destination, ".git", "info", "exclude"),
  "node_modules\n",
);
const marker: Marker = { source, commit, created: new Date().toISOString() };
await writeFile(
  join(destination, MARKER),
  `${JSON.stringify(marker, null, 2)}\n`,
);

console.log(`cms:demo-copy: made ${destination}`);
console.log(
  `  from commit ${commit.slice(0, 7)}, on branch main, with no git remotes.`,
);
console.log(
  `Next, inside the copy:\n  npm run dev\nThen open http://localhost:5173/admin/ in Chrome or Edge, choose Work with Local Repository and pick ${destination}.`,
);
