// The headers the local dev and preview servers send for /admin (see
// vite.config.ts). Normally exactly what public/_headers gives the path. Only
// a server that serves a verified disposable demo copy (npm run
// cms:demo-copy) and listens on loopback adds two allowances the local
// editor needs.
import { effectiveHeaders, type HeaderRule } from "../headers.ts";
import { CMS_PORT, unsafeReason } from "./demo.ts";

/** The local Decap backend (npm run cms:local). */
export const LOCAL_CMS_BACKEND = `http://localhost:${String(CMS_PORT)}`;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Whether a Vite `server.host` / `preview.host` setting listens on this
 * machine only. Unset means Vite's default, localhost; `true` or 0.0.0.0
 * means every network interface.
 */
export function isLoopbackHost(host: string | boolean | undefined): boolean {
  if (host === undefined || host === false) return true;
  if (host === true) return false;
  return LOOPBACK_HOSTS.has(host);
}

/**
 * Whether the local editor allowances apply: the project folder is a
 * disposable demo copy (marker, known commit, no git remotes) and the server
 * listens on loopback only.
 */
export async function demoAllowancesApply(
  root: string,
  host: string | boolean | undefined,
): Promise<boolean> {
  if (!isLoopbackHost(host)) return false;
  return (await unsafeReason(root)) === undefined;
}

/**
 * The /admin headers for a path. With `demo` false, exactly the deployed
 * headers. With `demo` true, also:
 * - connect-src allows the loopback Decap backend;
 * - script-src allows 'unsafe-eval', which Decap 3.17.3 needs to compile its
 *   config schema (Ajv). The deployed policy never allows it.
 */
export function adminHeaders(
  rules: readonly HeaderRule[],
  path: string,
  demo: boolean,
): Record<string, string> {
  const headers = effectiveHeaders(rules, path);
  const policy = headers["content-security-policy"];
  if (demo && policy !== undefined) {
    headers["content-security-policy"] = policy
      .replace("connect-src 'self'", `connect-src 'self' ${LOCAL_CMS_BACKEND}`)
      .replace("script-src 'self'", "script-src 'self' 'unsafe-eval'");
  }
  return headers;
}
