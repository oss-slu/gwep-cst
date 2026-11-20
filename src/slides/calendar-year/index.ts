import { calendarCmsFields, calendarFields } from "../calendar/fields.ts";
import { defineSlide } from "../types.ts";

export const calendarYearSlide = defineSlide({
  type: "calendar-year",
  label: "Calendar: year",
  fields: calendarFields,
  cmsFields: calendarCmsFields("year"),
  loadComponent: () => import("./Component.tsx"),
});
