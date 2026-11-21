// Makes a disposable copy of this repository for the local CMS demo: a clone
// of the current commit on a local "main" branch, with no git remotes, the
// project's node_modules linked in, a demo-only git identity, and a marker
// that npm run cms:local checks before starting.
// Usage: npm run cms:demo-copy [-- <destination>]   (default ../gwep-cst-cms-demo)
import { appendFile, lstat, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { DEFAULT_COPY_NAME, MARKER, git, type Marker } from "./cms/demo.ts";

const source = await git(process.cwd(), "rev-parse", "--show-toplevel");
const destination = resolve(
  process.argv[2] ?? join(dirname(source), DEFAULT_COPY_NAME),
);

// Inside this repository the copy would be committed as an embedded
// repository, and a stray argument (for example a shell "#" that was meant
// as a comment) must not create one there.
const inside = relative(source, destination);
if (inside === "" || (!inside.startsWith("..") && !inside.startsWith("/"))) {
  console.error(
    `cms:demo-copy: ${destination} is inside this repository. Choose a folder outside it, or run without an argument for ../${DEFAULT_COPY_NAME}.`,
  );
  process.exit(1);
}

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
// Commits made by the CMS in git mode use this identity, not yours.
await git(destination, "config", "user.name", "CMS demo");
await git(destination, "config", "user.email", "cms-demo@localhost");
await symlink(join(source, "node_modules"), join(destination, "node_modules"));
// The CMS in git mode commits every changed file. The .gitignore entry
// "node_modules/" matches only a folder, not this link, so exclude it here.
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
  `Next, in two terminals inside the copy:\n  npm run cms:local\n  npm run dev`,
);
