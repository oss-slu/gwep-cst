import { calendarCmsFields, calendarFields } from "../calendar/fields.ts";
import { slideComponents } from "../components.ts";
import { defineSlide } from "../types.ts";

export const calendarDaySlide = defineSlide({
  type: "calendar-day",
  label: "Calendar: day of the week",
  fields: calendarFields,
  cmsFields: calendarCmsFields("day"),
  loadComponent: slideComponents["calendar-day"],
});
