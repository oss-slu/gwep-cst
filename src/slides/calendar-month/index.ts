import { calendarCmsFields, calendarFields } from "../calendar/fields.ts";
import { slideComponents } from "../components.ts";
import { defineSlide } from "../types.ts";

export const calendarMonthSlide = defineSlide({
  type: "calendar-month",
  label: "Calendar: month",
  fields: calendarFields,
  cmsFields: calendarCmsFields("month"),
  loadComponent: slideComponents["calendar-month"],
});
