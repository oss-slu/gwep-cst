import type { z } from "zod/mini";
import type { ContentSource } from "./content-source.ts";
import { ContentValidationError, SessionNotFoundError } from "./errors.ts";
import { sessionLoaders } from "./session-loaders.ts";
import { sessionSchema } from "./session-schema.ts";
import {
  checkSessionData,
  checkSlugMatchesFile,
  type SessionSummary,
} from "./validate.ts";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SessionLoaders = Readonly<Record<string, () => Promise<unknown>>>;

export interface StaticContentSourceOptions<S extends SessionSummary> {
  readonly loaders: SessionLoaders;
  readonly schema: z.ZodMiniType<S>;
}

interface SessionFile {
  readonly file: string;
  readonly load: () => Promise<unknown>;
}

/** The name of a session file without its folder and extension: "orientation". */
function fileName(file: string): string {
  return (file.split("/").pop() ?? file).replace(/\.json$/, "");
}

/**
 * Loads sessions bundled with the site, such as content/sessions/<slug>.json.
 * Sessions are found by file name, so a test-only build can add a folder.
 */
export class StaticContentSource<
  S extends SessionSummary,
> implements ContentSource<S> {
  readonly #files: ReadonlyMap<string, SessionFile>;
  readonly #schema: z.ZodMiniType<S>;

  constructor({ loaders, schema }: StaticContentSourceOptions<S>) {
    const files = new Map<string, SessionFile>();
    for (const [file, load] of Object.entries(loaders)) {
      const name = fileName(file);
      const other = files.get(name);
      if (other !== undefined) {
        throw new Error(
          `Session files ${other.file} and ${file} have the same name`,
        );
      }
      files.set(name, { file, load });
    }
    this.#files = files;
    this.#schema = schema;
  }

  async loadSession(slug: string): Promise<S> {
    const found = SLUG.test(slug) ? this.#files.get(slug) : undefined;
    if (found === undefined) throw new SessionNotFoundError(slug);
    const { file, load } = found;

    const result = checkSessionData(file, await load(), this.#schema);
    if (!result.ok) throw new ContentValidationError(result.problems);

    const mismatch = checkSlugMatchesFile(file, result.session);
    if (mismatch.length > 0) throw new ContentValidationError(mismatch);

    return result.session;
  }
}

/** The app's content source: bundled sessions checked against production slide types. */
export function createStaticContentSource(): ContentSource {
  return new StaticContentSource({
    loaders: sessionLoaders,
    schema: sessionSchema,
  });
}
