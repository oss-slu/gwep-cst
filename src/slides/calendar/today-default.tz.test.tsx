import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calendarDaySlide } from "../calendar-day/index.ts";
import { viewerTimeZone } from "./date.ts";

// Run only through `npm run test:timezones`, which starts a separate test
// process for each zone below with TZ already set. Here the calendar slide is
// rendered without a TodayProvider, so it reads the (fake) clock in the
// process's own time zone, as it will on the facilitator's screen.

type Moment = readonly [instant: string, weekday: string, date: string];

const MOMENTS: Readonly<Record<string, readonly Moment[]>> = {
  "America/Chicago": [
    ["2026-11-21T05:30:00Z", "Friday", "November 20, 2026"],
    ["2026-11-21T05:59:59Z", "Friday", "November 20, 2026"], // 11:59:59 pm local
    ["2026-11-21T06:00:00Z", "Saturday", "November 21, 2026"], // local midnight
  ],
  UTC: [
    ["2026-11-21T05:30:00Z", "Saturday", "November 21, 2026"],
    ["2026-11-20T23:59:59Z", "Friday", "November 20, 2026"],
    ["2026-11-21T00:00:00Z", "Saturday", "November 21, 2026"],
  ],
  "Pacific/Auckland": [
    ["2026-11-20T11:30:00Z", "Saturday", "November 21, 2026"],
    ["2026-11-20T10:59:59Z", "Friday", "November 20, 2026"], // 11:59:59 pm local
    ["2026-11-20T11:00:00Z", "Saturday", "November 21, 2026"], // local midnight
  ],
};

const zone = viewerTimeZone();
const moments = MOMENTS[zone] ?? [];
const Day = (await calendarDaySlide.loadComponent()).default;

afterEach(() => {
  vi.useRealTimers();
});

describe(`today, without a TodayProvider, in ${zone}`, () => {
  it("runs in a time zone this test has expectations for", () => {
    expect(Object.keys(MOMENTS)).toContain(zone);
  });

  it.each(moments)("at %s shows %s, %s", (instant, weekday, date) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(instant));

    render(<Day slide={{ type: "calendar-day", id: "day" }} />);

    expect(screen.getByText(weekday)).toBeDefined();
    expect(screen.getByText(date)).toBeDefined();
  });
});
