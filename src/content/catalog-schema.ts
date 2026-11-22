import { z } from "zod/mini";

// content/catalog.json lists the fourteen sessions in project order. The app
// imports it directly (no zod in the first download); validate-content checks
// it against this schema at build time.

const SESSION_COUNT = 14;

const catalogEntrySchema = z.strictObject({
  number: z.number().check(z.int(), z.minimum(1), z.maximum(SESSION_COUNT)),
  title: z
    .string()
    .check(z.trim(), z.minLength(1, "Session title must not be empty")),
  slug: z
    .string()
    .check(
      z.regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Session slug must use lowercase letters, digits and single hyphens",
      ),
    ),
  /** Only available sessions are playable; the rest show "Coming soon". */
  available: z.boolean(),
});

export const catalogSchema = z
  .strictObject({
    sessions: z
      .array(catalogEntrySchema)
      .check(
        z.length(
          SESSION_COUNT,
          `The catalog must list all ${String(SESSION_COUNT)} sessions`,
        ),
      ),
  })
  .check(
    z.superRefine((catalog, ctx) => {
      const slugs = new Set<string>();
      catalog.sessions.forEach((entry, index) => {
        if (entry.number !== index + 1) {
          ctx.addIssue({
            code: "custom",
            path: ["sessions", index, "number"],
            message: `Sessions must be listed in order: expected number ${String(index + 1)}, found ${String(entry.number)}`,
          });
        }
        if (slugs.has(entry.slug)) {
          ctx.addIssue({
            code: "custom",
            path: ["sessions", index, "slug"],
            message: `Slug "${entry.slug}" is used more than once`,
          });
        }
        slugs.add(entry.slug);
      });
    }),
  );

export type Catalog = z.output<typeof catalogSchema>;
