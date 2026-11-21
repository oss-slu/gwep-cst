import { describe, expect, it } from "vitest";
import catalog from "../../content/catalog.json" with { type: "json" };
import { catalogSchema } from "./catalog-schema.ts";

function issuesFor(data: unknown) {
  return (catalogSchema.safeParse(data).error?.issues ?? []).map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
}

describe("catalog", () => {
  it("content/catalog.json passes its schema", () => {
    expect(issuesFor(catalog)).toEqual([]);
  });

  it("makes only Orientation playable in M0", () => {
    expect(
      catalog.sessions
        .filter((entry) => entry.available)
        .map((entry) => entry.slug),
    ).toEqual(["orientation"]);
  });

  it("requires all fourteen sessions", () => {
    expect(issuesFor({ sessions: catalog.sessions.slice(0, 13) })).toEqual([
      "sessions: The catalog must list all 14 sessions",
    ]);
  });

  it("requires project order and unique slugs", () => {
    const sessions = structuredClone(catalog.sessions);
    const [first, second] = sessions;
    if (first === undefined || second === undefined) throw new Error("fixture");
    [first.number, second.number] = [2, 1];
    second.slug = first.slug;
    expect(issuesFor({ sessions })).toEqual([
      "sessions.0.number: Sessions must be listed in order: expected number 1, found 2",
      "sessions.1.number: Sessions must be listed in order: expected number 2, found 1",
      'sessions.1.slug: Slug "childhood" is used more than once',
    ]);
  });
});
