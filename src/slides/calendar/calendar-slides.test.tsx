import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { calendarDaySlide } from "../calendar-day/index.ts";
import { calendarMonthSlide } from "../calendar-month/index.ts";
import { calendarYearSlide } from "../calendar-year/index.ts";
import { TodayProvider } from "./today.tsx";

const Day = (await calendarDaySlide.loadComponent()).default;
const Month = (await calendarMonthSlide.loadComponent()).default;
const Year = (await calendarYearSlide.loadComponent()).default;

function onDate(year: number, month: number, day: number, slide: ReactNode) {
  return render(
    <TodayProvider date={{ year, month, day }}>{slide}</TodayProvider>,
  );
}

/** Anything that could draw a mark around the date, like the old red circle. */
function marks(container: HTMLElement) {
  return container.querySelectorAll(
    "svg, circle, img, canvas, [class*='circle'], [class*='highlight']",
  );
}

describe("calendar-day slide", () => {
  it("shows the weekday and the full date", () => {
    onDate(2026, 11, 20, <Day slide={{ type: "calendar-day", id: "day" }} />);
    expect(screen.getByText("Friday")).toBeDefined();
    expect(screen.getByText("November 20, 2026")).toBeDefined();
  });

  it("shows the correct weekday on a leap day", () => {
    onDate(2028, 2, 29, <Day slide={{ type: "calendar-day", id: "day" }} />);
    expect(screen.getByText("Tuesday")).toBeDefined();
  });

  it("draws no circle or other mark", () => {
    const { container } = onDate(
      2026,
      11,
      20,
      <Day slide={{ type: "calendar-day", id: "day" }} />,
    );
    expect(marks(container)).toHaveLength(0);
  });
});

describe("calendar-month slide", () => {
  it("shows the month name", () => {
    onDate(
      2026,
      9,
      16,
      <Month slide={{ type: "calendar-month", id: "month" }} />,
    );
    expect(screen.getByText("September")).toBeDefined();
  });

  it("draws no circle or other mark", () => {
    const { container } = onDate(
      2026,
      11,
      20,
      <Month slide={{ type: "calendar-month", id: "month" }} />,
    );
    expect(marks(container)).toHaveLength(0);
  });
});

describe("calendar-year slide", () => {
  it("shows the year in the prominent style", () => {
    onDate(2027, 1, 1, <Year slide={{ type: "calendar-year", id: "year" }} />);
    const year = screen.getByText("2027");
    expect(year.className).toContain("calendar__value--year");
  });
});

describe("calendar slide headings", () => {
  it("shows a supplied heading above the date", () => {
    onDate(
      2026,
      11,
      20,
      <Day
        slide={{
          type: "calendar-day",
          id: "day",
          heading: "What day is it today?",
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "What day is it today?" }),
    ).toBeDefined();
  });

  it.each([undefined, "", "  "])(
    "leaves out a blank heading (%j)",
    (heading) => {
      onDate(
        2026,
        11,
        20,
        <Month
          slide={{
            type: "calendar-month",
            id: "month",
            ...(heading === undefined ? {} : { heading }),
          }}
        />,
      );
      expect(screen.queryByRole("heading")).toBeNull();
    },
  );
});

describe("calendar slide modules", () => {
  it.each([calendarDaySlide, calendarMonthSlide, calendarYearSlide])(
    "$type has a strict schema and an optional heading field",
    (module) => {
      const ok = { type: module.type, id: "x" };
      expect(module.schema.safeParse(ok).success).toBe(true);
      expect(module.schema.safeParse({ ...ok, heading: "Q?" }).success).toBe(
        true,
      );
      expect(
        module.schema.safeParse({ ...ok, date: "2026-11-20" }).success,
      ).toBe(false);
      expect(module.cmsFields).toMatchObject([
        { name: "heading", required: false },
      ]);
    },
  );
});
