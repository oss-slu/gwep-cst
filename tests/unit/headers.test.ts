import { describe, expect, it } from "vitest";
import headersFile from "../../public/_headers?raw";
import adminPage from "../../admin/index.html?raw";
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

  it("caches hashed build assets, the site's and the editor's, for a year", () => {
    for (const pattern of ["/assets/*", "/admin/assets/*"]) {
      expect(findRule(rules, pattern).headers["cache-control"], pattern).toBe(
        "public, max-age=31536000, immutable",
      );
    }
  });
});

describe("headers for the content editor at /admin", () => {
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
      // The editor is served from this site: scripts, fonts and connections
      // from no other origin.
      expect(csp.get("default-src")).toBe("'self'");
      expect(csp.get("script-src")).toBe("'self'");
      expect(csp.get("font-src")).toBe("'self'");
      expect(csp.get("connect-src")).toBe("'self' blob: data:");
      expect(policy).not.toMatch(/https?:|\*/);
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

  it("the editor page loads one same-origin module and no inline script", () => {
    const scripts = adminPage.match(/<script\b[^>]*>/gi) ?? [];
    expect(scripts).toEqual(['<script type="module" src="./main.ts">']);
    expect(adminPage).not.toMatch(/https?:\/\//);
  });
});
