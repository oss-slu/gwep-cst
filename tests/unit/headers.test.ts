import { describe, expect, it } from "vitest";
import headersFile from "../../public/_headers?raw";
import adminPage from "../../public/admin/index.html?raw";
import { localAdminHeaders } from "../../scripts/cms/local-admin.ts";
import {
  effectiveHeaders,
  findRule,
  matchesPattern,
  parseHeadersFile,
} from "../../scripts/headers.ts";

const rules = parseHeadersFile(headersFile);
const site = findRule(rules, "/*").headers;

function directives(policy: string): Map<string, string> {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part !== "")
      .map((part) => {
        const [name = "", ...values] = part.split(/\s+/);
        return [name, values.join(" ")];
      }),
  );
}

describe("public/_headers", () => {
  it("sets every required security header for the whole site", () => {
    expect(Object.keys(site).sort()).toEqual(
      [
        "content-security-policy",
        "cross-origin-opener-policy",
        "permissions-policy",
        "referrer-policy",
        "strict-transport-security",
        "x-content-type-options",
        "x-frame-options",
      ].sort(),
    );
    expect(site["x-frame-options"]).toBe("DENY");
    expect(site["x-content-type-options"]).toBe("nosniff");
    expect(site["referrer-policy"]).toBe("no-referrer");
    expect(site["strict-transport-security"]).toMatch(/max-age=31536000/);
  });

  it("has a strict content security policy", () => {
    const csp = directives(site["content-security-policy"] ?? "");

    expect(csp.get("default-src")).toBe("'self'");
    expect(csp.get("script-src")).toBe("'self'");
    expect(csp.get("object-src")).toBe("'none'");
    expect(csp.get("base-uri")).toBe("'none'");
    expect(csp.get("frame-ancestors")).toBe("'none'");
    expect(site["content-security-policy"]).not.toMatch(
      /unsafe-inline|unsafe-eval|\*/,
    );
  });

  it("never removes or replaces a security header, except the editor's own policy", () => {
    const securityHeaders = Object.keys(site);

    for (const rule of rules.filter(
      (candidate) => candidate.pattern !== "/*",
    )) {
      const admin = rule.pattern === "/admin" || rule.pattern === "/admin/*";
      expect(rule.detached, rule.pattern).toEqual(
        admin ? ["content-security-policy"] : [],
      );
      for (const name of securityHeaders) {
        if (admin && name === "content-security-policy") continue;
        expect(
          rule.headers[name],
          `${rule.pattern} sets ${name}`,
        ).toBeUndefined();
      }
    }
  });

  it("caches hashed build assets for a year", () => {
    expect(findRule(rules, "/assets/*").headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );
  });
});

describe("headers for the content editor at /admin", () => {
  const adminPolicy = (path: string) =>
    effectiveHeaders(rules, path)["content-security-policy"] ?? "";

  it("matches Cloudflare path patterns", () => {
    expect(matchesPattern("/*", "/sessions/orientation")).toBe(true);
    expect(matchesPattern("/admin/*", "/admin/")).toBe(true);
    expect(matchesPattern("/admin/*", "/admin/index.html")).toBe(true);
    expect(matchesPattern("/admin/*", "/admin")).toBe(false);
    expect(matchesPattern("/admin", "/admin")).toBe(true);
    expect(matchesPattern("/admin", "/administrator")).toBe(false);
  });

  it.each(["/admin", "/admin/", "/admin/index.html", "/admin/config.yml"])(
    "%s gets one admin policy and every other site header",
    (path) => {
      const headers = effectiveHeaders(rules, path);
      for (const [name, value] of Object.entries(site)) {
        if (name === "content-security-policy") continue;
        expect(headers[name], name).toBe(value);
      }
      const policy = headers["content-security-policy"] ?? "";
      // Replaced, not joined to the site policy with ", ".
      expect(policy).not.toContain(",");
      expect(policy).not.toBe(site["content-security-policy"]);
      const csp = directives(policy);
      expect(csp.get("script-src")).toBe(
        "'self' https://unpkg.com/decap-cms@3.17.3/dist/decap-cms.js",
      );
      expect(csp.get("connect-src")).toBe("'self' blob:");
      expect(csp.get("object-src")).toBe("'none'");
      expect(csp.get("base-uri")).toBe("'none'");
      expect(csp.get("frame-ancestors")).toBe("'none'");
    },
  );

  it("the deployed policy never allows eval or the local backend", () => {
    for (const rule of rules) {
      for (const value of Object.values(rule.headers)) {
        expect(value, rule.pattern).not.toContain("unsafe-eval");
        expect(value, rule.pattern).not.toMatch(/localhost|127\.0\.0\.1/);
      }
    }
  });

  it("keeps the viewer's strict policy everywhere else", () => {
    for (const path of [
      "/",
      "/sessions/orientation/welcome",
      "/administrator",
    ]) {
      expect(
        effectiveHeaders(rules, path)["content-security-policy"],
        path,
      ).toBe(site["content-security-policy"]);
    }
  });

  it("the local servers add only 'unsafe-eval' and the loopback backend", () => {
    for (const path of ["/admin", "/admin/", "/admin/index.html"]) {
      const local = directives(
        localAdminHeaders(rules, path)["content-security-policy"] ?? "",
      );
      const deployed = directives(adminPolicy(path));
      expect(local.get("script-src")).toBe(
        "'self' 'unsafe-eval' https://unpkg.com/decap-cms@3.17.3/dist/decap-cms.js",
      );
      expect(local.get("connect-src")).toBe(
        "'self' http://localhost:8081 blob:",
      );
      for (const [name, value] of deployed) {
        if (name === "script-src" || name === "connect-src") continue;
        expect(local.get(name), name).toBe(value);
      }
    }
  });

  it("pins the editor script the policy allows, with an integrity hash", () => {
    const script =
      /<script\s+src="([^"]+)"\s+integrity="(sha384-[A-Za-z0-9+/=]+)"\s+crossorigin="anonymous"/.exec(
        adminPage,
      );
    expect(script?.[1]).toBe(
      "https://unpkg.com/decap-cms@3.17.3/dist/decap-cms.js",
    );
    expect(script?.[2]).toBe(
      "sha384-RWRzuHfiZSWCt3nEvG7B0v3cMgM1C2UuJmgBSL92GQh4uXmNSkbcthql/mNBqvjr",
    );
    expect(adminPolicy("/admin/")).toContain(script?.[1] ?? "missing");
    // No inline scripts, which the policy would block anyway.
    expect(adminPage.match(/<script/g)).toHaveLength(1);
  });
});
