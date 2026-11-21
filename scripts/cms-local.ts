// Starts Decap's local backend (decap-server) for the CMS demo, only inside a
// disposable copy made by npm run cms:demo-copy. It listens on this machine
// only (127.0.0.1), accepts writes only from the local site's exact origin,
// and commits to the copy's own git history (MODE=git), which has no remotes.
// These settings are passed explicitly, so a .env file cannot change them.
// Usage (inside the copy): npm run cms:local
import { spawn } from "node:child_process";
import { join } from "node:path";
import { CMS_PORT, SITE_PORT, unsafeReason } from "./cms/demo.ts";

const folder = process.cwd();
const reason = await unsafeReason(folder);
if (reason !== undefined) {
  console.error(`cms:local: refusing to start. ${reason}`);
  process.exit(1);
}

const origin = `http://localhost:${String(SITE_PORT)}`;
console.log(
  `cms:local: Decap local backend on http://127.0.0.1:${String(CMS_PORT)} for ${origin}, writing to ${folder}`,
);
const server = spawn(join(folder, "node_modules", ".bin", "decap-server"), [], {
  cwd: folder,
  stdio: "inherit",
  env: {
    ...process.env,
    BIND_HOST: "127.0.0.1",
    PORT: String(CMS_PORT),
    MODE: "git",
    ORIGIN: origin,
    GIT_REPO_DIRECTORY: folder,
  },
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => {
  process.exit(code ?? 0);
});
