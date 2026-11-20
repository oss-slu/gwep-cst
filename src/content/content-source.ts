import type { Session } from "./session-schema.ts";

/**
 * Where session content comes from. Components depend on this interface, so
 * content can move (for example to R2 or an API) without touching them.
 */
export interface ContentSource<S = Session> {
  /** Resolves with a validated session, or rejects with an AppError. */
  loadSession(slug: string): Promise<S>;
}
