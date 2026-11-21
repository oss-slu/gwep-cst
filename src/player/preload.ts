import { useEffect } from "react";
import { imagesIn, requestPicture } from "../slides/image/sources.ts";
import type { AnySlide, PlayerData } from "./player-data.ts";

/**
 * Gets the next slide ready while the current one is shown: its component
 * code (into the same cache the slide will use, without mounting it) and its
 * pictures (the same file the slide will choose, never added to the page).
 * Only the immediate next slide. Moving on, back or out of the session drops
 * the previous preload.
 *
 * A failed preload is not an error: a failed component load is forgotten so
 * the real load starts fresh, and a picture that failed is requested again
 * when its slide appears, with the usual retry if it fails again.
 */
export function usePreloadSlide<S extends AnySlide>(
  data: PlayerData<S>,
  slide: S | undefined,
): void {
  useEffect(() => {
    if (slide === undefined) return;
    data.loadComponent(slide).catch(() => {
      data.forgetFailures();
    });
    const pictures = imagesIn(slide).map(requestPicture);
    return () => {
      // Stop any download still running and drop the references.
      for (const picture of pictures) {
        picture.removeAttribute("srcset");
        picture.removeAttribute("src");
      }
      pictures.length = 0;
    };
  }, [data, slide]);
}
