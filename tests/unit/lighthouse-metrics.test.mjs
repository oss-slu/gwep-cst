import { describe, expect, it } from "vitest";
import { median, readMetrics } from "../../scripts/lighthouse-metrics.mjs";

function report({
  performance = 0.98,
  accessibility = 1,
  lcp = 1200,
  cls = 0.02,
} = {}) {
  return {
    categories: {
      performance: { score: performance },
      accessibility: { score: accessibility },
    },
    audits: {
      "largest-contentful-paint": { numericValue: lcp },
      "cumulative-layout-shift": { numericValue: cls },
    },
  };
}

describe("readMetrics", () => {
  it("reads all four metrics, with scores out of 100", () => {
    expect(readMetrics(report(), "Run 1")).toEqual({
      performance: 98,
      accessibility: 100,
      lcp: 1200,
      cls: 0.02,
    });
  });

  it("keeps a real zero", () => {
    expect(readMetrics(report({ cls: 0 }), "Run 1").cls).toBe(0);
  });

  it.each([
    ["lcp", { lcp: null }],
    ["cls", { cls: null }],
    ["performance", { performance: null }],
    ["accessibility", { accessibility: null }],
  ])("fails clearly when %s is null", (name, values) => {
    expect(() => readMetrics(report(values), "Run 2")).toThrow(
      `Run 2: Lighthouse reported no numeric value for "${name}" (got null).`,
    );
  });

  it("fails clearly when an audit is missing", () => {
    const missing = report();
    delete missing.audits["largest-contentful-paint"];
    expect(() => readMetrics(missing, "Run 3")).toThrow(
      'Run 3: Lighthouse reported no numeric value for "lcp" (got undefined).',
    );
  });

  it("fails when a value is not finite", () => {
    expect(() => readMetrics(report({ lcp: Number.NaN }), "Run 1")).toThrow(
      /"lcp" \(got NaN\)/,
    );
  });
});

describe("median", () => {
  it("takes the middle value of an odd-length list", () => {
    expect(median([2000, 700, 900])).toBe(900);
  });

  it("rejects an empty list", () => {
    expect(() => median([])).toThrow();
  });
});
