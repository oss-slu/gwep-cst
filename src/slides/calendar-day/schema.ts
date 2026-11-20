import type { SlideData } from "../types.ts";
import type { calendarFields } from "../calendar/fields.ts";

export type CalendarDaySlideData = SlideData<
  "calendar-day",
  typeof calendarFields
>;
