import { calendarCmsFields, calendarFields } from "../calendar/fields.ts";
import { defineSlide } from "../types.ts";

export const calendarDaySlide = defineSlide({
  type: "calendar-day",
  label: "Calendar: day of the week",
  fields: calendarFields,
  cmsFields: calendarCmsFields("day"),
  loadComponent: () => import("./Component.tsx"),
});
