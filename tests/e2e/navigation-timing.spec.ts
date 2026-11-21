import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Measures player navigation through the Orientation demo on the production
// build. This is evidence for M0-09, not a gate: the formal M0 INP status is
// Not Tested (target 200 ms or less, docs/design/M0_DESIGN.md §4.1), so the
// test only checks that measurements were captured, and reports them.
//
// - Interactions come from the Event Timing API (durationThreshold 16 ms,
//   the lowest allowed). Entries are grouped by interactionId and the
//   longest entry per interaction is kept, as INP does. Interactions faster
//   than 16 ms produce no entry, so fewer may be captured than performed.
// - Slide-ready latency is measured separately: from the input to the new
//   slide's element being in the page, since an interaction can paint a
//   loading state before the slide appears.

const THRESHOLD_MS = 16;

async function instrument(page: Page) {
  await page.addInitScript((threshold: number) => {
    const interactions = new Map<number, { name: string; duration: number }>();
    const ready: number[] = [];
    let inputAt: number | undefined;
    let shownSlide: Element | null = null;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[]) {
        // 0 means the event is not part of a user interaction.
        const id = entry.interactionId;
        if (id === 0) continue;
        const known = interactions.get(id);
        if (known === undefined || entry.duration > known.duration) {
          interactions.set(id, { name: entry.name, duration: entry.duration });
        }
      }
    }).observe({
      type: "event",
      durationThreshold: threshold,
      buffered: true,
    } as PerformanceObserverInit);
    for (const type of ["pointerdown", "keydown"]) {
      addEventListener(
        type,
        () => {
          inputAt = performance.now();
        },
        { capture: true },
      );
    }
    new MutationObserver(() => {
      const slide = document.querySelector(".player__slide .slide");
      if (slide !== null && slide !== shownSlide) {
        shownSlide = slide;
        if (inputAt !== undefined) ready.push(performance.now() - inputAt);
        inputAt = undefined;
      }
    }).observe(document, { childList: true, subtree: true });
    Object.assign(window, {
      navigationTiming: () => ({
        interactions: [...interactions.values()],
        ready,
      }),
    });
  }, THRESHOLD_MS);
}

interface Profile {
  readonly name: string;
  readonly viewport: { width: number; height: number };
  readonly cpuSlowdown: number;
}

const PROFILES: readonly Profile[] = [
  {
    name: "desktop, 1920 x 1080, no CPU slowdown",
    viewport: { width: 1920, height: 1080 },
    cpuSlowdown: 1,
  },
  {
    name: "phone, 375 x 667, CPU slowed 4x",
    viewport: { width: 375, height: 667 },
    cpuSlowdown: 4,
  },
];

const results: Record<string, unknown>[] = [];

for (const profile of PROFILES) {
  test.describe(profile.name, () => {
    test.use({ viewport: profile.viewport });

    test("player navigation timing through the demo", async ({
      page,
      browser,
    }) => {
      await instrument(page);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", {
        rate: profile.cpuSlowdown,
      });

      await page.goto("/");
      await expect(
        page.getByRole("link", { name: "Orientation" }),
      ).toBeVisible();
      const steps: string[] = [];
      await page.getByRole("link", { name: "Orientation" }).click();
      steps.push("click Orientation in the list");
      const position = page.locator(".player__position");
      const waitFor = (n: number) =>
        expect(position).toHaveText(`Slide ${String(n)} of 11`);
      await waitFor(1);
      // Moves 1 to 11, alternating Next clicks, Right arrow and Page Down,
      // with one thermometer change and one Reveal on the way.
      for (let n = 2; n <= 11; n += 1) {
        const method = n % 3;
        if (method === 0) {
          await page.getByRole("button", { name: "Next" }).click();
          steps.push(`click Next to slide ${String(n)}`);
        } else if (method === 1) {
          await page.keyboard.press("ArrowRight");
          steps.push(`Right arrow to slide ${String(n)}`);
        } else {
          await page.keyboard.press("PageDown");
          steps.push(`Page Down to slide ${String(n)}`);
        }
        await waitFor(n);
        await expect(page.locator(".player__slide .slide")).toBeVisible();
        if (n === 5) {
          await page.getByRole("slider").focus();
          await page.keyboard.press("ArrowUp");
          steps.push("Up arrow on the thermometer");
        }
        if (n === 7) {
          await page.getByRole("button", { name: "Reveal answer" }).click();
          steps.push("click Reveal answer");
          await page.locator(".player__slide").focus();
        }
      }
      // Let the last entries arrive.
      await page.waitForTimeout(500);
      const timing = await page.evaluate(() =>
        (
          window as unknown as {
            navigationTiming: () => {
              interactions: { name: string; duration: number }[];
              ready: number[];
            };
          }
        ).navigationTiming(),
      );
      const worst = Math.max(
        0,
        ...timing.interactions.map((entry) => entry.duration),
      );
      const sortedReady = [...timing.ready].sort((a, b) => a - b);
      const result = {
        profile: profile.name,
        browser: `Chromium ${browser.version()} (Playwright)`,
        performed: steps.length,
        steps,
        thresholdMs: THRESHOLD_MS,
        captured: timing.interactions.length,
        worstInteractionMs: Math.round(worst),
        interactions: timing.interactions.map(
          (entry) => `${entry.name} ${String(Math.round(entry.duration))} ms`,
        ),
        slideReadyMs: {
          count: sortedReady.length,
          median: Math.round(
            sortedReady[Math.floor(sortedReady.length / 2)] ?? 0,
          ),
          max: Math.round(sortedReady.at(-1) ?? 0),
        },
      };
      results.push(result);
      console.log(`NAVIGATION ${JSON.stringify(result)}`);
      test.info().annotations.push({
        type: "navigation timing",
        description: JSON.stringify(result),
      });
      expect(timing.ready.length).toBeGreaterThanOrEqual(10);
    });
  });
}

test.afterAll(() => {
  if (results.length > 0) {
    writeFileSync(
      "test-results/navigation-timing.json",
      `${JSON.stringify(results, null, 2)}\n`,
    );
  }
});
