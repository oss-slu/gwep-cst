import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";
import site from "../../content/site.json" with { type: "json" };

// Runs against the test-only player page (tests/visual/player.tsx), which
// renders the real player in React Strict Mode on the dev server, so every
// test here also checks that audio works after Strict Mode's extra effect
// cycle. The clips are silent test MP3s from tests/fixtures/media (made by
// tests/support/make-silent-mp3.mjs) that really play and end in Chromium.
const PLAYER = "http://localhost:4175/tests/visual/player.html";
const { sound } = site.ui.slides;
const SHORT = "Fixture short sound"; // 1 second
const LONG = "Fixture long sound"; // 10 seconds
const THIRD = "Fixture third sound"; // 1 second

type ClipMode = "serve" | "fail" | "hold";

/** Serves the fixture clips; "fail" aborts and "hold" delays until release(). */
async function clips(page: Page) {
  let mode: ClipMode = "serve";
  const requests: string[] = [];
  const held: Route[] = [];
  const serve = (route: Route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    return route.fulfill({
      contentType: "audio/mpeg",
      body: readFileSync(`tests/fixtures/media/${name}`),
    });
  };
  await page.route("**/media/test/*.mp3", async (route) => {
    requests.push(new URL(route.request().url()).pathname);
    if (mode === "fail") await route.abort("internetdisconnected");
    else if (mode === "hold") held.push(route);
    else await serve(route);
  });
  return {
    requests,
    set: (next: ClipMode) => {
      mode = next;
    },
    release: async () => {
      mode = "serve";
      await Promise.all(held.splice(0).map(serve));
    },
  };
}

/**
 * Records every audio element the page creates, and the listeners still
 * attached to each, so tests can check that elements are released.
 */
async function trackAudio(page: Page) {
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    const created: { element: HTMLAudioElement; listeners: number }[] = [];
    class TrackedAudio extends NativeAudio {
      constructor(src?: string) {
        super(src);
        const record = { element: this as HTMLAudioElement, listeners: 0 };
        created.push(record);
        const add = this.addEventListener.bind(this);
        const remove = this.removeEventListener.bind(this);
        this.addEventListener = (...args: Parameters<typeof add>) => {
          record.listeners += 1;
          add(...args);
        };
        this.removeEventListener = (...args: Parameters<typeof remove>) => {
          record.listeners -= 1;
          remove(...args);
        };
      }
    }
    Object.assign(window, { Audio: TrackedAudio, createdAudio: created });
  });
}

/** For each created element: playing, released, and listeners left. */
function audioElements(page: Page) {
  return page.evaluate(() =>
    (
      window as unknown as {
        createdAudio: { element: HTMLAudioElement; listeners: number }[];
      }
    ).createdAudio.map(({ element, listeners }) => ({
      src: element.getAttribute("src"),
      playing: !element.paused && element.currentTime > 0,
      released: element.paused && !element.hasAttribute("src"),
      listeners,
    })),
  );
}

async function open(page: Page) {
  await page.goto(`${PLAYER}?slide=sounds`);
  await expect(page.locator(".sounds")).toBeVisible();
}

const clipButton = (page: Page, description: string) =>
  page
    .getByRole("listitem")
    .filter({ hasText: description })
    .getByRole("button");

async function expectAccessibleName(
  page: Page,
  description: string,
  name: string,
) {
  await expect(clipButton(page, description)).toHaveAccessibleName(name);
}

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

/** Waits until the clip really plays: unpaused with time moving. */
async function expectPlaying(page: Page, src: string) {
  await expect
    .poll(async () =>
      (await audioElements(page)).some(
        (element) => element.src === src && element.playing,
      ),
    )
    .toBe(true);
}

async function expectAllReleased(page: Page) {
  const elements = await audioElements(page);
  expect(elements.length).toBeGreaterThan(0);
  for (const element of elements) {
    expect(element).toMatchObject({ released: true, listeners: 0 });
  }
}

test.beforeEach(async ({ page }) => {
  await trackAudio(page);
});

test("nothing downloads or plays before Play; every clip shows its description and Play", async ({
  page,
}) => {
  const network = await clips(page);
  await open(page);
  for (const description of [SHORT, LONG, THIRD]) {
    await expect(page.getByText(description)).toBeVisible();
    await expectAccessibleName(page, description, sound.play);
  }
  await page.waitForTimeout(500);
  expect(network.requests).toEqual([]);
  expect(await audioElements(page)).toEqual([]);
  expect(await page.locator("audio").count()).toBe(0);
  // No "A, B, C" labels.
  expect(await page.locator(".sounds").innerText()).not.toMatch(/\b[ABC]\b/);
  await expectNoBlockingAxe(page);
});

test("by keyboard: Enter plays to the natural end, keeping focus and releasing the element", async ({
  page,
}) => {
  await clips(page);
  await open(page);
  await page.keyboard.press("Tab");
  const button = clipButton(page, SHORT);
  await expect(button).toBeFocused();
  const ring = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement ?? document.body);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(ring).toEqual({ style: "solid", width: 4 });

  await page.keyboard.press("Enter");
  await expectAccessibleName(page, SHORT, sound.stop);
  await expectPlaying(page, "/media/test/sound-short.mp3");
  // The 1-second clip ends by itself and the button returns to Play.
  await expectAccessibleName(page, SHORT, sound.play);
  await expect(button).toBeFocused();
  await expectAllReleased(page);
});

test("by keyboard: Space plays and Space stops", async ({ page }) => {
  await clips(page);
  await open(page);
  await clipButton(page, LONG).focus();
  await page.keyboard.press("Space");
  await expectPlaying(page, "/media/test/sound-long.mp3");
  await page.keyboard.press("Space");
  await expectAccessibleName(page, LONG, sound.play);
  await expect(clipButton(page, LONG)).toBeFocused();
  await expectAllReleased(page);
});

test("starting another clip stops and releases the first", async ({ page }) => {
  await clips(page);
  await open(page);
  await clipButton(page, LONG).click();
  await expectPlaying(page, "/media/test/sound-long.mp3");
  await clipButton(page, THIRD).click();
  await expectPlaying(page, "/media/test/sound-third.mp3");
  await expectAccessibleName(page, LONG, sound.play);
  const elements = await audioElements(page);
  expect(elements.filter((element) => !element.released)).toHaveLength(1);
  expect(elements[0]).toMatchObject({ released: true, listeners: 0 });
});

test("repeated playback keeps at most one live element and releases them all", async ({
  page,
}) => {
  await clips(page);
  await open(page);
  for (let round = 0; round < 6; round += 1) {
    const description = [LONG, THIRD, SHORT][round % 3] ?? LONG;
    await clipButton(page, description).click();
    await expectAccessibleName(page, description, sound.stop);
    const live = (await audioElements(page)).filter(
      (element) => !element.released,
    );
    expect(live.length).toBeLessThanOrEqual(1);
  }
  await clipButton(page, SHORT).click();
  await expectAccessibleName(page, SHORT, sound.play);
  expect(await audioElements(page)).toHaveLength(6);
  await expectAllReleased(page);
});

test("leaving the slide stops the sound and releases the element", async ({
  page,
}) => {
  await clips(page);
  await open(page);
  await clipButton(page, LONG).click();
  await expectPlaying(page, "/media/test/sound-long.mp3");

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.locator(".player__position")).toHaveText("Slide 7 of 7");
  await expectAllReleased(page);

  // Coming back and playing again works, and leaving by key releases it too.
  await page.getByRole("button", { name: "Previous" }).click();
  await clipButton(page, LONG).click();
  await expectPlaying(page, "/media/test/sound-long.mp3");
  await page.locator(".player__slide").focus();
  await page.keyboard.press("PageUp");
  await expect(page.locator(".player__position")).toHaveText("Slide 5 of 7");
  await expectAllReleased(page);
});

test("a download that finishes after leaving the slide changes nothing", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const network = await clips(page);
  network.set("hold");
  await open(page);
  await clipButton(page, LONG).click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.locator(".player__position")).toHaveText("Slide 7 of 7");

  await network.release();
  await page.waitForTimeout(500);
  await expect(page.locator(".player__position")).toHaveText("Slide 7 of 7");
  await expectAllReleased(page);
  expect((await audioElements(page)).some((element) => element.playing)).toBe(
    false,
  );
  expect(errors).toEqual([]);
});

test("a failed clip explains itself; Try again recovers with focus on the same button", async ({
  page,
}) => {
  const network = await clips(page);
  network.set("fail");
  await open(page);
  const button = clipButton(page, LONG);
  await button.focus();
  const handle = await button.elementHandle();
  await page.keyboard.press("Enter");

  const card = page.getByRole("listitem").filter({ hasText: LONG });
  await expect(card.getByText(sound.failed)).toBeVisible();
  await expectAccessibleName(page, LONG, sound.retry);
  await expect(button).toBeFocused();
  await expectNoBlockingAxe(page);
  await expectAllReleased(page);

  network.set("serve");
  await page.keyboard.press("Enter");
  await expectPlaying(page, "/media/test/sound-long.mp3");
  await expectAccessibleName(page, LONG, sound.stop);
  await expect(card.getByText(sound.failed)).toHaveCount(0);
  // Still the same button element, still focused.
  expect(
    await handle.evaluate((element) => element === document.activeElement),
  ).toBe(true);
});

test("Stop works while a clip is still loading, and the late download changes nothing", async ({
  page,
}) => {
  const network = await clips(page);
  network.set("hold");
  await open(page);
  await clipButton(page, LONG).click();
  const card = page.getByRole("listitem").filter({ hasText: LONG });
  await expect(card.getByText(sound.loading)).toBeVisible();
  await expectAccessibleName(page, LONG, sound.stop);

  await clipButton(page, LONG).click();
  await expectAccessibleName(page, LONG, sound.play);
  await expectAllReleased(page);

  await network.release();
  await page.waitForTimeout(500);
  await expectAccessibleName(page, LONG, sound.play);
  await expect(card.getByText(sound.loading)).toHaveCount(0);
  await expectAllReleased(page);
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 667 } });

  test("one tap plays and one tap stops", async ({ page }) => {
    await clips(page);
    await open(page);
    await clipButton(page, LONG).tap();
    await expectPlaying(page, "/media/test/sound-long.mp3");
    await clipButton(page, LONG).tap();
    await expectAccessibleName(page, LONG, sound.play);
    await expectAllReleased(page);
  });
});

for (const viewport of [
  { name: "phone", width: 375, height: 667 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "shared screen", width: 1920, height: 1080 },
]) {
  test.describe(`on a ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("large targets, readable text, no axe issues, and every clip within reach", async ({
      page,
    }) => {
      await clips(page);
      await open(page);
      const facts = await page.evaluate(() => {
        const root = document.documentElement;
        const slide = document.querySelector(".player__slide .slide");
        const style = slide === null ? null : getComputedStyle(slide);
        const children = slide === null ? [] : [...slide.children];
        const used =
          style === null
            ? 0
            : children.reduce(
                (sum, child) => sum + child.getBoundingClientRect().height,
                0,
              ) +
              parseFloat(style.paddingTop) +
              parseFloat(style.paddingBottom) +
              parseFloat(style.rowGap) * (children.length - 1);
        return {
          horizontalScroll: root.scrollWidth > root.clientWidth,
          spareHeight: (slide?.clientHeight ?? 0) - used,
          targets: [...document.querySelectorAll("button, a")].map(
            (element) => {
              const box = element.getBoundingClientRect();
              return {
                name: element.textContent,
                width: box.width,
                height: box.height,
              };
            },
          ),
          texts: [
            ...document.querySelectorAll(".slide h2, .slide p, button"),
          ].map((element) => ({
            text: element.textContent,
            size: parseFloat(getComputedStyle(element).fontSize),
          })),
        };
      });
      expect(facts.horizontalScroll).toBe(false);
      if (viewport.name === "phone") {
        // Up to six clips cannot always fit a phone, so the slide area may
        // scroll there. Each clip's button must come into view when Tab
        // reaches it, and the area scrolls with the down arrow (the player
        // uses only left, right and the page keys).
        await page.locator(".player__slide").focus();
        for (const description of [SHORT, LONG, THIRD]) {
          await page.keyboard.press("Tab");
          const button = clipButton(page, description);
          await expect(button).toBeFocused();
          await expect(button).toBeInViewport({ ratio: 1 });
        }
        await page.locator(".player__slide").evaluate((area) => {
          area.scrollTop = 0;
        });
        await page.locator(".player__slide").focus();
        const before = await page
          .locator(".player__slide")
          .evaluate((area) => area.scrollTop);
        await page.keyboard.press("ArrowDown");
        await expect
          .poll(() =>
            page.locator(".player__slide").evaluate((area) => area.scrollTop),
          )
          .not.toBe(before);
        await expect(page.locator(".player__position")).toHaveText(
          "Slide 6 of 7",
        );
      } else {
        // Text metrics differ between systems (CI runs on Linux).
        expect(facts.spareHeight).toBeGreaterThanOrEqual(16);
      }
      for (const target of facts.targets) {
        expect(target.width, target.name).toBeGreaterThanOrEqual(44);
        expect(target.height, target.name).toBeGreaterThanOrEqual(44);
      }
      for (const text of facts.texts) {
        expect(text.size, text.text).toBeGreaterThanOrEqual(24);
      }
      await expectNoBlockingAxe(page);
    });
  });
}
