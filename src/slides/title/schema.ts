import { z } from "zod/mini";
import type { SlideData } from "../types.ts";

export const titleFields = {
  heading: z
    .string()
    .check(z.trim(), z.minLength(1, "Heading must not be empty")),
  subheading: z.optional(z.string()),
};

export type TitleSlideData = SlideData<"title", typeof titleFields>;
