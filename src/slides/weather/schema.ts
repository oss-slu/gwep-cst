import { z } from "zod/mini";
import type { SlideData } from "../types.ts";

export const MIN_LEVELS = 2;
export const MAX_LEVELS = 7;

export const weatherFields = {
  heading: z
    .string()
    .check(z.trim(), z.minLength(1, "Heading must not be empty")),
  /** Plain words from coldest to hottest, such as Cold, Mild, Hot. */
  levels: z
    .array(
      z.strictObject({
        label: z
          .string()
          .check(z.trim(), z.minLength(1, "Level words must not be empty")),
      }),
    )
    .check(
      z.minLength(
        MIN_LEVELS,
        `A thermometer needs at least ${String(MIN_LEVELS)} levels`,
      ),
      z.maxLength(
        MAX_LEVELS,
        `A thermometer can have at most ${String(MAX_LEVELS)} levels`,
      ),
    ),
};

export type WeatherSlideData = SlideData<"weather", typeof weatherFields>;

/**
 * The level the marker starts on: the middle one, or the lower of the two
 * middle levels when there is an even number.
 */
export function startLevel(count: number): number {
  return Math.floor((count - 1) / 2);
}
