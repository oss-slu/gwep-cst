import type { CmsField } from "../cms-field.ts";

export const titleCmsFields: readonly CmsField[] = [
  {
    name: "heading",
    label: "Heading",
    widget: "string",
    hint: "The large words on the slide, for example: Welcome to CST.",
  },
  {
    name: "subheading",
    label: "Smaller text",
    widget: "text",
    required: false,
    hint: "Optional. Shown under the heading.",
  },
];
