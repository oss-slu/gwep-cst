import { z } from "zod/mini";

// Files in src/content import each other with explicit ".ts" extensions so
// that scripts/validate-content.ts can run them directly with Node.

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function kebabCase(what: string) {
  return z
    .string()
    .check(
      z.regex(
        KEBAB_CASE,
        `${what} must use lowercase letters, digits and single hyphens`,
      ),
    );
}

function requiredText(what: string) {
  return z
    .string()
    .check(z.trim(), z.minLength(1, `${what} must not be empty`));
}

// Media is served from this site only: /media/<folder>/<file>.<ext>.
// No external URLs, no "..", and only the approved file types.
function mediaPath(kind: string, extensions: readonly string[]) {
  const pattern = new RegExp(
    `^/media/[a-z0-9]+(?:-[a-z0-9]+)*/[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*\\.(?:${extensions.join("|")})$`,
  );
  return z
    .string()
    .check(
      z.regex(
        pattern,
        `${kind} path must look like /media/<folder>/<file> and end in .${extensions.join(", .")}`,
      ),
    );
}

const imagePath = mediaPath("Image", ["jpg", "jpeg", "png", "webp", "avif"]);

function pixels(what: string) {
  return z
    .number()
    .check(
      z.int(`${what} must be a whole number of pixels`),
      z.minimum(1, `${what} must be more than 0`),
    );
}

/**
 * An image with its accessibility text (AGENTS.md rule 10) and its size in
 * pixels, so the page can reserve its space before it loads. Optional
 * variants are the same picture at other widths, with the same shape, so
 * browsers can pick a smaller file for a smaller screen.
 */
export const imageSchema = z
  .strictObject({
    src: imagePath,
    alt: z.string(),
    decorative: z.optional(z.boolean()),
    width: pixels("Image width"),
    height: pixels("Image height"),
    variants: z.optional(
      z.array(
        z.strictObject({ src: imagePath, width: pixels("Variant width") }),
      ),
    ),
  })
  .check(
    z.superRefine((image, ctx) => {
      const widths = new Set<number>([image.width]);
      image.variants?.forEach((variant, index) => {
        if (widths.has(variant.width)) {
          ctx.addIssue({
            code: "custom",
            path: ["variants", index, "width"],
            message: `Width ${String(variant.width)} is already used by this image or another variant`,
          });
        }
        widths.add(variant.width);
      });
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
    }),
  );

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
  notes: z.optional(z.string()),
};

/** Builds the session schema around the slide check of a slide registry. */
export function createSessionSchema<S extends { readonly id: string }>(
  slideSchema: z.ZodMiniType<S>,
) {
  return z
    .strictObject({
      slug: kebabCase("Session slug"),
      number: z.number().check(z.int(), z.minimum(1), z.maximum(14)),
      title: requiredText("Session title"),
      slides: z
        .array(slideSchema)
        .check(z.minLength(1, "A session needs at least one slide")),
    })
    .check(
      z.superRefine((session, ctx) => {
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
      }),
    );
}

export type SessionSchema<S extends { readonly id: string }> = ReturnType<
  typeof createSessionSchema<S>
>;
export type SessionOf<S extends { readonly id: string }> = z.output<
  SessionSchema<S>
>;

export type Image = z.infer<typeof imageSchema>;
export type Audio = z.infer<typeof audioSchema>;
