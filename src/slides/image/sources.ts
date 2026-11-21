import type { Image } from "../../content/schema.ts";

// How a slide picture chooses its file. Shared by SlideImage and the
// player's next-slide preload, so both ask the browser for the same file.

/** The picture's displayed width: half the screen on wide screens, else most of it. */
export const IMAGE_SIZES = "(min-width: 64rem) 50vw, 90vw";

/** The image and its variants as a srcset, widest first: "/a.jpg 1600w, ...". */
export function srcSet(image: Image): string {
  return [{ src: image.src, width: image.width }, ...(image.variants ?? [])]
    .sort((a, b) => b.width - a.width)
    .map((entry) => `${entry.src} ${String(entry.width)}w`)
    .join(", ");
}
