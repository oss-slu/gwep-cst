import type { SlideData } from "../types.ts";
import type { calendarFields } from "../calendar/fields.ts";

export type CalendarYearSlideData = SlideData<
  "calendar-year",
  typeof calendarFields
>;
