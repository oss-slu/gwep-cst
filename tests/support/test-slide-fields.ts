import { z } from "zod";
import { audioSchema, imageSchema } from "../../src/content/schema.ts";
import type { SlideData } from "../../src/slides/types.ts";

// Test-only slide types. Fields and data types live apart from the modules so
// that each component can import its slide type without a circular reference.

export const testTextFields = { text: z.string().trim().min(1) };
export type TestTextSlide = SlideData<"test-text", typeof testTextFields>;

export const testMediaFields = { image: imageSchema, sound: audioSchema };
export type TestMediaSlide = SlideData<"test-media", typeof testMediaFields>;
