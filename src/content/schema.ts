import { z } from "zod";

// Files in src/content import each other with explicit ".ts" extensions so
// that scripts/validate-content.ts can run them directly with Node.

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function kebabCase(what: string) {
  return z
    .string()
    .regex(
      KEBAB_CASE,
      `${what} must use lowercase letters, digits and single hyphens`,
    );
}

function requiredText(what: string) {
  return z.string().trim().min(1, `${what} must not be empty`);
}

// Media is served from this site only: /media/<folder>/<file>.<ext>.
// No external URLs, no "..", and only the approved file types.
function mediaPath(kind: string, extensions: readonly string[]) {
  const pattern = new RegExp(
    `^/media/[a-z0-9]+(?:-[a-z0-9]+)*/[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*\\.(?:${extensions.join("|")})$`,
  );
  return z
    .string()
    .regex(
      pattern,
      `${kind} path must look like /media/<folder>/<file> and end in .${extensions.join(", .")}`,
    );
}

/** An image with its accessibility text (AGENTS.md rule 10). */
export const imageSchema = z
  .strictObject({
    src: mediaPath("Image", ["jpg", "jpeg", "png", "webp", "avif"]),
    alt: z.string(),
    decorative: z.boolean().optional(),
  })
  .superRefine((image, ctx) => {
    const decorative = image.decorative === true;
    if (decorative && image.alt !== "") {
      ctx.addIssue({
        code: "custom",
        path: ["alt"],
        message: "A decorative image must have empty alt text",
      });
    }
    if (!decorative && image.alt.trim() === "") {
      ctx.addIssue({
        code: "custom",
        path: ["alt"],
        message: "Alt text is required unless the image is marked decorative",
      });
    }
  });

/** A sound clip with the text description every sound needs (AGENTS.md rule 6). */
export const audioSchema = z.strictObject({
  src: mediaPath("Audio", ["mp3", "m4a", "ogg"]),
  description: requiredText("Audio description"),
});

/**
 * Fields every slide shares. Slide modules add these to their own strict
 * schema through defineSlide() in src/slides/types.ts.
 */
export const baseSlideShape = {
  id: kebabCase("Slide id"),
  notes: z.string().optional(),
};

/** Builds the session schema around the slide check of a slide registry. */
export function createSessionSchema<S extends { readonly id: string }>(
  slideSchema: z.ZodType<S>,
) {
  return z
    .strictObject({
      slug: kebabCase("Session slug"),
      number: z.int().min(1).max(14),
      title: requiredText("Session title"),
      slides: z.array(slideSchema).min(1, "A session needs at least one slide"),
    })
    .superRefine((session, ctx) => {
      const seen = new Set<string>();
      session.slides.forEach((slide, index) => {
        if (seen.has(slide.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["slides", index, "id"],
            message: `Slide id "${slide.id}" is used more than once`,
          });
        }
        seen.add(slide.id);
      });
    });
}

export type SessionSchema<S extends { readonly id: string }> = ReturnType<
  typeof createSessionSchema<S>
>;
export type SessionOf<S extends { readonly id: string }> = z.output<
  SessionSchema<S>
>;

export type Image = z.infer<typeof imageSchema>;
export type Audio = z.infer<typeof audioSchema>;
