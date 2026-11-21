import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";
import site from "../../content/site.json" with { type: "json" };

// Runs against the test-only player page (tests/visual/player.tsx) on the
// Vite dev server: the real player and slide types with a fixture session.
// Pictures come from tests/fixtures/media through request interception.
const PLAYER = "http://localhost:4175/tests/visual/player.html";
const { ui } = site;
const QUESTION = "Fixture weather question?";
const ALT = "Fixture picture description";

// Each screen size with the picture variant its width should choose.
const viewports = [
  { name: "phone", width: 375, height: 667, variant: "landmark-400.png" },
  { name: "tablet", width: 768, height: 1024, variant: "landmark-800.png" },
  { name: "shared screen", width: 1920, height: 1080, variant: "landmark.png" },
];

type ImageMode = "serve" | "fail" | "hold";

/**
 * Serves the fixture pictures. "fail" aborts requests, "hold" keeps them
 * waiting until release() serves them, as on a slow connection.
 */
async function pictures(page: Page, initial: ImageMode = "serve") {
  let mode = initial;
  let requests = 0;
  const held: Route[] = [];
  const serve = (route: Route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    return route.fulfill({
      contentType: "image/png",
      body: readFileSync(`tests/fixtures/media/${name}`),
    });
  };
  await page.route("**/media/test/*.png", async (route) => {
    requests += 1;
    if (mode === "fail") await route.abort("internetdisconnected");
    else if (mode === "hold") held.push(route);
    else await serve(route);
  });
  return {
    set: (next: ImageMode) => {
      mode = next;
    },
    requests: () => requests,
    release: async () => {
      mode = "serve";
      await Promise.all(held.splice(0).map(serve));
    },
  };
}

async function open(page: Page, slide: string) {
  await page.goto(`${PLAYER}?slide=${slide}`);
  await expect(page.locator(".player__slide .slide")).toBeVisible();
}

const position = (page: Page) => page.locator(".player__position");
const thermometer = (page: Page) =>
  page.getByRole("slider", { name: QUESTION });
const revealButton = (page: Page) =>
  page.getByRole("button", { name: /^(Reveal|Hide) answer$/ });
const retryButton = (page: Page) =>
  page.getByRole("button", { name: ui.slides.image.retry });

async function expectNoBlockingAxe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    results.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
}

async function focusRing(page: Page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.activeElement ?? document.body);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
}

test.describe("weather thermometer", () => {
  test.beforeEach(async ({ page }) => {
    await pictures(page);
    await open(page, "weather");
  });

  test("starts in the middle and moves by keyboard without changing slide", async ({
    page,
  }) => {
    const slider = thermometer(page);
    await expect(slider).toHaveAttribute("aria-valuetext", "Fixture mild");
    await page.keyboard.press("Tab");
    await expect(slider).toBeFocused();
    expect(await focusRing(page)).toEqual({ style: "solid", width: 4 });

    for (const [key, level] of [
      ["ArrowUp", "Fixture warm"],
      ["ArrowRight", "Fixture hot"],
      ["ArrowDown", "Fixture warm"],
      ["ArrowLeft", "Fixture mild"],
      ["Home", "Fixture cold"],
      ["End", "Fixture hot"],
    ] as const) {
      await page.keyboard.press(key);
      await expect(slider, key).toHaveAttribute("aria-valuetext", level);
      await expect(position(page), key).toHaveText("Slide 2 of 6");
    }
  });

  test("Page Down and Page Up change the slide, not the marker", async ({
    page,
  }) => {
    await thermometer(page).focus();
    await page.evaluate(() => {
      const slider = document.querySelector("input[type=range]");
      Object.assign(window, { markerMoves: 0 });
      slider?.addEventListener("input", () => {
        Object.assign(window, {
          markerMoves:
            (window as unknown as { markerMoves: number }).markerMoves + 1,
        });
      });
    });
    await page.keyboard.press("PageDown");
    await expect(position(page)).toHaveText("Slide 3 of 6");
    expect(
      await page.evaluate(
        () => (window as unknown as { markerMoves: number }).markerMoves,
      ),
    ).toBe(0);

    await open(page, "weather");
    await thermometer(page).focus();
    await page.keyboard.press("PageUp");
    await expect(position(page)).toHaveText("Slide 1 of 6");
  });

  test("one click on a level's words or on the tube sets the marker", async ({
    page,
  }) => {
    const slider = thermometer(page);
    const centre = async (selector: string, text: string) => {
      const box = await page
        .locator(".thermometer__level", { hasText: text })
        .locator(selector)
        .boundingBox();
      if (box === null) throw new Error(`No ${text}`);
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    let point = await centre(".thermometer__label", "Fixture hot");
    await page.mouse.click(point.x, point.y);
    await expect(slider).toHaveAttribute("aria-valuetext", "Fixture hot");
    point = await centre(".thermometer__segment", "Fixture cold");
    await page.mouse.click(point.x, point.y);
    await expect(slider).toHaveAttribute("aria-valuetext", "Fixture cold");
    await expect(position(page)).toHaveText("Slide 2 of 6");
  });

  test("every level is a target at least 44 px tall and the full width", async ({
    page,
  }) => {
    const rows = await page
      .locator(".thermometer__level")
      .evaluateAll((items) =>
        items.map((item) => item.getBoundingClientRect().height),
      );
    expect(rows).toHaveLength(5);
    for (const height of rows) expect(height).toBeGreaterThanOrEqual(44);
    const input = await thermometer(page).boundingBox();
    const list = await page.locator(".thermometer__levels").boundingBox();
    expect(input).toEqual(list);
  });
});

test.describe("weather by touch", () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 667 } });

  test("one tap on a level's words or on the tube sets the marker", async ({
    page,
  }) => {
    await open(page, "weather");
    const tapOn = async (selector: string, text: string) => {
      const box = await page
        .locator(".thermometer__level", { hasText: text })
        .locator(selector)
        .boundingBox();
      if (box === null) throw new Error(`No ${text}`);
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    };
    await tapOn(".thermometer__label", "Fixture warm");
    await expect(thermometer(page)).toHaveAttribute(
      "aria-valuetext",
      "Fixture warm",
    );
    await tapOn(".thermometer__segment", "Fixture cool");
    await expect(thermometer(page)).toHaveAttribute(
      "aria-valuetext",
      "Fixture cool",
    );
    await expect(position(page)).toHaveText("Slide 2 of 6");
  });
});

test.describe("reveal", () => {
  test("Enter and Space toggle the answer; focus stays on the button", async ({
    page,
  }) => {
    await pictures(page);
    await open(page, "reveal");
    await expect(page.getByAltText(ALT)).toBeVisible();
    await expect(page.getByText("Fixture answer")).toHaveCount(0);

    await page.keyboard.press("Tab");
    await expect(revealButton(page)).toBeFocused();
    expect(await focusRing(page)).toEqual({ style: "solid", width: 4 });
    await page.keyboard.press("Enter");
    await expect(page.getByText("Fixture answer")).toBeVisible();
    await expect(revealButton(page)).toHaveAttribute("aria-expanded", "true");
    await expect(revealButton(page)).toHaveAccessibleName(
      ui.slides.reveal.hide,
    );
    await expect(revealButton(page)).toBeFocused();
    await expect(page.locator(".reveal__answer")).toHaveAttribute(
      "aria-live",
      "polite",
    );

    await page.keyboard.press("Space");
    await expect(page.getByText("Fixture answer")).toHaveCount(0);
    await expect(revealButton(page)).toBeFocused();
    await expect(position(page)).toHaveText("Slide 3 of 6");
  });

  test("a click reveals the answer without moving the picture or the button", async ({
    page,
  }) => {
    await pictures(page);
    await open(page, "reveal");
    await expect(page.getByAltText(ALT)).toBeVisible();
    const before = await geometry(page);
    await revealButton(page).click();
    await expect(page.getByText("Fixture answer")).toBeVisible();
    expect(await geometry(page)).toEqual(before);
    await revealButton(page).click();
    await expect(page.getByText("Fixture answer")).toHaveCount(0);
  });
});

test.describe("reveal by touch", () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 667 } });

  test("one tap reveals and one tap hides the answer", async ({ page }) => {
    await pictures(page);
    await open(page, "reveal");
    await revealButton(page).tap();
    await expect(page.getByText("Fixture answer")).toBeVisible();
    await revealButton(page).tap();
    await expect(page.getByText("Fixture answer")).toHaveCount(0);
  });
});

/** Where the picture frame and the Reveal button are. */
function geometry(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect === undefined
        ? null
        : [rect.x, rect.y, rect.width, rect.height].map(Math.round);
    };
    return {
      frame: box(".slide-image"),
      reveal: box(".reveal .slide-image ~ button"),
    };
  });
}

/** Starts recording layout shifts, including those after user input. */
async function recordShifts(page: Page) {
  await page.addInitScript(() => {
    const shifts: { value: number; hadRecentInput: boolean }[] = [];
    Object.assign(window, { layoutShifts: shifts });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        };
        shifts.push({
          value: shift.value,
          hadRecentInput: shift.hadRecentInput,
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  return async () => {
    const shifts = await page.evaluate(
      () =>
        (
          window as unknown as {
            layoutShifts: { value: number; hadRecentInput: boolean }[];
          }
        ).layoutShifts,
    );
    const sum = (items: typeof shifts) =>
      items.reduce((total, shift) => total + shift.value, 0);
    return {
      cls: sum(shifts.filter((shift) => !shift.hadRecentInput)),
      all: sum(shifts),
    };
  };
}

test.describe("picture failure and recovery", () => {
  test("a failed picture keeps the text, its description and Reveal; Retry recovers it", async ({
    page,
  }) => {
    const network = await pictures(page, "fail");
    await open(page, "reveal");
    const frame = page.locator(".slide-image");
    await expect(frame.getByText(ui.slides.image.failed)).toBeVisible();
    await expect(frame.getByText(ALT)).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Fixture reveal question?" }),
    ).toBeVisible();
    await expectNoBlockingAxe(page);

    // Reveal still works while the picture is missing.
    await revealButton(page).click();
    await expect(page.getByText("Fixture answer")).toBeVisible();

    // Retry is reachable by keyboard: it comes before Reveal in the slide.
    await revealButton(page).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(retryButton(page)).toBeFocused();
    expect(await focusRing(page)).toEqual({ style: "solid", width: 4 });

    network.set("serve");
    await page.keyboard.press("Enter");
    const picture = page.getByAltText(ALT);
    await expect(picture).toBeVisible();
    // Retry has gone; focus moved to the picture, which announces its description.
    await expect(retryButton(page)).toHaveCount(0);
    await expect(picture).toBeFocused();
    await expect(page.getByText("Fixture answer")).toBeVisible();
    await expect(position(page)).toHaveText("Slide 3 of 6");
  });

  test("Retry failing again keeps focus on Retry", async ({ page }) => {
    await pictures(page, "fail");
    await open(page, "reveal");
    await retryButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(retryButton(page)).toBeVisible();
    await expect(retryButton(page)).toBeFocused();
  });

  test("a slow recovery leaves focus where the facilitator moved it", async ({
    page,
  }) => {
    const network = await pictures(page, "fail");
    await open(page, "reveal");
    network.set("hold");
    await retryButton(page).click();
    await expect(
      page.getByRole("button", { name: ui.slides.image.retrying }),
    ).toBeVisible();
    await revealButton(page).focus();
    await network.release();
    await expect(page.getByAltText(ALT)).toBeVisible();
    await expect(revealButton(page)).toBeFocused();
  });

  test("a slow recovery while reading the description in the panel moves focus to the picture", async ({
    page,
  }) => {
    const network = await pictures(page, "fail");
    await open(page, "reveal");
    network.set("hold");
    await retryButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: ui.slides.image.retrying }),
    ).toBeVisible();
    // Back from Retry to the panel, as when reading a long description.
    await page.keyboard.press("Shift+Tab");
    await expect(
      page.getByRole("region", { name: ui.slides.image.failed }),
    ).toBeFocused();

    await network.release();
    const picture = page.getByAltText(ALT);
    await expect(picture).toBeVisible();
    await expect(page.locator(".slide-image__failed")).toHaveCount(0);
    await expect(picture).toBeFocused();
  });

  test("the picture's space and the Reveal button stay put through loading, failure, retry and recovery; CLS within 0.1", async ({
    page,
  }) => {
    const shifts = await recordShifts(page);
    const network = await pictures(page, "hold");
    await open(page, "reveal");

    const loading = await geometry(page);
    expect(loading.frame?.[2]).toBeGreaterThan(0);
    // The frame already has the picture's 4:3 shape before anything arrives.
    const [, , width = 0, height = 0] = loading.frame ?? [];
    expect(Math.abs(width / height - 4 / 3)).toBeLessThan(0.02);

    await network.release();
    await expect(page.getByAltText(ALT)).toBeVisible();
    expect(await geometry(page)).toEqual(loading);
    const slowLoad = await shifts();

    // A fresh page whose picture fails, then recovers after Retry.
    network.set("fail");
    await open(page, "reveal");
    await expect(retryButton(page)).toBeVisible();
    expect(await geometry(page)).toEqual(loading);

    network.set("hold");
    await retryButton(page).click();
    await expect(
      page.getByRole("button", { name: ui.slides.image.retrying }),
    ).toBeVisible();
    expect(await geometry(page)).toEqual(loading);

    await network.release();
    await expect(page.getByAltText(ALT)).toBeVisible();
    expect(await geometry(page)).toEqual(loading);

    const recovery = await shifts();
    for (const [state, measured] of [
      ["slow load", slowLoad],
      ["failure, retry and recovery", recovery],
    ] as const) {
      const description = `${state}: CLS ${measured.cls.toFixed(4)}, all shifts including after input ${measured.all.toFixed(4)}`;
      test.info().annotations.push({ type: "CLS", description });
      console.log(description);
      // Shifts right after a click or key press are left out of CLS, so the
      // total including them is held to the same budget.
      expect(measured.cls, state).toBeLessThanOrEqual(0.1);
      expect(measured.all, state).toBeLessThanOrEqual(0.1);
    }
  });
});

test.describe("a narrow picture with a long description, on a phone", () => {
  test.use({ viewport: { width: 375, height: 667 } });
  const NARROW_ALT =
    "Fixture long description of a tall, narrow picture: a lighthouse painted in white and red stripes standing on dark rocks, with a small keeper's cottage at its foot and a wide grey sea stretching to the horizon behind it under a cloudy sky.";

  /** Whether each part of the failure panel is fully inside the frame and the screen. */
  function failurePanel(page: Page) {
    return page.evaluate(() => {
      const rect = (element: Element | null) =>
        element?.getBoundingClientRect();
      const frame = rect(document.querySelector(".slide-image"));
      const inside = (element: Element | null) => {
        const box = rect(element);
        return (
          box !== undefined &&
          frame !== undefined &&
          box.top >= frame.top &&
          box.bottom <= frame.bottom &&
          box.left >= frame.left &&
          box.right <= frame.right &&
          box.top >= 0 &&
          box.bottom <= window.innerHeight &&
          box.left >= 0 &&
          box.right <= document.documentElement.clientWidth
        );
      };
      const button = document.querySelector(".slide-image__failed button");
      const buttonBox = rect(button);
      return {
        messageVisible: inside(document.querySelector(".slide-image__message")),
        buttonVisible: inside(button),
        buttonSize: [buttonBox?.width ?? 0, buttonBox?.height ?? 0],
        frameWidth: frame?.width ?? 0,
      };
    });
  }

  test("the message and Retry fit; the description can be scrolled to; Retry works by keyboard", async ({
    page,
  }) => {
    const network = await pictures(page, "fail");
    await open(page, "reveal-narrow");
    const panel = page.locator(".slide-image__failed");
    await expect(panel.getByText(ui.slides.image.failed)).toBeVisible();

    const facts = await failurePanel(page);
    expect(facts.messageVisible).toBe(true);
    expect(facts.buttonVisible).toBe(true);
    expect(facts.buttonSize[0]).toBeGreaterThanOrEqual(44);
    expect(facts.buttonSize[1]).toBeGreaterThanOrEqual(44);

    // The whole description is reachable by keyboard: the panel takes
    // focus and End scrolls it until the last line is inside the panel.
    await retryButton(page).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(panel).toBeFocused();
    expect(await focusRing(page)).toEqual({ style: "solid", width: 4 });
    const overflows = await panel.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    );
    expect(overflows).toBe(true);
    await page.keyboard.press("End");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const box = document
            .querySelector(".slide-image__failed")
            ?.getBoundingClientRect();
          const text = document
            .querySelector(".slide-image__alt")
            ?.getBoundingClientRect();
          return (
            box !== undefined &&
            text !== undefined &&
            text.bottom <= box.bottom + 1
          );
        }),
      )
      .toBe(true);
    await expect(position(page)).toHaveText("Slide 5 of 6");

    // Keyboard: from Reveal back to Retry, then Enter once the picture is back.
    await revealButton(page).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(retryButton(page)).toBeFocused();
    network.set("serve");
    await page.keyboard.press("Enter");
    await expect(page.getByAltText(NARROW_ALT)).toBeVisible();
    await expect(page.getByAltText(NARROW_ALT)).toBeFocused();
  });

  test("the frame and Reveal stay put while loading, failed, retrying and recovered", async ({
    page,
  }) => {
    const network = await pictures(page, "hold");
    await open(page, "reveal-narrow");
    const loading = await geometry(page);
    await network.release();
    await expect(page.getByAltText(NARROW_ALT)).toBeVisible();
    expect(await geometry(page)).toEqual(loading);

    network.set("fail");
    await open(page, "reveal-narrow");
    await expect(retryButton(page)).toBeVisible();
    expect(await geometry(page)).toEqual(loading);

    network.set("hold");
    await retryButton(page).click();
    await expect(
      page.getByRole("button", { name: ui.slides.image.retrying }),
    ).toBeVisible();
    expect(await geometry(page)).toEqual(loading);

    await network.release();
    await expect(page.getByAltText(NARROW_ALT)).toBeVisible();
    expect(await geometry(page)).toEqual(loading);

    // The picture itself keeps its own narrow shape inside the frame.
    const shown = await page
      .getByAltText(NARROW_ALT)
      .evaluate(
        (image: HTMLImageElement) => image.naturalWidth / image.naturalHeight,
      );
    expect(shown).toBeCloseTo(120 / 480, 2);
    const slideScrolls = await page.evaluate(() => {
      const area = document.querySelector(".player__slide");
      return area !== null && area.scrollHeight > area.clientHeight + 1;
    });
    expect(slideScrolls).toBe(false);
    await expectNoBlockingAxe(page);
  });
});

for (const viewport of viewports) {
  const expectedFile = viewport.variant;
  test.describe(`on a ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test(`picks the ${expectedFile} variant, with the original's shape`, async ({
      page,
    }) => {
      await pictures(page);
      await open(page, "reveal-variants");
      const picture = page.getByAltText(ALT);
      await expect(picture).toBeVisible();
      const chosen = await picture.evaluate((image: HTMLImageElement) => ({
        file: image.currentSrc.split("/").pop(),
        shape: image.naturalWidth / image.naturalHeight,
      }));
      expect(chosen.file).toBe(expectedFile);
      // Chrome scales the natural size by the chosen density, so allow rounding.
      expect(chosen.shape).toBeCloseTo(1600 / 1200, 2);
    });

    for (const slide of ["weather", "reveal"]) {
      test(`${slide} fits, with large targets, readable text and no axe issues`, async ({
        page,
      }) => {
        await pictures(page);
        await open(page, slide);
        if (slide === "reveal") {
          await expect(page.getByAltText(ALT)).toBeVisible();
          await revealButton(page).click();
          await expect(page.getByText("Fixture answer")).toBeVisible();
        }
        const facts = await page.evaluate(() => {
          const root = document.documentElement;
          const area = document.querySelector(".player__slide");
          const visible = (element: Element) => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.height > 0;
          };
          return {
            horizontalScroll: root.scrollWidth > root.clientWidth,
            pageScrolls: root.scrollHeight > window.innerHeight,
            slideScrolls:
              area !== null && area.scrollHeight > area.clientHeight + 1,
            targets: [...document.querySelectorAll("button, a, input")]
              .filter(visible)
              .map((element) => {
                const box = element.getBoundingClientRect();
                return {
                  name: element.textContent,
                  width: box.width,
                  height: box.height,
                };
              }),
            texts: [
              ...document.querySelectorAll(
                ".slide h2, .slide p, .thermometer__label, button",
              ),
            ]
              .filter(visible)
              .map((element) => ({
                text: element.textContent,
                size: parseFloat(getComputedStyle(element).fontSize),
              })),
          };
        });
        expect(facts.horizontalScroll).toBe(false);
        expect(facts.pageScrolls).toBe(false);
        expect(facts.slideScrolls).toBe(false);
        for (const target of facts.targets) {
          expect(target.width, target.name).toBeGreaterThanOrEqual(44);
          expect(target.height, target.name).toBeGreaterThanOrEqual(44);
        }
        for (const text of facts.texts) {
          expect(text.size, text.text).toBeGreaterThanOrEqual(24);
        }
        await expectNoBlockingAxe(page);
      });
    }
  });
}
