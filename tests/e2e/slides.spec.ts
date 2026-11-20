import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Runs against the test-only preview page on the Vite dev server (see
// playwright.config.ts). Every slide is rendered with a fixed date.
const PREVIEW = "http://localhost:4175/tests/visual/slides.html";

const viewports = [
  { name: "phone", width: 375, height: 667 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "shared screen", width: 1920, height: 1080 },
];

// September 16, 2026 is a Wednesday: the longest weekday and month names.
const LONG_NAMES_DATE = "2026-09-16";

const slides = {
  title: {
    type: "title",
    id: "welcome",
    heading: "Welcome to CST",
    subheading: "Today we talk about the date and the weather.",
  },
  day: {
    type: "calendar-day",
    id: "day",
    heading: "What day is it today?",
  },
  month: { type: "calendar-month", id: "month", heading: "What month is it?" },
  year: { type: "calendar-year", id: "year" },
};

const longTitle = {
  type: "title",
  id: "closing",
  heading:
    "Thank you all for coming to our Cognitive Stimulation Therapy session today",
  subheading:
    "We will meet again next week at the same time. Please remember to bring a photograph of a favourite place, if you would like to.",
};
const longHeadingDay = {
  type: "calendar-day",
  id: "day",
  heading:
    "Can anyone tell me which day of the week it is today, and what we did yesterday?",
};

async function open(page: Page, slide: object, date = LONG_NAMES_DATE) {
  const url = `${PREVIEW}?date=${date}&slide=${encodeURIComponent(JSON.stringify(slide))}`;
  await page.goto(url);
  await expect(page.locator(".slide")).toBeVisible();
}

/** Layout facts measured in the page. */
function measure(page: Page) {
  return page.evaluate(() => {
    function luminance(rgb: number[]) {
      const [r = 0, g = 0, b = 0] = rgb.map((value) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    function channels(color: string) {
      return (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    }
    function background(element: Element | null): string {
      for (let node = element; node; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor;
        if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent")
          return color;
      }
      return "rgb(255, 255, 255)";
    }

    const texts = [...document.querySelectorAll(".slide h2, .slide p")];
    const width = document.documentElement.clientWidth;
    return {
      horizontalScroll: document.documentElement.scrollWidth > width,
      fitsViewport: document.documentElement.scrollHeight <= window.innerHeight,
      texts: texts.map((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const fore = luminance(channels(style.color));
        const back = luminance(channels(background(element)));
        return {
          text: element.textContent,
          fontSize: parseFloat(style.fontSize),
          contrast:
            (Math.max(fore, back) + 0.05) / (Math.min(fore, back) + 0.05),
          insideViewport: box.left >= 0 && box.right <= width,
          clipped:
            element.scrollWidth > element.clientWidth ||
            element.scrollHeight > element.clientHeight,
        };
      }),
      marks: document.querySelectorAll(".slide svg, .slide canvas, .slide img")
        .length,
    };
  });
}

function expectReadable(facts: Awaited<ReturnType<typeof measure>>) {
  expect(facts.horizontalScroll).toBe(false);
  expect(facts.texts.length).toBeGreaterThan(0);
  for (const text of facts.texts) {
    expect(text.fontSize, text.text).toBeGreaterThanOrEqual(24);
    expect(text.contrast, text.text).toBeGreaterThanOrEqual(7);
    expect(text.insideViewport, text.text).toBe(true);
    expect(text.clipped, text.text).toBe(false);
  }
}

for (const viewport of viewports) {
  test.describe(`slides on a ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const [name, slide] of Object.entries(slides)) {
      test(`${name} slide is legible, high contrast and fits`, async ({
        page,
      }) => {
        await open(page, slide);
        const facts = await measure(page);
        expectReadable(facts);
        expect(facts.fitsViewport).toBe(true);
        expect(facts.marks).toBe(0);

        const axe = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        const blocking = axe.violations.filter(
          (violation) =>
            violation.impact === "serious" || violation.impact === "critical",
        );
        expect(blocking).toEqual([]);
      });
    }

    test("shows the right date text", async ({ page }) => {
      await open(page, slides.day, "2026-11-20");
      await expect(page.getByText("Friday", { exact: true })).toBeVisible();
      await expect(page.getByText("November 20, 2026")).toBeVisible();
    });

    test("makes the year the most prominent calendar text", async ({
      page,
    }) => {
      const valueSize = async (slide: object) => {
        await open(page, slide);
        return page
          .locator(".calendar__value")
          .evaluate((element) =>
            parseFloat(getComputedStyle(element).fontSize),
          );
      };
      const year = await valueSize(slides.year);
      expect(year).toBeGreaterThan(await valueSize(slides.day));
      expect(year).toBeGreaterThan(await valueSize(slides.month));
    });
  });
}

test.describe("long supplied text on a phone", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  for (const [name, slide] of [
    ["title and text", longTitle],
    ["calendar heading", longHeadingDay],
  ] as const) {
    test(`${name} wraps and stays fully visible`, async ({ page }) => {
      await open(page, slide);
      const facts = await measure(page);
      expectReadable(facts);
      const heading = page.getByRole("heading", { level: 2 });
      const lineHeight = await heading.evaluate((element) =>
        parseFloat(getComputedStyle(element).lineHeight),
      );
      const box = await heading.boundingBox();
      // It wrapped onto several lines rather than overflowing one.
      expect((box?.height ?? 0) / lineHeight).toBeGreaterThan(1.5);
    });
  }
});
