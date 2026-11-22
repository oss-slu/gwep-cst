import type { z } from "zod/mini";

/** Keep unknown field diagnostics explicit when Zod Mini has no locale loaded. */
export function describeSchemaIssue(issue: z.core.$ZodIssue): string {
  if (issue.code !== "unrecognized_keys") return issue.message;

  const keys = issue.keys.map((key) => `"${key}"`).join(", ");
  return issue.keys.length === 1
    ? `Unrecognized key: ${keys}`
    : `Unrecognized keys: ${keys}`;
}
