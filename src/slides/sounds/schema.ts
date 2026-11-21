import { z } from "zod";
import { audioSchema } from "../../content/schema.ts";
import type { SlideData } from "../types.ts";

export const MIN_CLIPS = 1;
export const MAX_CLIPS = 6;

export const soundsFields = {
  heading: z.string().trim().min(1, "Heading must not be empty"),
  /** Each clip's description is shown as text next to its Play button. */
  clips: z
    .array(z.strictObject({ sound: audioSchema }))
    .min(MIN_CLIPS, `A sounds slide needs at least ${String(MIN_CLIPS)} clip`)
    .max(
      MAX_CLIPS,
      `A sounds slide can have at most ${String(MAX_CLIPS)} clips`,
    ),
};

export type SoundsSlideData = SlideData<"sounds", typeof soundsFields>;
