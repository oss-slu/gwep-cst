import { z } from "zod/mini";
import type { CmsField } from "../cms-field.ts";

/** The calendar slides' only content: an optional question or words above the date. */
export const calendarFields = { heading: z.optional(z.string()) };

export function calendarCmsFields(what: string): readonly CmsField[] {
  return [
    {
      name: "heading",
      label: `Question or words above the ${what}`,
      widget: "string",
      required: false,
      hint: `Optional, for example: What ${what} is it today? Leave empty for none.`,
    },
  ];
}
