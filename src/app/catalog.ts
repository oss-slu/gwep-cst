import catalogData from "../../content/catalog.json" with { type: "json" };

// The fourteen sessions in project order. validate-content checks this file
// at build time, so the app reads it without bundling a schema library.

export type CatalogEntry = (typeof catalogData.sessions)[number];

export const catalog: readonly CatalogEntry[] = catalogData.sessions;

export function findCatalogEntry(slug: string): CatalogEntry | undefined {
  return catalog.find((entry) => entry.slug === slug);
}
