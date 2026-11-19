import { describe, expect, it } from "vitest";
import { validSession } from "../../tests/support/session-fixture";
import type { Session } from "./schema.ts";
import {
  checkSessionData,
  checkSessionSet,
  checkSessionText,
  formatProblem,
} from "./validate.ts";

const FILE = "content/sessions/orientation.json";

describe("checkSessionText", () => {
  it("returns the parsed session for valid content", () => {
    const result = checkSessionText(FILE, JSON.stringify(validSession()));
    expect(result.ok && result.session.slug).toBe("orientation");
  });

  it("reports malformed JSON for the whole file", () => {
    const result = checkSessionText(FILE, '{ "slug": "orientation", }');
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
          { type: "title", id: "welcome" },
          { type: "reveal", id: "Bad Id" },
        ],
      }),
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
    const result = checkSessionData(FILE, session);
    expect(!result.ok && result.problems[0]?.path).toBe("title");
  });
});

describe("checkSessionSet", () => {
  const session = (slug: string, number: number): Session =>
    ({ ...validSession(), slug, number }) as Session;

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
