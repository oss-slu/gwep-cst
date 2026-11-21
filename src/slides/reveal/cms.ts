import { imageFields, type CmsField } from "../cms-field.ts";

export const revealCmsFields: readonly CmsField[] = [
  {
    name: "prompt",
    label: "Question",
    widget: "string",
    hint: "Shown above the picture, for example: What state is the famous landmark located?",
  },
  imageFields("image", "Picture"),
  {
    name: "answer",
    label: "Answer",
    widget: "text",
    hint: "Hidden until the facilitator presses Reveal answer.",
  },
];
