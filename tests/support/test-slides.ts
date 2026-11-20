import { createSessionSchema } from "../../src/content/schema.ts";
import { audioFields, imageFields } from "../../src/slides/cms-field.ts";
import { createSlideRegistry } from "../../src/slides/registry.ts";
import { defineSlide } from "../../src/slides/types.ts";
import { testMediaFields, testTextFields } from "./test-slide-fields.ts";

export const testTextSlide = defineSlide({
  type: "test-text",
  label: "Test: text",
  fields: testTextFields,
  cmsFields: [
    {
      name: "text",
      label: "Text",
      widget: "text",
      hint: 'Quotes "like this", a colon: and a # stay as written.\nSecond line; café.',
    },
  ],
  loadComponent: () => import("./TestTextSlide.tsx"),
});

export const testMediaSlide = defineSlide({
  type: "test-media",
  label: "Test: picture and sound",
  fields: testMediaFields,
  cmsFields: [imageFields("image", "Picture"), audioFields("sound", "Sound")],
  loadComponent: () => import("./TestMediaSlide.tsx"),
});

export const testRegistry = createSlideRegistry([
  testTextSlide,
  testMediaSlide,
]);
export const testSessionSchema = createSessionSchema(testRegistry.slideSchema);
