import type { CmsField } from "../cms-field.ts";
import { MAX_LEVELS, MIN_LEVELS } from "./schema.ts";

export const weatherCmsFields: readonly CmsField[] = [
  {
    name: "heading",
    label: "Question",
    widget: "string",
    hint: "The words above the thermometer, for example: What is the weather like today?",
  },
  {
    name: "levels",
    label: "Thermometer levels, coldest first",
    widget: "list",
    hint: `Between ${String(MIN_LEVELS)} and ${String(MAX_LEVELS)} plain words, from coldest to hottest, for example: Cold, Mild, Hot.`,
    fields: [{ name: "label", label: "Words", widget: "string" }],
  },
];
