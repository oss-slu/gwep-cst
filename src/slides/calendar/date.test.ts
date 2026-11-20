import { describe, expect, it } from "vitest";
import {
  calendarDateIn,
  fullDate,
  monthName,
  weekdayName,
  type CalendarDate,
} from "./date.ts";

// Expected weekdays were checked independently (Python's datetime and Node's
// Intl) before these tests were written.

describe("calendarDateIn", () => {
  it.each([
    [
      "2026-11-21T05:30:00Z",
      "America/Chicago",
      { year: 2026, month: 11, day: 20 },
    ],
    ["2026-11-21T05:30:00Z", "UTC", { year: 2026, month: 11, day: 21 }],
    [
      "2026-11-20T11:30:00Z",
      "Pacific/Auckland",
      { year: 2026, month: 11, day: 21 },
    ],
    [
      "2027-01-01T05:59:00Z",
      "America/Chicago",
      { year: 2026, month: 12, day: 31 },
    ],
    [
      "2027-01-01T06:00:00Z",
      "America/Chicago",
      { year: 2027, month: 1, day: 1 },
    ],
    // The night US clocks change (March 8, 2026), just after 2am local time.
    [
      "2026-03-08T08:30:00Z",
      "America/Chicago",
      { year: 2026, month: 3, day: 8 },
    ],
  ])(
    "turns %s in %s into the local calendar date",
    (instant, zone, expected) => {
      expect(calendarDateIn(new Date(instant), zone)).toEqual(expected);
    },
  );
});

describe("date names", () => {
  const cases: [CalendarDate, string, string, string][] = [
    [
      { year: 2026, month: 11, day: 20 },
      "Friday",
      "November",
      "November 20, 2026",
    ],
    [
      { year: 2026, month: 12, day: 31 },
      "Thursday",
      "December",
      "December 31, 2026",
    ],
    [{ year: 2027, month: 1, day: 1 }, "Friday", "January", "January 1, 2027"],
    [
      { year: 2028, month: 2, day: 29 },
      "Tuesday",
      "February",
      "February 29, 2028",
    ],
    [{ year: 2026, month: 3, day: 8 }, "Sunday", "March", "March 8, 2026"],
  ];

  it.each(cases)("names %o", (date, weekday, month, full) => {
    expect(weekdayName(date)).toBe(weekday);
    expect(monthName(date)).toBe(month);
    expect(fullDate(date)).toBe(full);
  });
});
