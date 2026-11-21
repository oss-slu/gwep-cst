import { z } from "zod";
import { imageSchema } from "../../content/schema.ts";
import type { SlideData } from "../types.ts";

export const revealFields = {
  prompt: z.string().trim().min(1, "Question must not be empty"),
  image: imageSchema,
  answer: z.string().trim().min(1, "Answer must not be empty"),
};

export type RevealSlideData = SlideData<"reveal", typeof revealFields>;
