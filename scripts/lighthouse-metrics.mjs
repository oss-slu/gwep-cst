// Reads the four budgeted metrics from a Lighthouse JSON report. Every value
// must be a finite number: a missing or null metric fails loudly instead of
// being compared as if it were zero.

const SOURCES = {
  performance: (report) => scaled(report.categories?.performance?.score),
  accessibility: (report) => scaled(report.categories?.accessibility?.score),
  lcp: (report) => report.audits?.["largest-contentful-paint"]?.numericValue,
  cls: (report) => report.audits?.["cumulative-layout-shift"]?.numericValue,
};

function scaled(score) {
  return typeof score === "number" ? score * 100 : score;
}

export function readMetrics(report, label) {
  const metrics = {};
  for (const [name, read] of Object.entries(SOURCES)) {
    const value = read(report);
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(
        `${label}: Lighthouse reported no numeric value for "${name}" (got ${String(value)}).`,
      );
    }
    metrics[name] = value;
  }
  return metrics;
}

export function median(values) {
  if (values.length === 0) throw new Error("median() needs at least one value");
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
