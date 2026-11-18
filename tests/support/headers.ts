export interface HeaderRule {
  readonly pattern: string;
  readonly headers: Readonly<Record<string, string>>;
  /** Header names removed with a "! Name" line. */
  readonly detached: readonly string[];
}

/**
 * Parses a Cloudflare `_headers` file: an unindented line starts a rule for a
 * path pattern, and the indented lines below it are "Name: value" headers or
 * "! Name" lines that remove a header set by an earlier rule.
 */
export function parseHeadersFile(text: string): HeaderRule[] {
  const rules: {
    pattern: string;
    headers: Record<string, string>;
    detached: string[];
  }[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    if (!/^\s/.test(rawLine)) {
      rules.push({ pattern: line, headers: {}, detached: [] });
      continue;
    }

    const rule = rules.at(-1);
    if (!rule) throw new Error(`Header line before any path: "${line}"`);

    if (line.startsWith("!")) {
      rule.detached.push(line.slice(1).trim().toLowerCase());
      continue;
    }

    const separator = line.indexOf(":");
    if (separator <= 0) throw new Error(`Malformed header line: "${line}"`);
    const name = line.slice(0, separator).trim().toLowerCase();
    rule.headers[name] = line.slice(separator + 1).trim();
  }

  return rules;
}

export function findRule(
  rules: readonly HeaderRule[],
  pattern: string,
): HeaderRule {
  const rule = rules.find((candidate) => candidate.pattern === pattern);
  if (!rule) throw new Error(`No header rule for "${pattern}"`);
  return rule;
}
