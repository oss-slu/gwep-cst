import { describe, expect, it } from "vitest";
import { validSession } from "../../tests/support/session-fixture";
import { testSessionSchema } from "../../tests/support/test-slides";
import {
  checkCatalogAgainstSessions,
  checkSessionData,
  checkSessionSet,
  checkSessionText,
  formatProblem,
} from "./validate.ts";

const FILE = "content/sessions/orientation.json";

describe("checkSessionText", () => {
  it("returns the parsed session for valid content", () => {
    const result = checkSessionText(
      FILE,
      JSON.stringify(validSession()),
      testSessionSchema,
    );
    expect(result.ok && result.session.slug).toBe("orientation");
  });

  it("reports malformed JSON for the whole file", () => {
    const result = checkSessionText(
      FILE,
      '{ "slug": "orientation", }',
      testSessionSchema,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const [problem, ...others] = result.problems;
      expect(others).toEqual([]);
      expect(problem?.path).toBe("");
      expect(problem && formatProblem(problem)).toMatch(
        /^content\/sessions\/orientation\.json: Not valid JSON: /,
      );
    }
  });
});

describe("checkSessionData", () => {
  it("reports each problem with its field path", () => {
    const result = checkSessionData(
      FILE,
      validSession({
        slides: [
          { type: "test-text", id: "welcome", text: "One" },
          { type: "test-text", id: "Bad Id", text: "Two" },
        ],
      }),
      testSessionSchema,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.map(formatProblem)).toEqual([
        `${FILE}: slides[1].id: Slide id must use lowercase letters, digits and single hyphens`,
      ]);
    }
  });

  it("reports a missing field", () => {
    const session = validSession();
    delete session.title;
    const result = checkSessionData(FILE, session, testSessionSchema);
    expect(!result.ok && result.problems[0]?.path).toBe("title");
  });
});

describe("checkSessionSet", () => {
  const session = (slug: string, number: number) => ({ slug, number });

  it("passes matching names and distinct numbers", () => {
    expect(
      checkSessionSet([
        { file: "a/orientation.json", session: session("orientation", 9) },
        { file: "a/childhood.json", session: session("childhood", 1) },
      ]),
    ).toEqual([]);
  });

  it("reports a slug that does not match its file name", () => {
    const problems = checkSessionSet([
      { file: "a/copy.json", session: session("orientation", 9) },
    ]);
    expect(problems.map(formatProblem)).toEqual([
      'a/copy.json: slug: Slug "orientation" must match the file name "copy"',
    ]);
  });

  it("reports two sessions with the same number", () => {
    const problems = checkSessionSet([
      { file: "a/orientation.json", session: session("orientation", 9) },
      { file: "a/childhood.json", session: session("childhood", 9) },
    ]);
    expect(problems.map(formatProblem)).toEqual([
      "a/childhood.json: number: Session number 9 is also used by a/orientation.json",
    ]);
  });
});

describe("checkCatalogAgainstSessions", () => {
  const CATALOG = "content/catalog.json";
  const catalog = {
    sessions: [
      { number: 1, slug: "childhood", available: false },
      { number: 9, slug: "orientation", available: true },
    ],
  };
  const orientation = {
    file: FILE,
    session: { slug: "orientation", number: 9 },
  };

  it("passes matching files, and allows a file for an unavailable session", () => {
    const childhood = {
      file: "content/sessions/childhood.json",
      session: { slug: "childhood", number: 1 },
    };
    expect(
      checkCatalogAgainstSessions(
        CATALOG,
        catalog,
        [FILE, childhood.file],
        [orientation, childhood],
      ),
    ).toEqual([]);
  });

  it("reports an available session with no file", () => {
    expect(
      checkCatalogAgainstSessions(CATALOG, catalog, [], []).map(formatProblem),
    ).toEqual([
      'content/catalog.json: sessions[1].available: Session "orientation" is marked available but has no file orientation.json',
    ]);
  });

  it("does not repeat a missing file when the file exists but is invalid", () => {
    expect(checkCatalogAgainstSessions(CATALOG, catalog, [FILE], [])).toEqual(
      [],
    );
  });

  it("reports a session missing from the catalog or with another number", () => {
    const art = {
      file: "content/sessions/art.json",
      session: { slug: "art", number: 7 },
    };
    const renumbered = {
      file: FILE,
      session: { slug: "orientation", number: 3 },
    };
    expect(
      checkCatalogAgainstSessions(
        CATALOG,
        catalog,
        [FILE, art.file],
        [renumbered, art],
      ).map(formatProblem),
    ).toEqual([
      `${FILE}: number: Session number 3 does not match number 9 for "orientation" in content/catalog.json`,
      'content/sessions/art.json: slug: Session "art" is not listed in content/catalog.json',
    ]);
  });
});
