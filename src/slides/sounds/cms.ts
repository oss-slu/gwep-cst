import { audioFields, type CmsField } from "../cms-field.ts";
import { MAX_CLIPS, MIN_CLIPS } from "./schema.ts";

export const soundsCmsFields: readonly CmsField[] = [
  {
    name: "heading",
    label: "Question",
    widget: "string",
    hint: "The words above the sounds, for example: What can you hear?",
  },
  {
    name: "clips",
    label: "Sounds",
    widget: "list",
    hint: `Between ${String(MIN_CLIPS)} and ${String(MAX_CLIPS)} sounds. Each has its own Play button and is shown with its description.`,
    fields: [audioFields("sound", "Sound")],
  },
];
