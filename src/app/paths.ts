// Addresses in the app. Slides are addressed by their stable id from the
// session file, never by position, so links survive reordering.

export const HOME = "/";
export const SESSION_ROUTE = "/sessions/:slug/:slideId?";

export function sessionPath(slug: string): string {
  return `/sessions/${encodeURIComponent(slug)}`;
}

export function slidePath(slug: string, slideId: string): string {
  return `${sessionPath(slug)}/${encodeURIComponent(slideId)}`;
}
