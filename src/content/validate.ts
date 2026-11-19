import { sessionSchema, type Session } from "./schema.ts";

/** One thing wrong with a content file, pointing at the field when known. */
export interface ContentProblem {
  readonly file: string;
  /** Field path such as "slides[2].image.alt"; empty for the whole file. */
  readonly path: string;
  readonly message: string;
}

export type CheckResult =
  | { readonly ok: true; readonly session: Session }
  | { readonly ok: false; readonly problems: readonly ContentProblem[] };

export function formatProblem(problem: ContentProblem): string {
  return problem.path === ""
    ? `${problem.file}: ${problem.message}`
    : `${problem.file}: ${problem.path}: ${problem.message}`;
}

function formatPath(path: readonly PropertyKey[]): string {
  return path
    .map((key, index) => {
      if (typeof key === "number") return `[${String(key)}]`;
      const name = String(key);
      return index === 0 ? name : `.${name}`;
    })
    .join("");
}

/** Checks already-parsed data against the session schema. */
export function checkSessionData(file: string, data: unknown): CheckResult {
  const result = sessionSchema.safeParse(data);
  if (result.success) return { ok: true, session: result.data };
  return {
    ok: false,
    problems: result.error.issues.map((issue) => ({
      file,
      path: formatPath(issue.path),
      message: issue.message,
    })),
  };
}

/** Parses a session file's text, then checks it. */
export function checkSessionText(file: string, text: string): CheckResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    // Node's parser message includes the line and column when it knows them.
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      problems: [{ file, path: "", message: `Not valid JSON: ${reason}` }],
    };
  }
  return checkSessionData(file, data);
}

/** A session file must be named after its slug: orientation.json holds "orientation". */
export function checkSlugMatchesFile(
  file: string,
  session: Session,
): ContentProblem[] {
  const name = (file.split("/").pop() ?? file).replace(/\.json$/, "");
  return name === session.slug
    ? []
    : [
        {
          file,
          path: "slug",
          message: `Slug "${session.slug}" must match the file name "${name}"`,
        },
      ];
}

/** Rules that span files: names match slugs, and no two sessions share a number. */
export function checkSessionSet(
  sessions: readonly { readonly file: string; readonly session: Session }[],
): ContentProblem[] {
  const problems: ContentProblem[] = [];
  const fileByNumber = new Map<number, string>();
  for (const { file, session } of sessions) {
    problems.push(...checkSlugMatchesFile(file, session));
    const other = fileByNumber.get(session.number);
    if (other === undefined) {
      fileByNumber.set(session.number, file);
    } else {
      problems.push({
        file,
        path: "number",
        message: `Session number ${String(session.number)} is also used by ${other}`,
      });
    }
  }
  return problems;
}
