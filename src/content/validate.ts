import type { z } from "zod";

/** One thing wrong with a content file, pointing at the field when known. */
export interface ContentProblem {
  readonly file: string;
  /** Field path such as "slides[2].image.alt"; empty for the whole file. */
  readonly path: string;
  readonly message: string;
}

/** The fields of a session that checks across files rely on. */
export interface SessionSummary {
  readonly slug: string;
  readonly number: number;
}

export type CheckResult<S> =
  | { readonly ok: true; readonly session: S }
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

/** Checks already-parsed data against a session schema. */
export function checkSessionData<S>(
  file: string,
  data: unknown,
  schema: z.ZodType<S>,
): CheckResult<S> {
  const result = schema.safeParse(data);
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

/** Parses a session file's text, then checks it against a session schema. */
export function checkSessionText<S>(
  file: string,
  text: string,
  schema: z.ZodType<S>,
): CheckResult<S> {
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
  return checkSessionData(file, data, schema);
}

/** A session file must be named after its slug: orientation.json holds "orientation". */
export function checkSlugMatchesFile(
  file: string,
  session: SessionSummary,
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
  sessions: readonly {
    readonly file: string;
    readonly session: SessionSummary;
  }[],
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

/** The catalog fields the checks across files rely on. */
export interface CatalogSummary {
  readonly sessions: readonly {
    readonly number: number;
    readonly slug: string;
    readonly available: boolean;
  }[];
}

/**
 * Rules between the catalog and the session files: every session file is
 * listed in the catalog under the same number, and every session marked
 * available has a file. A file for a session that is not yet available is
 * allowed (work in progress); the app never loads it.
 */
export function checkCatalogAgainstSessions(
  catalogFile: string,
  catalog: CatalogSummary,
  sessionFiles: readonly string[],
  sessions: readonly {
    readonly file: string;
    readonly session: SessionSummary;
  }[],
): ContentProblem[] {
  const problems: ContentProblem[] = [];
  const bySlug = new Map(catalog.sessions.map((entry) => [entry.slug, entry]));
  for (const { file, session } of sessions) {
    const entry = bySlug.get(session.slug);
    if (entry === undefined) {
      problems.push({
        file,
        path: "slug",
        message: `Session "${session.slug}" is not listed in ${catalogFile}`,
      });
    } else if (entry.number !== session.number) {
      problems.push({
        file,
        path: "number",
        message: `Session number ${String(session.number)} does not match number ${String(entry.number)} for "${session.slug}" in ${catalogFile}`,
      });
    }
  }

  const fileNames = new Set(
    sessionFiles.map((file) =>
      (file.split("/").pop() ?? file).replace(/\.json$/, ""),
    ),
  );
  catalog.sessions.forEach((entry, index) => {
    if (entry.available && !fileNames.has(entry.slug)) {
      problems.push({
        file: catalogFile,
        path: `sessions[${String(index)}].available`,
        message: `Session "${entry.slug}" is marked available but has no file ${entry.slug}.json`,
      });
    }
  });
  return problems;
}
