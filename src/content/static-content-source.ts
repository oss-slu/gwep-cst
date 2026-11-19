import type { ContentSource } from "./content-source.ts";
import { ContentValidationError, SessionNotFoundError } from "./errors.ts";
import type { Session } from "./schema.ts";
import { sessionLoaders } from "./session-loaders.ts";
import { checkSessionData, checkSlugMatchesFile } from "./validate.ts";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SessionLoaders = Readonly<Record<string, () => Promise<unknown>>>;

/** Loads sessions bundled with the site from content/sessions/<slug>.json. */
export class StaticContentSource implements ContentSource {
  readonly #loaders: SessionLoaders;

  constructor(loaders: SessionLoaders = sessionLoaders) {
    this.#loaders = loaders;
  }

  async loadSession(slug: string): Promise<Session> {
    const file = `/content/sessions/${slug}.json`;
    const load = SLUG.test(slug) ? this.#loaders[file] : undefined;
    if (load === undefined) throw new SessionNotFoundError(slug);

    const result = checkSessionData(file, await load());
    if (!result.ok) throw new ContentValidationError(result.problems);

    const mismatch = checkSlugMatchesFile(file, result.session);
    if (mismatch.length > 0) throw new ContentValidationError(mismatch);

    return result.session;
  }
}
