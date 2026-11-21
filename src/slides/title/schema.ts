import { z } from "zod";
import type { SlideData } from "../types.ts";

export const titleFields = {
  heading: z.string().trim().min(1, "Heading must not be empty"),
  subheading: z.string().optional(),
};

export type TitleSlideData = SlideData<"title", typeof titleFields>;
