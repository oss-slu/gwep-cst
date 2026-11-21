import type { SlideData } from "../types.ts";
import type { calendarFields } from "../calendar/fields.ts";

export type CalendarMonthSlideData = SlideData<
  "calendar-month",
  typeof calendarFields
>;
