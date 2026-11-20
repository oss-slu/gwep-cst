// Calendar dates for the orientation slides. A moment becomes a calendar date
// only in a named time zone; after that, names are formatted from the date
// alone (in UTC), so results never depend on the machine's clock or zone.

/** A day on the calendar. `month` runs from 1 to 12. */
export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

// en-US for M0; other languages are deferred (design §2.5).
const LOCALE = "en-US";

/** The calendar date of `instant` in `timeZone`, for example "America/Chicago". */
export function calendarDateIn(instant: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

/** The time zone of the device showing the slides (the facilitator's screen). */
export function viewerTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function format(
  date: CalendarDate,
  options: Intl.DateTimeFormatOptions,
): string {
  // Noon UTC on that date, formatted in UTC: the same calendar day everywhere.
  const noon = new Date(Date.UTC(date.year, date.month - 1, date.day, 12));
  return new Intl.DateTimeFormat(LOCALE, {
    ...options,
    timeZone: "UTC",
  }).format(noon);
}

/** "Friday" */
export function weekdayName(date: CalendarDate): string {
  return format(date, { weekday: "long" });
}

/** "November" */
export function monthName(date: CalendarDate): string {
  return format(date, { month: "long" });
}

/** "November 20, 2026" */
export function fullDate(date: CalendarDate): string {
  return format(date, { year: "numeric", month: "long", day: "numeric" });
}
