import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import orientation from "../../content/sessions/orientation.json" with { type: "json" };
import site from "../../content/site.json" with { type: "json" };

// The M0 demo, end to end, on the production build: the Orientation session
// with its real placeholder media from public/media/orientation/.
const { ui } = site;
const SEQUENCE = [
  ["welcome", "title"],
  ["day", "calendar-day"],
  ["month", "calendar-month"],
  ["year", "calendar-year"],
  ["weather", "weather"],
  ["sounds", "sounds"],
  ["landmark-state", "reveal"],
  ["landmark-country", "reveal"],
  ["food-countries", "reveal"],
  ["clothing-countries", "reveal"],
  ["closing", "title"],
] as const;
const total = SEQUENCE.length;
const path = (id: string) => `/sessions/orientation/${id}`;

/** The four GWEP prompts, read from docs/PROJECT_CONTEXT.md §10. */
function gwepPrompts(): string[] {
  const context = readFileSync("docs/PROJECT_CONTEXT.md", "utf8");
  const section =
    context.split("### Orientation reveal prompts (verbatim)")[1] ?? "";
  return [...section.matchAll(/^[1-4]\. (.+)$/gm)]
    .slice(0, 4)
    .map((match) => match[1] ?? "");
}

async function expectSlide(page: Page, n: number) {
  const [id] = SEQUENCE[n - 1] ?? [""];
  await expect(page).toHaveURL(path(id));
  await expect(page.locator(".player__position")).toHaveText(
    `Slide ${String(n)} of ${String(total)}`,
  );
  await expect(page.locator(".player__slide .slide")).toBeVisible();
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

/** Records every audio element the page creates, as in sounds.spec.ts. */
async function trackAudio(page: Page) {
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    const created: HTMLAudioElement[] = [];
    class TrackedAudio extends NativeAudio {
      constructor(src?: string) {
        super(src);
        created.push(this);
      }
    }
    Object.assign(window, { Audio: TrackedAudio, createdAudio: created });
  });
}

function audioElements(page: Page) {
  return page.evaluate(() =>
    (
      window as unknown as { createdAudio: HTMLAudioElement[] }
    ).createdAudio.map((element) => ({
      src: element.getAttribute("src"),
      playing: !element.paused && element.currentTime > 0,
      released: element.paused && !element.hasAttribute("src"),
    })),
  );
}

/** Media requests (pictures and sounds) the page makes. */
function recordMedia(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith("/media/")) requests.push(pathname);
  });
  return requests;
}

test("the session list opens the exact demo sequence, one slide at a time", async ({
  page,
}) => {
  expect(orientation.slides.map((slide) => [slide.id, slide.type])).toEqual(
    SEQUENCE,
  );
  await page.goto("/");
  await page.getByRole("link", { name: "Orientation" }).click();
  for (let n = 1; n <= total; n += 1) {
    await expectSlide(page, n);
    await expect(page.locator(".slide")).toHaveCount(1);
    const [, type] = SEQUENCE[n - 1] ?? ["", ""];
    const slide = page.locator(".player__slide");
    if (type === "weather")
      await expect(slide.getByRole("slider")).toBeVisible();
    if (type === "sounds")
      await expect(
        slide.getByRole("button", { name: ui.slides.sound.play }),
      ).toHaveCount(3);
    if (type === "reveal")
      await expect(
        slide.getByRole("button", { name: ui.slides.reveal.show }),
      ).toBeVisible();
    if (type.startsWith("calendar"))
      await expect(slide.locator(".calendar__value")).toBeVisible();
    if (n < total) await page.keyboard.press("ArrowRight");
  }
});

test("each existing and new slide id opens directly", async ({ page }) => {
  for (const [n, [id]] of SEQUENCE.entries()) {
    await page.goto(path(id));
    await expectSlide(page, n + 1);
  }
});

test("the four GWEP prompts appear verbatim and in order, with placeholder pictures and answers shown only after Reveal", async ({
  page,
}) => {
  const prompts = gwepPrompts();
  expect(prompts).toEqual([
    "What state is the famous landmark located?",
    "The famous landmark is located in what country?",
    "What countries are known for this food?",
    "What country is known for this type of clothing?",
  ]);
  await page.goto(path("landmark-state"));
  for (const [index, prompt] of prompts.entries()) {
    await expectSlide(page, 7 + index);
    const slide = page.locator(".player__slide");
    await expect(slide.getByRole("heading", { level: 2 })).toHaveText(prompt);
    const picture = slide.getByRole("img");
    await expect(picture).toBeVisible();
    await expect(picture).toHaveAttribute(
      "alt",
      /^Placeholder picture \d for .+GWEP will supply the real photograph\.$/,
    );
    expect(
      await picture.evaluate((image: HTMLImageElement) => image.currentSrc),
    ).toMatch(
      new RegExp(
        `/media/orientation/placeholder-${String(index + 1)}(-\\d+)?\\.png$`,
      ),
    );
    await expect(slide.getByText("Placeholder answer")).toHaveCount(0);
    await slide
      .getByRole("button", { name: ui.slides.reveal.show })
      .press("Enter");
    await expect(
      slide.getByText("Placeholder answer: GWEP will supply the real answer."),
    ).toBeVisible();
    if (index === 0) await expectNoBlockingAxe(page);
    if (index < 3)
      await page.getByRole("button", { name: ui.player.next }).click();
  }
});

test("every sound is a labelled placeholder that plays only on request", async ({
  page,
}) => {
  await trackAudio(page);
  const media = recordMedia(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Orientation" }).click();
  for (let n = 1; n < 6; n += 1) {
    await expectSlide(page, n);
    await page.keyboard.press("ArrowRight");
  }
  await expectSlide(page, 6);
  await page.waitForLoadState("networkidle");
  // Walking to the Sounds slide downloaded no audio, and none is playing.
  expect(media.filter((file) => file.endsWith(".mp3"))).toEqual([]);
  expect(await audioElements(page)).toEqual([]);
  for (const description of [
    "Placeholder sound: a bell-like chime",
    "Placeholder sound: soft knocking",
    "Placeholder sound: a rising whistle",
  ]) {
    await expect(page.getByText(description)).toBeVisible();
  }

  const chime = page
    .getByRole("listitem")
    .filter({ hasText: "chime" })
    .getByRole("button");
  await chime.press("Enter");
  await expect
    .poll(async () =>
      (await audioElements(page)).some((element) => element.playing),
    )
    .toBe(true);
  await expectNoBlockingAxe(page);

  // Leaving the slide stops the sound and releases the element.
  await page.getByRole("button", { name: ui.player.next }).click();
  await expectSlide(page, 7);
  const elements = await audioElements(page);
  expect(elements).toHaveLength(1);
  expect(elements[0]).toMatchObject({ playing: false, released: true });
});

test("the next slide's picture is preloaded without mounting it, and audio never is", async ({
  page,
}) => {
  const media = recordMedia(page);
  await page.goto(path("sounds"));
  await expectSlide(page, 6);
  await expect
    .poll(() =>
      media.some((file) => file.startsWith("/media/orientation/placeholder-1")),
    )
    .toBe(true);
  expect(
    media.filter((file) => file.startsWith("/media/orientation/placeholder-2")),
  ).toEqual([]);
  expect(media.filter((file) => file.endsWith(".mp3"))).toEqual([]);
  await expect(page.locator(".slide")).toHaveCount(1);
  await expect(page.locator("img")).toHaveCount(0);

  await page.getByRole("button", { name: ui.player.next }).click();
  await expectSlide(page, 7);
  await expect(page.getByRole("img")).toBeVisible();
  await expect
    .poll(() =>
      media.some((file) => file.startsWith("/media/orientation/placeholder-2")),
    )
    .toBe(true);
  expect(
    media.filter((file) => file.startsWith("/media/orientation/placeholder-3")),
  ).toEqual([]);
});

test("a picture whose preload and load both fail shows Retry, which recovers", async ({
  page,
}) => {
  let failing = true;
  await page.route("**/media/orientation/placeholder-1*.png", async (route) => {
    if (failing) await route.abort("internetdisconnected");
    else await route.fallback();
  });
  await page.goto(path("sounds"));
  await page.getByRole("button", { name: ui.player.next }).click();
  await expectSlide(page, 7);
  const retry = page.getByRole("button", { name: ui.slides.image.retry });
  await expect(retry).toBeVisible();
  await expect(page.getByText(/^Placeholder picture 1 for/)).toBeVisible();
  await expectNoBlockingAxe(page);

  failing = false;
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("img")).toBeVisible();
  await expect(page.getByRole("img")).toBeFocused();
});

test("a picture whose preload failed still loads when its slide opens", async ({
  page,
}) => {
  let failures = 0;
  await page.route("**/media/orientation/placeholder-1*.png", async (route) => {
    if (failures === 0) {
      failures += 1;
      await route.abort("internetdisconnected");
    } else {
      await route.fallback();
    }
  });
  await page.goto(path("sounds"));
  await expect.poll(() => failures).toBe(1);
  await page.getByRole("button", { name: ui.player.next }).click();
  await expectSlide(page, 7);
  await expect(page.getByRole("img")).toBeVisible();
  await expect(
    page.getByRole("button", { name: ui.slides.image.retry }),
  ).toHaveCount(0);
});

test("a sound that fails offers Try again, which plays it once the file is back", async ({
  page,
}) => {
  await trackAudio(page);
  let failing = true;
  await page.route(
    "**/media/orientation/placeholder-knock.mp3",
    async (route) => {
      if (failing) await route.abort("internetdisconnected");
      else await route.fallback();
    },
  );
  await page.goto(path("sounds"));
  const knock = page.getByRole("listitem").filter({ hasText: "knocking" });
  await knock.getByRole("button").click();
  await expect(knock.getByText(ui.slides.sound.failed)).toBeVisible();
  await expect(knock.getByRole("button")).toHaveAccessibleName(
    ui.slides.sound.retry,
  );
  await expect(knock.getByRole("button")).toBeFocused();

  failing = false;
  await page.keyboard.press("Enter");
  await expect
    .poll(async () =>
      (await audioElements(page)).some((element) => element.playing),
    )
    .toBe(true);
  await expect(knock.getByRole("button")).toHaveAccessibleName(
    ui.slides.sound.stop,
  );
});

test("the whole demo works by keyboard alone", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: site.name }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Orientation" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expectSlide(page, 1);
  for (let n = 2; n <= total; n += 1) {
    await page.keyboard.press("PageDown");
    await expectSlide(page, n);
    const [id] = SEQUENCE[n - 1] ?? [""];
    if (id === "weather") {
      await page.keyboard.press("Tab");
      await expect(page.getByRole("slider")).toBeFocused();
      await page.keyboard.press("ArrowUp");
      await expect(page.getByRole("slider")).toHaveAttribute(
        "aria-valuetext",
        "Warm",
      );
      await expectSlide(page, n);
    }
    if (id === "landmark-state") {
      await page.getByRole("button", { name: ui.slides.reveal.show }).focus();
      await page.keyboard.press("Space");
      await expect(
        page.getByText("Placeholder answer: GWEP will supply the real answer."),
      ).toBeVisible();
    }
  }
  await page.keyboard.press("PageUp");
  await expectSlide(page, total - 1);
});
