import { z } from "zod/mini";
import { imageSchema } from "../../content/schema.ts";
import type { SlideData } from "../types.ts";

export const revealFields = {
  prompt: z
    .string()
    .check(z.trim(), z.minLength(1, "Question must not be empty")),
  image: imageSchema,
  answer: z
    .string()
    .check(z.trim(), z.minLength(1, "Answer must not be empty")),
};

export type RevealSlideData = SlideData<"reveal", typeof revealFields>;
