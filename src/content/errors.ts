import { formatProblem, type ContentProblem } from "./validate.ts";

/** Base class for errors the app expects and can explain to the user. */
export class AppError extends Error {
  override name = "AppError";
}

export class SessionNotFoundError extends AppError {
  override name = "SessionNotFoundError";
  readonly slug: string;

  constructor(slug: string) {
    super(`No session named "${slug}"`);
    this.slug = slug;
  }
}

export class ContentValidationError extends AppError {
  override name = "ContentValidationError";
  readonly problems: readonly ContentProblem[];

  constructor(problems: readonly ContentProblem[]) {
    super(problems.map(formatProblem).join("\n"));
    this.problems = problems;
  }
}
