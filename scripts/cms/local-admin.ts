// The headers the local dev and preview servers send for /admin (see
// vite.config.ts): what public/_headers gives the path, plus two local-only
// allowances for the loopback-served demo.
import { effectiveHeaders, type HeaderRule } from "../headers.ts";
import { CMS_PORT } from "./demo.ts";

/** The local Decap backend (npm run cms:local). */
export const LOCAL_CMS_BACKEND = `http://localhost:${String(CMS_PORT)}`;

/**
 * - connect-src also allows the loopback Decap backend;
 * - script-src also allows 'unsafe-eval', which Decap 3.17.3 needs to compile
 *   its config schema (Ajv). The deployed policy never allows it.
 */
export function localAdminHeaders(
  rules: readonly HeaderRule[],
  path: string,
): Record<string, string> {
  const headers = effectiveHeaders(rules, path);
  const policy = headers["content-security-policy"];
  if (policy !== undefined) {
    headers["content-security-policy"] = policy
      .replace("connect-src 'self'", `connect-src 'self' ${LOCAL_CMS_BACKEND}`)
      .replace("script-src 'self'", "script-src 'self' 'unsafe-eval'");
  }
  return headers;
}
