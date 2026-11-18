import { describe, expect, it } from "vitest";
import headersFile from "../../public/_headers?raw";
import { findRule, parseHeadersFile } from "../support/headers";

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

  it("never removes or replaces the security headers for any path", () => {
    const securityHeaders = Object.keys(site);

    for (const rule of rules.filter(
      (candidate) => candidate.pattern !== "/*",
    )) {
      expect(rule.detached).toEqual([]);
      for (const name of securityHeaders) {
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
