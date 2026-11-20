import type { z } from "zod";
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
  readonly schema: z.ZodType<S>;
}

/** Loads sessions bundled with the site from content/sessions/<slug>.json. */
export class StaticContentSource<
  S extends SessionSummary,
> implements ContentSource<S> {
  readonly #loaders: SessionLoaders;
  readonly #schema: z.ZodType<S>;

  constructor({ loaders, schema }: StaticContentSourceOptions<S>) {
    this.#loaders = loaders;
    this.#schema = schema;
  }

  async loadSession(slug: string): Promise<S> {
    const file = `/content/sessions/${slug}.json`;
    const load = SLUG.test(slug) ? this.#loaders[file] : undefined;
    if (load === undefined) throw new SessionNotFoundError(slug);

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
