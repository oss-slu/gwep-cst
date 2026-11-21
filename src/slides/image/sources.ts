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

/**
 * The pictures in some slide data: every object with a src, a width and a
 * height, which is imageSchema's shape. Sounds have no width, so they are
 * never included and nothing downloads audio before Play.
 */
export function imagesIn(value: unknown): Image[] {
  if (Array.isArray(value)) return value.flatMap(imagesIn);
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  if (
    typeof record.src === "string" &&
    typeof record.width === "number" &&
    typeof record.height === "number"
  ) {
    return [value as Image];
  }
  return Object.values(record).flatMap(imagesIn);
}

/**
 * Starts downloading a picture the way its slide will (same srcset and
 * sizes, so the browser picks the same file), without adding it to the page.
 */
export function requestPicture(image: Image): HTMLImageElement {
  const picture = new window.Image();
  picture.decoding = "async";
  if (image.variants !== undefined) {
    picture.sizes = IMAGE_SIZES;
    picture.srcset = srcSet(image);
  }
  picture.src = image.src;
  return picture;
}
